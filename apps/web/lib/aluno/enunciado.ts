import { enunciadoQuestoesPdf } from '@/lib/caderno-designer/material'

/**
 * URL de download do "Enunciado de Questões" (2º PDF importado) de cada simulado, para o aluno
 * baixar ANTES de iniciar (menu de 3 pontos do card). Resolve o caderno do simulado
 * (regras.caderno_id → banco_base_id → banco.caderno_id) em lote e aplica enunciadoQuestoesPdf.
 * Tolerante ao schema; retorna null quando não há PDF (aí o botão de 3 pontos não aparece).
 */
export async function resolverEnunciadoUrls(
  svc: any,
  sims: { id: string; regras: any }[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  const cadernoPorSim = new Map<string, string | null>()
  const bancoBasePorSim = new Map<string, string>()
  for (const s of sims) {
    const cid = (s.regras as any)?.caderno_id as string | undefined
    if (cid) cadernoPorSim.set(s.id, cid)
    else {
      const bid = (s.regras as any)?.banco_base_id as string | undefined
      if (bid) bancoBasePorSim.set(s.id, bid)
    }
  }
  // caderno_id dos bancos base (em lote).
  const bancoIds = [...new Set([...bancoBasePorSim.values()])]
  if (bancoIds.length) {
    try {
      const { data: bancos } = await svc.from('simulado_pastas').select('id, caderno_id').in('id', bancoIds)
      const cadDoBanco = new Map<string, string | null>((bancos ?? []).map((b: any) => [b.id, b.caderno_id ?? null]))
      for (const [simId, bid] of bancoBasePorSim) { const cid = cadDoBanco.get(bid); if (cid) cadernoPorSim.set(simId, cid) }
    } catch { /* coluna caderno_id pode não existir */ }
  }
  // config dos cadernos (em lote) → URL do enunciado.
  const cadernoIds = [...new Set([...cadernoPorSim.values()].filter(Boolean) as string[])]
  const urlPorCaderno = new Map<string, string | null>()
  if (cadernoIds.length) {
    try {
      const { data: cads } = await svc.from('simulado_cadernos_designer').select('id, config').in('id', cadernoIds)
      for (const c of (cads ?? []) as any[]) urlPorCaderno.set(c.id, enunciadoQuestoesPdf(c.config)?.url ?? null)
    } catch { /* tabela pode não existir */ }
  }
  for (const s of sims) {
    const cid = cadernoPorSim.get(s.id) ?? null
    out.set(s.id, cid ? (urlPorCaderno.get(cid) ?? null) : null)
  }
  return out
}
