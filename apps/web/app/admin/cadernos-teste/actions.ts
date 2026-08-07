'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { carregarRegistros } from '@/lib/caderno-designer/merge'
import { slugDiag } from '@/lib/caderno-teste/diagnostico'
import type { BuilderV3, PreviewQuestao } from '@/lib/caderno-teste/tipos'

export type RegistroTeste = { id: string; nome: string; vars: Record<string, string> }
export type DiscBancoTeste = { nome: string; chave: string }

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F']
const TABELA = 'simulado_cadernos_teste'

/** Salva o builder do caderno de TESTE (config.builderV3 + bancoId). Sincroniza o nome com o título. */
export async function salvarBuilderTeste(id: string, builder: BuilderV3): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const { data: atual } = await svc.from(TABELA).select('config').eq('id', id).eq('tenant_id', access.tenantId).maybeSingle()
  if (!atual) return { ok: false, error: 'Caderno não encontrado.' }
  const config = { ...(((atual as any).config ?? {}) as Record<string, unknown>), builderV3: builder, bancoId: builder.bancoId }
  // Nome do caderno = título do grupo ativo (ou o 1º).
  const at = builder.itens.find((i) => i.id === builder.ativo) ?? builder.itens[0]
  const nome = (at?.ajustes.titulo || '').trim()
  const patch: Record<string, unknown> = { config, atualizado_em: new Date().toISOString() }
  if (nome) patch.nome = nome
  const { error } = await svc.from(TABELA).update(patch).eq('id', id).eq('tenant_id', access.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: TABELA, entidadeId: id, depois: { grupos: builder.itens.length } })
  revalidatePath('/admin/cadernos-teste')
  return { ok: true }
}

/** Questões de um banco (para a prévia). Limitado — é só preview. */
export async function previewQuestoesBanco(bancoId: string): Promise<{ ok: boolean; questoes?: PreviewQuestao[] }> {
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false }
  if (!bancoId) return { ok: true, questoes: [] }
  const svc = createAdminClient()
  const vinc = await fetchAll<{ questao_id: string }>(() => svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', access.tenantId!).order('questao_id', { ascending: true }))
  const ids = vinc.map((v) => v.questao_id).slice(0, 80) // teto para a prévia (não é a geração final)
  if (!ids.length) return { ok: true, questoes: [] }
  const { data: qs } = await svc.from('simulado_questoes').select('id, enunciado, tipo').in('id', ids).eq('tenant_id', access.tenantId)
  const { data: alts } = await svc.from('simulado_alternativas').select('questao_id, texto, ordem, correta, comentario').in('questao_id', ids).eq('tenant_id', access.tenantId)
  const altMap = new Map<string, any[]>()
  for (const a of alts ?? []) { const arr = altMap.get(a.questao_id) ?? []; arr.push(a); altMap.set(a.questao_id, arr) }
  const ordem = new Map(ids.map((id, i) => [id, i]))
  const questoes: PreviewQuestao[] = (qs ?? [])
    .sort((x: any, y: any) => (ordem.get(x.id) ?? 0) - (ordem.get(y.id) ?? 0))
    .map((q: any, i: number) => ({
      id: q.id, numero: i + 1, enunciado: q.enunciado ?? '', tipo: q.tipo,
      alternativas: (altMap.get(q.id) ?? []).sort((m, n) => m.ordem - n.ordem).map((al, j) => ({ letra: LETRAS[j] ?? '?', texto: al.texto ?? '', correta: !!al.correta, comentario: al.comentario ?? '' })),
    }))
  return { ok: true, questoes }
}

/**
 * Dados adaptativos do banco para o Diagnóstico: ALUNOS reais (com as variáveis de desempenho —
 * nota, %, por pilar, por disciplina, assuntos das erradas) + as DISCIPLINAS do banco (nome+chave).
 * Reusa `carregarRegistros` (mesmo motor da mala direta do editor real).
 */
export async function dadosBancoTeste(bancoId: string): Promise<{ ok: boolean; registros: RegistroTeste[]; disciplinas: DiscBancoTeste[] }> {
  const access = await getCurrentAccess()
  if (!access.tenantId || !bancoId) return { ok: true, registros: [], disciplinas: [] }
  const svc = createAdminClient()
  const { data: pasta } = await svc.from('simulado_pastas').select('nome, grupos').eq('id', bancoId).eq('tenant_id', access.tenantId).maybeSingle()
  const bancoNome = ((pasta as any)?.nome ?? 'Simulado') as string
  let registros: RegistroTeste[] = []
  try {
    const regs = await carregarRegistros(svc, access.tenantId, bancoId, bancoNome, undefined, undefined, 30)
    registros = regs.map((r) => ({ id: r.id, nome: r.nome, vars: r.vars }))
  } catch { /* base sem sessões/respostas — segue sem alunos */ }

  // Disciplinas AUTORITATIVAS: nomes reais das disciplinas das questões DO BANCO selecionado —
  // slug igual ao das variáveis (merge.ts), então nome/quantidade/% adaptam a qualquer banco.
  let disciplinas: DiscBancoTeste[] = []
  try {
    const vinc = await fetchAll<{ questao_id: string }>(() => svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', access.tenantId!).order('questao_id', { ascending: true }))
    const ids = vinc.map((v) => v.questao_id)
    const nomes = new Set<string>()
    if (ids.length) {
      const qs = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_questoes').select('disciplinas:simulado_disciplinas(nome)').in('id', chunk).eq('tenant_id', access.tenantId!))
      for (const q of qs) { const n = (q as any).disciplinas?.nome as string | undefined; if (n && n.trim()) nomes.add(n.trim()) }
    }
    disciplinas = [...nomes].sort((a, b) => a.localeCompare(b)).map((nome) => ({ nome, chave: slugDiag(nome) }))
  } catch { /* fallback abaixo */ }
  // Fallback 1: grupos configurados no banco. Fallback 2: variáveis do 1º aluno (total_<slug>).
  if (!disciplinas.length) {
    const nomes = new Set<string>()
    for (const g of (Array.isArray((pasta as any)?.grupos) ? (pasta as any).grupos : [])) for (const d of (g?.disciplinas ?? [])) if (typeof d === 'string' && d.trim()) nomes.add(d.trim())
    disciplinas = [...nomes].map((nome) => ({ nome, chave: slugDiag(nome) }))
  }
  if (!disciplinas.length && registros[0]) {
    const v = registros[0].vars
    const human = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
    disciplinas = Object.keys(v).filter((k) => k.startsWith('total_') && !k.startsWith('total_pilar_') && k !== 'total_questoes').map((k) => { const c = k.slice('total_'.length); return { nome: human(c), chave: c } })
  }
  return { ok: true, registros, disciplinas }
}
