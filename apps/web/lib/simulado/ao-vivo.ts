import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'

export interface ResumoAoVivo {
  total: number
  online: number
  finalizados: number
  naoIniciaram: number
}

/**
 * Computa o resumo "ao vivo" de um simulado (matriculados, fazendo agora, finalizaram,
 * não iniciaram). Sem checagem de permissão — o chamador (action ou rota SSE) valida antes.
 * Extraído da server action para poder ser reusado pela rota SSE (Fase 2): não dá para
 * chamar uma função `'use server'` de dentro de um route handler.
 */
export async function computarResumoAoVivo(svc: SupabaseClient, simuladoId: string): Promise<ResumoAoVivo> {
  const [matriculas, sessoes] = await Promise.all([
    fetchAll<any>(() => svc.from('simulado_matriculas').select('estudante_id').eq('simulado_id', simuladoId).order('estudante_id')),
    fetchAll<any>(() => svc.from('simulado_sessoes_prova').select('estudante_id, status').eq('simulado_id', simuladoId).eq('is_teste', false).eq('deletado', false).order('estudante_id')),
  ])

  const matSet = new Set<string>(matriculas.map((m: any) => m.estudante_id).filter(Boolean))
  const total = matSet.size

  // Por estudante: tem alguma finalizada? tem alguma em andamento (não finalizada)?
  const porEst = new Map<string, { fin: boolean; and: boolean }>()
  for (const s of sessoes) {
    const eid = (s as any).estudante_id
    if (!eid) continue
    const e = porEst.get(eid) ?? { fin: false, and: false }
    if ((s as any).status === 'finalizada') e.fin = true
    else e.and = true // em_andamento / aguardando = está fazendo/online
    porEst.set(eid, e)
  }

  let online = 0, finalizados = 0
  const comSessao = new Set<string>()
  for (const [eid, st] of porEst) {
    if (!matSet.has(eid)) continue // conta só matriculados
    comSessao.add(eid)
    if (st.and) online++
    else if (st.fin) finalizados++
  }
  const naoIniciaram = Math.max(0, total - comSessao.size)

  return { total, online, finalizados, naoIniciaram }
}

/**
 * "Fazendo agora" por simulado (cards do board): alunos DISTINTOS matriculados com sessão
 * NÃO finalizada (válida, sem testador/deletada). Sem permissão aqui — o chamador valida.
 * Extraído da server action para reuso pela rota SSE do board.
 */
export async function computarOnlinePorSimulado(svc: SupabaseClient, tenantId: string, simuladoIds: string[]): Promise<Record<string, number>> {
  const ids = [...new Set((simuladoIds ?? []).filter(Boolean))]
  if (!ids.length) return {}
  const sess = await fetchAllByIn<any>(ids, (chunk) =>
    svc.from('simulado_sessoes_prova')
      .select('simulado_id, estudante_id, status')
      .eq('tenant_id', tenantId)
      .in('simulado_id', chunk).eq('is_teste', false).eq('deletado', false).neq('status', 'finalizada')
      .order('simulado_id'))
  const pares = [...new Set((sess as any[])
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
