import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/supabase/fetch-all'

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
