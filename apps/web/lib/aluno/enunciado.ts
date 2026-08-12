import { enunciadoQuestoesPdf } from '@/lib/caderno-designer/material'
import type { EntregaSlots } from '@/lib/caderno-teste/entrega-aluno'

/**
 * Resolve o "Caderno de questões (sem respostas)" de cada simulado, para o aluno baixar ANTES de
 * iniciar. Retorna, por simulado: `pdf` = URL direta (PDF importado) quando existe; `temCaderno` = há
 * caderno a gerar; `v2` = a resolução veio da entrega V2 (define a rota do endpoint de geração).
 *  - V2 (regras.entrega_v2): lê `caderno_entrega.enunciado` do banco (PDF direto ou item gerado).
 *  - V1: `regras.caderno_id` → `banco_base_id` → `banco.caderno_id` → `config.material_enunciado`.
 * Tolerante ao schema.
 */
export async function resolverEnunciadoUrls(
  svc: any,
  sims: { id: string; regras: any }[],
): Promise<Map<string, { pdf: string | null; temCaderno: boolean; v2: boolean }>> {
  const out = new Map<string, { pdf: string | null; temCaderno: boolean; v2: boolean }>()

  // ---- V2: simulados com a entrega ligada resolvem pelo caderno_entrega do banco ----
  const ehV2 = (s: { regras: any }) => (s.regras as any)?.entrega_v2 === true && !!(s.regras as any)?.banco_base_id
  const v2Sims = sims.filter(ehV2)
  const v1Sims = sims.filter((s) => !ehV2(s))
  if (v2Sims.length) {
    const bancoIds = [...new Set(v2Sims.map((s) => (s.regras as any).banco_base_id as string))]
    const entregaPorBanco = new Map<string, EntregaSlots | null>()
    try {
      const { data } = await svc.from('simulado_pastas').select('id, caderno_entrega').in('id', bancoIds)
      for (const p of (data ?? []) as any[]) entregaPorBanco.set(p.id, (p.caderno_entrega ?? null) as EntregaSlots | null)
    } catch { /* coluna pode não existir */ }
    for (const s of v2Sims) {
      const en = entregaPorBanco.get((s.regras as any).banco_base_id)?.enunciado
      if (en?.pdfUrl) {
        const arq = (en.pdfNome || 'Caderno de Questões').replace(/\.pdf$/i, '').trim() || 'Caderno de Questões'
        const sep = en.pdfUrl.includes('?') ? '&' : '?'
        out.set(s.id, { pdf: `${en.pdfUrl}${sep}download=${encodeURIComponent(arq)}.pdf`, temCaderno: true, v2: true })
      } else if (en?.cadernoId && en?.itemId) {
        out.set(s.id, { pdf: null, temCaderno: true, v2: true })
      } else {
        out.set(s.id, { pdf: null, temCaderno: false, v2: true })
      }
    }
  }

  // ---- V1: resolução por caderno do designer (mala direta) ----
  const cadernoPorSim = new Map<string, string | null>()
  const bancoBasePorSim = new Map<string, string>()
  for (const s of v1Sims) {
    const cid = (s.regras as any)?.caderno_id as string | undefined
    if (cid) cadernoPorSim.set(s.id, cid)
    else {
      const bid = (s.regras as any)?.banco_base_id as string | undefined
      if (bid) bancoBasePorSim.set(s.id, bid)
    }
  }
  const bancoIds = [...new Set([...bancoBasePorSim.values()])]
  if (bancoIds.length) {
    try {
      const { data: bancos } = await svc.from('simulado_pastas').select('id, caderno_id').in('id', bancoIds)
      const cadDoBanco = new Map<string, string | null>((bancos ?? []).map((b: any) => [b.id, b.caderno_id ?? null]))
      for (const [simId, bid] of bancoBasePorSim) { const cid = cadDoBanco.get(bid); if (cid) cadernoPorSim.set(simId, cid) }
    } catch { /* coluna caderno_id pode não existir */ }
  }
  const cadernoIds = [...new Set([...cadernoPorSim.values()].filter(Boolean) as string[])]
  const urlPorCaderno = new Map<string, string | null>()
  if (cadernoIds.length) {
    try {
      const { data: cads } = await svc.from('simulado_cadernos_designer').select('id, config').in('id', cadernoIds)
      for (const c of (cads ?? []) as any[]) urlPorCaderno.set(c.id, enunciadoQuestoesPdf(c.config)?.url ?? null)
    } catch { /* tabela pode não existir */ }
  }
  for (const s of v1Sims) {
    const cid = cadernoPorSim.get(s.id) ?? null
    out.set(s.id, { pdf: cid ? (urlPorCaderno.get(cid) ?? null) : null, temCaderno: !!cid, v2: false })
  }
  return out
}
