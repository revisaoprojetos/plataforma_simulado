import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export type VisualSim = { cor: string | null; icone: string | null; capa: string | null }

/**
 * Resolve a imagem/visual de cada simulado a partir do banco (pasta) de origem:
 * 1) `regras.banco_base_id` (simulados criados a partir de um banco);
 * 2) fallback: a pasta mais comum entre as questões do simulado.
 * Retorna Map<simuladoId, { cor, icone, capa }>.
 */
export async function resolverVisualSimulados(svc: SupabaseClient, simulados: { id: string; regras?: any }[]): Promise<Map<string, VisualSim>> {
  const visual = new Map<string, VisualSim>()
  if (!simulados.length) return visual

  const pastaDeSim = new Map<string, string>()
  const semBanco: string[] = []
  for (const s of simulados) {
    const bb = (s.regras as any)?.banco_base_id
    if (bb) pastaDeSim.set(s.id, bb)
    else semBanco.push(s.id)
  }

  // Fallback pelas questões → pasta mais comum.
  if (semBanco.length) {
    const { data: pq } = await svc.from('simulado_prova_questoes').select('simulado_id, questao_id').in('simulado_id', semBanco)
    const qids = [...new Set((pq ?? []).map((r: any) => r.questao_id).filter(Boolean))]
    if (qids.length) {
      const { data: qp } = await svc.from('simulado_questao_pasta').select('questao_id, pasta_id').in('questao_id', qids)
      const pastaDeQ = new Map<string, string>()
      for (const r of (qp ?? []) as any[]) if (!pastaDeQ.has(r.questao_id)) pastaDeQ.set(r.questao_id, r.pasta_id)
      const cont = new Map<string, Map<string, number>>()
      for (const r of (pq ?? []) as any[]) {
        const p = pastaDeQ.get(r.questao_id); if (!p) continue
        let m = cont.get(r.simulado_id); if (!m) { m = new Map(); cont.set(r.simulado_id, m) }
        m.set(p, (m.get(p) ?? 0) + 1)
      }
      for (const [sim, m] of cont) { const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0]; if (top) pastaDeSim.set(sim, top[0]) }
    }
  }

  const pastaIds = [...new Set([...pastaDeSim.values()])]
  if (pastaIds.length) {
    let pastas: any[] = []
    // Prefere a capa DO CARD (capa_card_url); cai p/ a capa/banner (capa_url). Tolerante caso
    // a coluna capa_card_url ainda não exista no ambiente.
    const r = await svc.from('simulado_pastas').select('id, cor, icone, capa_url, capa_card_url').in('id', pastaIds)
    if (r.error && /capa_card_url|column/i.test(r.error.message)) {
      const r2 = await svc.from('simulado_pastas').select('id, cor, icone, capa_url').in('id', pastaIds)
      pastas = r2.data ?? []
    } else if (!r.error) pastas = r.data ?? []
    const vis = new Map<string, VisualSim>(pastas.map((p: any) => [p.id, { cor: p.cor ?? null, icone: p.icone ?? null, capa: (p.capa_card_url ?? p.capa_url) ?? null }]))
    for (const [sim, pid] of pastaDeSim) { const v = vis.get(pid); if (v) visual.set(sim, v) }
  }
  return visual
}
