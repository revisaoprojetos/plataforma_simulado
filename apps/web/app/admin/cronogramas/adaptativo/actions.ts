'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import {
  lerCfgLiberacao, salvarCfgLiberacao, mapaDocsCronograma, simularLiberacaoAluno, normalizarCfg, hojeBrt,
  type CfgLiberacao, type MotivoLiberacao,
} from '@/lib/cronograma/adaptativo/liberacao'

async function acesso(acao: 'view' | 'update') {
  const a = await getCurrentAccess()
  const permitido = a.isAdmin || a.permissions.includes('*') || a.permissions.includes(`cronogramas:${acao}`)
  if (!a.tenantId || !permitido) return null
  return { tenantId: a.tenantId, userId: a.userId ?? null }
}

export interface PainelLiberacao {
  cfg: CfgLiberacao
  hoje: string
  conteudo: { aulas: number; legproc: number; materiais: number }
  alunosComPlano: number
  grupos: { id: string; nome: string }[]
  alunosExcecao: { id: string; nome: string; email: string | null }[]
}

export async function obterPainelLiberacao(): Promise<{ ok: boolean; error?: string; painel?: PainelLiberacao }> {
  const g = await acesso('view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  try {
    const [cfg, mapa, planos, grp] = await Promise.all([
      lerCfgLiberacao(svc, g.tenantId),
      mapaDocsCronograma(svc, g.tenantId),
      svc.from('simulado_cronograma_adaptativo_plano').select('estudante_id').eq('tenant_id', g.tenantId).eq('arquivada', false).eq('exemplo', false),
      svc.from('simulado_grupos').select('id, nome').eq('tenant_id', g.tenantId).order('nome', { ascending: true }).limit(1000),
    ])
    const alunosComPlano = new Set(((planos.data ?? []) as Array<{ estudante_id: string }>).map((p) => p.estudante_id)).size
    let alunosExcecao: PainelLiberacao['alunosExcecao'] = []
    if (cfg.alunos.length) {
      const { data } = await svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', g.tenantId).in('id', cfg.alunos)
      alunosExcecao = ((data ?? []) as Array<{ id: string; nome: string | null; email: string | null }>).map((e) => ({ id: e.id, nome: e.nome || 'Aluno', email: e.email }))
    }
    return {
      ok: true,
      painel: {
        cfg, hoje: hojeBrt(),
        conteudo: { aulas: mapa.aulas, legproc: mapa.legproc, materiais: mapa.materiais },
        alunosComPlano,
        grupos: ((grp.data ?? []) as Array<{ id: string; nome: string | null }>).map((x) => ({ id: x.id, nome: x.nome || 'Grupo' })),
        alunosExcecao,
      },
    }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Falha ao carregar.' }
  }
}

export async function salvarPainelLiberacao(cfg: CfgLiberacao): Promise<{ ok: boolean; error?: string }> {
  const g = await acesso('update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const antes = await lerCfgLiberacao(svc, g.tenantId)
  const depois = normalizarCfg(cfg)
  const r = await salvarCfgLiberacao(svc, g.tenantId, depois, g.userId)
  if (!r.ok) return r
  await registrarAudit({
    operacao: 'UPDATE', entidade: 'simulado_cronograma_liberacao', entidadeId: g.tenantId, tenantId: g.tenantId,
    antes: { ...antes }, depois: { ...depois },
  }).catch(() => {})
  revalidatePath('/admin/cronogramas/adaptativo')
  return { ok: true }
}

export async function buscarAlunosLiberacao(q: string): Promise<{ id: string; nome: string; email: string | null }[]> {
  const g = await acesso('view'); if (!g) return []
  const t = (q ?? '').trim().replace(/[,%()*]/g, ' ').trim()
  if (t.length < 2) return []
  const { data } = await createAdminClient().from('simulado_estudantes').select('id, nome, email')
    .eq('tenant_id', g.tenantId).eq('deletado', false).or(`nome.ilike.%${t}%,email.ilike.%${t}%`).order('nome').limit(15)
  return ((data ?? []) as Array<{ id: string; nome: string | null; email: string | null }>).map((e) => ({ id: e.id, nome: e.nome || 'Aluno', email: e.email }))
}

export interface SimulacaoAluno {
  total: number; liberados: number; bloqueados: number; motivo: MotivoLiberacao | null
  proximas: Array<{ titulo: string; liberaEm: string }>
}

/** Mostra o que um aluno específico consegue abrir HOJE com a configuração SALVA. */
export async function simularAlunoLiberacao(alunoId: string): Promise<{ ok: boolean; error?: string; sim?: SimulacaoAluno }> {
  const g = await acesso('view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  try {
    return { ok: true, sim: await simularLiberacaoAluno(createAdminClient(), g.tenantId, alunoId) }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Falha ao simular.' }
  }
}
