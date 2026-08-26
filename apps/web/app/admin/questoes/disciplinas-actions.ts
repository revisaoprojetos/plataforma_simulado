'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'

const NADA = '00000000-0000-0000-0000-000000000000'

export type DisciplinaContagem = { id: string; nome: string; questoes: number; assuntos: number }
export type UnificacaoRecente = { id: string; mantida: string; duplicadas: string[]; questoes: number; criado_em: string }

async function acesso(acao: 'view' | 'update') {
  const a = await getCurrentAccess()
  const permitido = a.isAdmin || a.permissions.includes('*') || a.permissions.includes(`questoes:${acao}`)
  if (!a.tenantId || !permitido) return null
  return { tenantId: a.tenantId, userId: a.userId ?? null }
}

/**
 * Disciplinas do tenant + contagem de questões e assuntos. Alimenta a aba de
 * unificação (mesclar disciplinas duplicadas — mesmo nome escrito de formas
 * diferentes na criação/import CSV, que poluem o filtro).
 */
export async function listarDisciplinasContagem(): Promise<{ ok: boolean; itens?: DisciplinaContagem[]; error?: string }> {
  const g = await acesso('view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()

  const { data: disc, error } = await svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', g.tenantId).order('nome')
  if (error) return { ok: false, error: error.message }

  const qCount = new Map<string, number>()
  const aCount = new Map<string, number>()
  if ((disc ?? []).length) {
    const qs = await fetchAll<{ disciplina_id: string }>(() => svc.from('simulado_questoes').select('disciplina_id').eq('tenant_id', g.tenantId).eq('deletado', false).not('disciplina_id', 'is', null))
    for (const r of qs) qCount.set(r.disciplina_id, (qCount.get(r.disciplina_id) ?? 0) + 1)
    const as = await fetchAll<{ disciplina_id: string }>(() => svc.from('simulado_assuntos').select('disciplina_id').eq('tenant_id', g.tenantId).not('disciplina_id', 'is', null))
    for (const r of as) aCount.set(r.disciplina_id, (aCount.get(r.disciplina_id) ?? 0) + 1)
  }

  return { ok: true, itens: (disc ?? []).map((d: any) => ({ id: d.id, nome: d.nome, questoes: qCount.get(d.id) ?? 0, assuntos: aCount.get(d.id) ?? 0 })) }
}

/** Contagem exata do impacto (para a confirmação, sem depender do snapshot do cliente). */
export async function previewUnificacao(duplicadaIds: string[]): Promise<{ ok: boolean; questoes?: number; assuntos?: number; error?: string }> {
  const g = await acesso('update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const dups = [...new Set((duplicadaIds ?? []).filter(Boolean))]
  if (!dups.length) return { ok: true, questoes: 0, assuntos: 0 }
  const svc = createAdminClient()
  const { count: nQ } = await svc.from('simulado_questoes').select('*', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).eq('deletado', false).in('disciplina_id', dups)
  const { count: nA } = await svc.from('simulado_assuntos').select('*', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).in('disciplina_id', dups)
  return { ok: true, questoes: nQ ?? 0, assuntos: nA ?? 0 }
}

/**
 * Unifica disciplinas: move questões, assuntos e cronograma das DUPLICADAS para a
 * CANÔNICA e apaga as duplicadas. Prefere a RPC ATÔMICA (1 transação + log de
 * reversão); se a migração ainda não rodou, cai no caminho JS (não-atômico, mas
 * seguro: falha antes do delete não perde nada, e re-executar conclui).
 */
export async function unificarDisciplinas(canonicaId: string, duplicadaIds: string[]): Promise<{ ok: boolean; error?: string; questoes?: number; assuntos?: number; removidas?: number; mantida?: string }> {
  const g = await acesso('update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()

  const dups = [...new Set((duplicadaIds ?? []).filter((x) => x && x !== canonicaId))]
  if (!canonicaId || !dups.length) return { ok: false, error: 'Escolha a disciplina a manter e ao menos uma duplicada.' }

  // Todas devem ser do tenant (defesa extra além da RPC).
  const { data: donas } = await svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', g.tenantId).in('id', [canonicaId, ...dups])
  const validas = new Set((donas ?? []).map((d: any) => d.id))
  if (!validas.has(canonicaId) || dups.some((d) => !validas.has(d))) return { ok: false, error: 'Disciplina inválida.' }

  // 1) Caminho ATÔMICO (RPC).
  const rpc = await svc.rpc('simulado_unificar_disciplinas', { p_tenant: g.tenantId, p_canonica: canonicaId, p_dups: dups, p_ator: g.userId })
  if (!rpc.error) {
    const d = (rpc.data ?? {}) as any
    await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_disciplinas', entidadeId: canonicaId, depois: { unificou: dups.length, questoes: d.questoes ?? 0, assuntos: d.assuntos ?? 0, mantida: d.mantida } })
    revalidatePath('/admin/questoes')
    return { ok: true, questoes: d.questoes ?? 0, assuntos: d.assuntos ?? 0, removidas: d.removidas ?? dups.length, mantida: d.mantida }
  }
  if (!/function|schema cache|does not exist|not find|PGRST202/i.test(rpc.error.message)) return { ok: false, error: rpc.error.message }

  // 2) Fallback JS (migração da RPC ainda não aplicada).
  const { count: nQ } = await svc.from('simulado_questoes').select('*', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).eq('deletado', false).in('disciplina_id', dups)
  const { count: nA } = await svc.from('simulado_assuntos').select('*', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).in('disciplina_id', dups)
  const upQ = await svc.from('simulado_questoes').update({ disciplina_id: canonicaId }).eq('tenant_id', g.tenantId).in('disciplina_id', dups)
  if (upQ.error) return { ok: false, error: upQ.error.message }
  const upA = await svc.from('simulado_assuntos').update({ disciplina_id: canonicaId }).eq('tenant_id', g.tenantId).in('disciplina_id', dups)
  if (upA.error) return { ok: false, error: upA.error.message }
  await svc.from('simulado_cronograma_links').update({ disciplina_id: canonicaId }).eq('tenant_id', g.tenantId).in('disciplina_id', dups)
  await svc.from('simulado_cronograma_metas').update({ disciplina_id: canonicaId }).eq('tenant_id', g.tenantId).in('disciplina_id', dups)
  const del = await svc.from('simulado_disciplinas').delete().eq('tenant_id', g.tenantId).in('id', dups)
  if (del.error) return { ok: false, error: del.error.message }
  const mantida = (donas ?? []).find((d: any) => d.id === canonicaId)?.nome as string | undefined
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_disciplinas', entidadeId: canonicaId, depois: { unificou: dups.length, questoes: nQ ?? 0, assuntos: nA ?? 0, mantida, fallback: true } })
  revalidatePath('/admin/questoes')
  return { ok: true, questoes: nQ ?? 0, assuntos: nA ?? 0, removidas: dups.length, mantida }
}

/** Unificações recentes que ainda dá para desfazer (log; vazio antes da migração). */
export async function listarUnificacoesRecentes(): Promise<{ ok: boolean; itens?: UnificacaoRecente[]; error?: string }> {
  const g = await acesso('view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_disciplina_unificacoes').select('id, canonica_nome, mapa, criado_em').eq('tenant_id', g.tenantId).eq('desfeita', false).order('criado_em', { ascending: false }).limit(10)
  if (error) return { ok: true, itens: [] } // tabela ausente (migração pendente) → sem histórico
  const itens = (data ?? []).map((r: any) => {
    const mapa = Array.isArray(r.mapa) ? r.mapa : []
    return { id: r.id, mantida: r.canonica_nome ?? '—', duplicadas: mapa.map((m: any) => m.nome).filter(Boolean), questoes: mapa.reduce((s: number, m: any) => s + (Array.isArray(m.questao_ids) ? m.questao_ids.length : 0), 0), criado_em: r.criado_em }
  })
  return { ok: true, itens }
}

/** Desfaz uma unificação: recria as disciplinas apagadas e repointa as questões de volta. */
export async function desfazerUnificacao(unificacaoId: string): Promise<{ ok: boolean; questoes?: number; error?: string }> {
  const g = await acesso('update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const rpc = await svc.rpc('simulado_desfazer_unificacao', { p_tenant: g.tenantId, p_unificacao: unificacaoId })
  if (rpc.error) return { ok: false, error: /function|not find|PGRST202|does not exist/i.test(rpc.error.message) ? 'Recurso indisponível: rode a migração de unificação.' : rpc.error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_disciplinas', entidadeId: unificacaoId, depois: { desfez_unificacao: true, questoes: (rpc.data as any)?.questoes ?? 0 } })
  revalidatePath('/admin/questoes')
  return { ok: true, questoes: (rpc.data as any)?.questoes ?? 0 }
}
