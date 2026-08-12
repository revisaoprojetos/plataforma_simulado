import type { EntregaSlots } from '@/lib/caderno-teste/entrega-aluno'

/**
 * Resolve o "Caderno de questões (sem respostas)" de cada simulado, para o aluno baixar ANTES de
 * iniciar — pela ENTREGA V2 (`caderno_entrega.enunciado` do banco do simulado). Retorna, por simulado:
 * `pdf` = URL direta (PDF importado) quando existe; `temCaderno` = há caderno a gerar. Tolerante ao schema.
 */
export async function resolverEnunciadoUrls(
  svc: any,
  sims: { id: string; regras: any }[],
): Promise<Map<string, { pdf: string | null; temCaderno: boolean }>> {
  const out = new Map<string, { pdf: string | null; temCaderno: boolean }>()
  const comBanco = sims.filter((s) => !!(s.regras as any)?.banco_base_id)
  if (!comBanco.length) return out

  const bancoIds = [...new Set(comBanco.map((s) => (s.regras as any).banco_base_id as string))]
  const entregaPorBanco = new Map<string, EntregaSlots | null>()
  try {
    const { data } = await svc.from('simulado_pastas').select('id, caderno_entrega').in('id', bancoIds)
    for (const p of (data ?? []) as any[]) entregaPorBanco.set(p.id, (p.caderno_entrega ?? null) as EntregaSlots | null)
  } catch { /* coluna pode não existir */ }

  for (const s of comBanco) {
    const en = entregaPorBanco.get((s.regras as any).banco_base_id)?.enunciado
    if (en?.pdfUrl) {
      const arq = (en.pdfNome || 'Caderno de Questões').replace(/\.pdf$/i, '').trim() || 'Caderno de Questões'
      const sep = en.pdfUrl.includes('?') ? '&' : '?'
      out.set(s.id, { pdf: `${en.pdfUrl}${sep}download=${encodeURIComponent(arq)}.pdf`, temCaderno: true })
    } else if (en?.cadernoId && en?.itemId) {
      out.set(s.id, { pdf: null, temCaderno: true })
    } else {
      out.set(s.id, { pdf: null, temCaderno: false })
    }
  }
  return out
}
