import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember } from '@/lib/cache/relatorio-cache'

/**
 * Banca PREDOMINANTE de cada simulado (resolvida pelas questões → banca). Map<simuladoId, nomeBanca>.
 * O simulado não tem "banca" como coluna — ela vem das questões. É TENANT-wide (igual p/ todos os alunos),
 * então cacheamos por conjunto de ids (alto reaproveitamento no lançamento). Tolerante a erro/schema.
 */
export async function resolverBancasSimulados(svc: any, tenantId: string, simIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!simIds.length) return out
  const ids = [...new Set(simIds)].sort()
  try {
    const mapa = await remember(`sim-banca:${tenantId}:${ids.join(',')}`, 1800, async () => {
      const pq = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_prova_questoes').select('simulado_id, questao_id').in('simulado_id', chunk).order('simulado_id', { ascending: true }))
      const qids = [...new Set(pq.map((r: any) => r.questao_id).filter(Boolean))] as string[]
      const qb = qids.length ? await fetchAllByIn<any>(qids, (chunk) => svc.from('simulado_questoes').select('id, banca_id').in('id', chunk).order('id', { ascending: true })) : []
      const bancaDeQ = new Map<string, string>()
      for (const r of qb as any[]) if (r.banca_id) bancaDeQ.set(r.id, r.banca_id)
      const bids = [...new Set(qb.map((r: any) => r.banca_id).filter(Boolean))] as string[]
      const bancas = bids.length ? ((await svc.from('simulado_bancas').select('id, nome').in('id', bids)).data ?? []) : []
      const nomeDeB = new Map<string, string>((bancas as any[]).map((b) => [b.id, b.nome]))
      const cont = new Map<string, Map<string, number>>()
      for (const r of pq as any[]) {
        const nome = nomeDeB.get(bancaDeQ.get(r.questao_id) ?? ''); if (!nome) continue
        let m = cont.get(r.simulado_id); if (!m) { m = new Map(); cont.set(r.simulado_id, m) }
        m.set(nome, (m.get(nome) ?? 0) + 1)
      }
      const o: Record<string, string> = {}
      for (const [sid, m] of cont) { const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0]; if (top) o[sid] = top[0] }
      return o
    })
    for (const [k, v] of Object.entries(mapa)) out.set(k, v as string)
  } catch { /* tolerante: sem banca resolvida → coluna vazia */ }
  return out
}
