/**
 * Cálculo PURO das datas de liberação por TRILHA (cronograma) — sem server-only (usado por admin, motor do aluno e testes).
 * Datas civis 'YYYY-MM-DD' (sem fuso). Contrato compartilhado: não mudar a assinatura sem avisar os 3 consumidores.
 */
export interface TrilhaAulaDatas { data_cronograma: string | null; data_manual: string | null; offset_dias: number }

const ISO = /^\d{4}-\d{2}-\d{2}$/
function somaDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + dias))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

/** Data em que a aula libera NESTA trilha: data_manual (exata) ou data_cronograma − offset_dias. null = a aula não existe na trilha. */
export function liberaEmTrilha(t: TrilhaAulaDatas): string | null {
  if (t.data_manual && ISO.test(t.data_manual)) return t.data_manual
  if (t.data_cronograma && ISO.test(t.data_cronograma)) return somaDias(t.data_cronograma, -Math.max(0, Math.trunc(t.offset_dias || 0)))
  return null
}

/** Aluno em várias trilhas (ex.: Passaporte Vitalício): vale a MENOR data de liberação entre elas. null = nenhuma trilha traz a aula. */
export function menorLiberacao(ts: TrilhaAulaDatas[]): string | null {
  let best: string | null = null
  for (const t of ts) { const d = liberaEmTrilha(t); if (d && (!best || d < best)) best = d }
  return best
}
