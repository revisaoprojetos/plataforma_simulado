'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { softRestore, SOFT_DELETE_TABELAS, type SoftDeleteTabela } from '@/lib/soft-delete'

// tabela → { tipo exibido, coluna de rótulo (ou __sessao = composto Aluno — Simulado) }
const CFG: Record<SoftDeleteTabela, { tipo: string; rotulo: string }> = {
  simulado_simulados: { tipo: 'Simulado', rotulo: 'titulo' },
  simulado_questoes: { tipo: 'Questão', rotulo: 'enunciado' },
  simulado_estudantes: { tipo: 'Estudante', rotulo: 'nome' },
  simulado_grupos: { tipo: 'Grupo', rotulo: 'nome' },
  simulado_pastas: { tipo: 'Banco', rotulo: 'nome' },
  simulado_cadernos_designer: { tipo: 'Caderno', rotulo: 'nome' },
  simulado_etiquetas: { tipo: 'Etiqueta', rotulo: 'nome' },
  simulado_sessoes_prova: { tipo: 'Sessão de prova', rotulo: '__sessao' },
}

export type LixeiraItem = {
  tabela: SoftDeleteTabela
  tipo: string
  id: string
  rotulo: string
  deletado_em: string | null
  deletado_por_nome: string | null
}

function pathDaTabela(t: SoftDeleteTabela): string[] {
  switch (t) {
    case 'simulado_simulados': return ['/admin/simulados']
    case 'simulado_questoes': return ['/admin/questoes']
    case 'simulado_estudantes': return ['/admin/estudantes']
    case 'simulado_grupos': return ['/admin/grupos']
    case 'simulado_pastas': return ['/admin/banco-questoes']
    case 'simulado_cadernos_designer': return ['/admin/cadernos']
    default: return []
  }
}

export async function listarLixeira(): Promise<LixeiraItem[]> {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId) return []
  const svc = createAdminClient()
  const tenant = access.tenantId

  // Coleta crua (mantém deletado_por p/ resolver o nome depois).
  type Cru = LixeiraItem & { _por: string | null }
  const crus: Cru[] = []

  for (const tabela of SOFT_DELETE_TABELAS) {
    const cfg = CFG[tabela]
    if (cfg.rotulo === '__sessao') {
      const { data } = await svc
        .from(tabela)
        .select('id, deletado_em, deletado_por, estudante_id, simulado_id')
        .eq('tenant_id', tenant).eq('deletado', true).order('deletado_em', { ascending: false })
      const rows = (data ?? []) as any[]
      if (!rows.length) continue
      const estIds = [...new Set(rows.map((r) => r.estudante_id).filter(Boolean))]
      const simIds = [...new Set(rows.map((r) => r.simulado_id).filter(Boolean))]
      const { data: ests } = estIds.length ? await svc.from('simulado_estudantes').select('id, nome').in('id', estIds) : { data: [] as any[] }
      const { data: sims } = simIds.length ? await svc.from('simulado_simulados').select('id, titulo').in('id', simIds) : { data: [] as any[] }
      const nomeEst = new Map((ests ?? []).map((e: any) => [e.id, e.nome]))
      const tituloSim = new Map((sims ?? []).map((s: any) => [s.id, s.titulo]))
      for (const r of rows) {
        crus.push({ tabela, tipo: cfg.tipo, id: r.id, deletado_em: r.deletado_em, deletado_por_nome: null, _por: r.deletado_por ?? null,
          rotulo: `${nomeEst.get(r.estudante_id) ?? 'Aluno'} — ${tituloSim.get(r.simulado_id) ?? 'Simulado'}` })
      }
    } else {
      const { data, error } = await svc
        .from(tabela)
        .select(`id, deletado_em, deletado_por, ${cfg.rotulo}`)
        .eq('tenant_id', tenant).eq('deletado', true).order('deletado_em', { ascending: false })
      if (error) continue
      for (const r of (data ?? []) as any[]) {
        crus.push({ tabela, tipo: cfg.tipo, id: r.id, deletado_em: r.deletado_em, deletado_por_nome: null, _por: r.deletado_por ?? null,
          rotulo: String(r[cfg.rotulo] ?? '—').replace(/\s+/g, ' ').slice(0, 140) })
      }
    }
  }

  // Resolve "excluído por" → e-mail/nome do admin (auth), best-effort, uma vez por id.
  const nome = new Map<string, string>()
  for (const uid of [...new Set(crus.map((c) => c._por).filter(Boolean))] as string[]) {
    try {
      const { data } = await (svc as any).auth.admin.getUserById(uid)
      if (data?.user) nome.set(uid, data.user.user_metadata?.nome ?? data.user.email ?? uid)
    } catch { /* ignora */ }
  }

  return crus
    .map(({ _por, ...i }) => ({ ...i, deletado_por_nome: _por ? (nome.get(_por) ?? null) : null }))
    .sort((a, b) => String(b.deletado_em ?? '').localeCompare(String(a.deletado_em ?? '')))
}

export async function restaurarItem(tabela: SoftDeleteTabela, id: string) {
  const { error } = await softRestore(tabela, id)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'LIBERAR', entidade: tabela, entidadeId: id, depois: { restaurado: true } })
  revalidatePath('/admin/lixeira')
  for (const p of pathDaTabela(tabela)) revalidatePath(p)
  return { ok: true }
}

export async function excluirDefinitivo(tabela: SoftDeleteTabela, id: string) {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId) return { ok: false, error: 'Sem sessão.' }
  if (!(SOFT_DELETE_TABELAS as readonly string[]).includes(tabela)) return { ok: false, error: 'Tabela não permitida.' }
  const svc = createAdminClient()
  const { error } = await svc.from(tabela).delete().eq('id', id).eq('tenant_id', access.tenantId).eq('deletado', true)
  if (error) return { ok: false, error: `Não foi possível excluir definitivamente (ainda há vínculos): ${error.message}` }
  await registrarAudit({ operacao: 'DELETE', entidade: tabela, entidadeId: id, depois: { definitivo: true } })
  revalidatePath('/admin/lixeira')
  return { ok: true }
}
