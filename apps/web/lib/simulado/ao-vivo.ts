import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'

export interface ResumoAoVivo {
  total: number
  online: number       // fazendo AGORA (atividade nos últimos JANELA_ATIVO_MIN)
  pausados: number     // iniciaram e NÃO finalizaram, mas sem atividade recente (abandonado/em pausa)
  finalizados: number
  naoIniciaram: number
}

/** Janela que define "fazendo agora": atividade (início da sessão OU última resposta) recente. */
export const JANELA_ATIVO_MIN = 30
const JANELA_ATIVO_MS = JANELA_ATIVO_MIN * 60_000

/**
 * Dentre as sessões informadas, retorna o conjunto das que tiveram uma RESPOSTA registrada
 * dentro da janela (proxy de "está mexendo agora", já que não há heartbeat). Filtra por
 * `respondido_em >= cutoff` — barato mesmo com muitas respostas.
 */
async function sessoesComRespostaRecente(svc: SupabaseClient, sessaoIds: string[], cutoffIso: string): Promise<Set<string>> {
  const set = new Set<string>()
  const ids = [...new Set(sessaoIds.filter(Boolean))]
  if (!ids.length) return set
  const rows = await fetchAllByIn<any>(ids, (chunk) =>
    svc.from('simulado_respostas_objetivas').select('sessao_id').in('sessao_id', chunk).gte('respondido_em', cutoffIso).order('sessao_id'))
  for (const r of rows) if ((r as any).sessao_id) set.add((r as any).sessao_id)
  return set
}

/**
 * Computa o resumo "ao vivo" de um simulado (matriculados, fazendo agora, finalizaram,
 * não iniciaram). Sem checagem de permissão — o chamador (action ou rota SSE) valida antes.
 * Extraído da server action para poder ser reusado pela rota SSE (Fase 2): não dá para
 * chamar uma função `'use server'` de dentro de um route handler.
 */
export async function computarResumoAoVivo(svc: SupabaseClient, simuladoId: string): Promise<ResumoAoVivo> {
  const cutoffMs = Date.now() - JANELA_ATIVO_MS
  const cutoffIso = new Date(cutoffMs).toISOString()
  const [matriculas, sessoes] = await Promise.all([
    fetchAll<any>(() => svc.from('simulado_matriculas').select('estudante_id').eq('simulado_id', simuladoId).order('estudante_id')),
    fetchAll<any>(() => svc.from('simulado_sessoes_prova').select('id, estudante_id, status, iniciado_em').eq('simulado_id', simuladoId).eq('is_teste', false).eq('deletado', false).order('estudante_id')),
  ])

  const matSet = new Set<string>(matriculas.map((m: any) => m.estudante_id).filter(Boolean))
  const total = matSet.size

  // "Fazendo agora" = sessão não-finalizada com atividade recente (início OU resposta na janela).
  const naoFin = (sessoes as any[]).filter((s) => s.status !== 'finalizada' && s.estudante_id)
  const recentes = await sessoesComRespostaRecente(svc, naoFin.map((s) => s.id), cutoffIso)

  // Por estudante: finalizou? está ativo agora? tem sessão parada (não-finalizada e sem atividade)?
  const porEst = new Map<string, { fin: boolean; ativo: boolean; parado: boolean }>()
  for (const s of sessoes as any[]) {
    const eid = s.estudante_id
    if (!eid) continue
    const e = porEst.get(eid) ?? { fin: false, ativo: false, parado: false }
    if (s.status === 'finalizada') e.fin = true
    else if (new Date(s.iniciado_em ?? 0).getTime() >= cutoffMs || recentes.has(s.id)) e.ativo = true
    else e.parado = true
    porEst.set(eid, e)
  }

  let online = 0, pausados = 0, finalizados = 0
  const comSessao = new Set<string>()
  for (const [eid, st] of porEst) {
    if (!matSet.has(eid)) continue // conta só matriculados
    comSessao.add(eid)
    // Prioridade: fazendo agora > finalizou > pausado (sessão em aberto sem atividade).
    if (st.ativo) online++
    else if (st.fin) finalizados++
    else if (st.parado) pausados++
  }
  const naoIniciaram = Math.max(0, total - comSessao.size)

  return { total, online, pausados, finalizados, naoIniciaram }
}

/**
 * "Fazendo agora" por simulado (cards do board): alunos DISTINTOS matriculados com sessão
 * NÃO finalizada (válida, sem testador/deletada). Sem permissão aqui — o chamador valida.
 * Extraído da server action para reuso pela rota SSE do board.
 */
export async function computarOnlinePorSimulado(svc: SupabaseClient, tenantId: string, simuladoIds: string[]): Promise<Record<string, number>> {
  const ids = [...new Set((simuladoIds ?? []).filter(Boolean))]
  if (!ids.length) return {}
  const cutoffMs = Date.now() - JANELA_ATIVO_MS
  const cutoffIso = new Date(cutoffMs).toISOString()
  const sess = await fetchAllByIn<any>(ids, (chunk) =>
    svc.from('simulado_sessoes_prova')
      .select('id, simulado_id, estudante_id, status, iniciado_em')
      .eq('tenant_id', tenantId)
      .in('simulado_id', chunk).eq('is_teste', false).eq('deletado', false).neq('status', 'finalizada')
      .order('simulado_id'))
  // Só "fazendo agora": sessão iniciada há pouco OU com resposta dentro da janela (sem heartbeat).
  const recentes = await sessoesComRespostaRecente(svc, (sess as any[]).map((s) => s.id), cutoffIso)
  const ativas = (sess as any[]).filter((s) => new Date(s.iniciado_em ?? 0).getTime() >= cutoffMs || recentes.has(s.id))
  const pares = [...new Set(ativas
    .filter((s) => s.simulado_id && s.estudante_id)
    .map((s) => `${s.simulado_id}::${s.estudante_id}`))]
  if (!pares.length) return {}
  const simCand = [...new Set(pares.map((p) => p.split('::')[0]))]
  const estCand = [...new Set(pares.map((p) => p.split('::')[1]))]
  const mats = await fetchAllByIn<any>(estCand, (chunk) =>
    svc.from('simulado_matriculas').select('simulado_id, estudante_id').in('simulado_id', simCand).in('estudante_id', chunk))
  const matSet = new Set((mats as any[]).map((m) => `${m.simulado_id}::${m.estudante_id}`))
  const porSim = new Map<string, Set<string>>()
  for (const p of pares) {
    if (!matSet.has(p)) continue
    const [sid, eid] = p.split('::')
    let set = porSim.get(sid)
    if (!set) { set = new Set(); porSim.set(sid, set) }
    set.add(eid)
  }
  const out: Record<string, number> = {}
  for (const [k, set] of porSim) out[k] = set.size
  return out
}
