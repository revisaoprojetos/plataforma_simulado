// Horário de Brasília (America/Sao_Paulo). O Brasil não tem horário de verão
// desde 2019, então usamos o offset fixo UTC-3 para converter os campos de
// data/hora do simulado. Assim, o admin sempre informa e vê o horário de
// Brasília, independentemente do fuso do navegador.
const BRT_OFFSET = '-03:00'

/**
 * Converte um valor de `<input type="datetime-local">` (interpretado como
 * horário de Brasília) para ISO em UTC, pronto para gravar no `timestamptz`.
 * Se o valor já vier com fuso/offset, respeita-o.
 */
export function brtLocalParaIso(local?: string | null): string | null {
  if (!local) return null
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(local)) {
    const d = new Date(local)
    return isNaN(+d) ? null : d.toISOString()
  }
  const base = local.length === 16 ? `${local}:00` : local // "YYYY-MM-DDTHH:mm" -> "...:00"
  const d = new Date(`${base}${BRT_OFFSET}`)
  return isNaN(+d) ? null : d.toISOString()
}

/**
 * Converte um ISO/UTC (do banco) para "YYYY-MM-DDTHH:mm" no horário de
 * Brasília, para preencher um `<input type="datetime-local">`.
 */
export function isoParaBrtLocal(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(+d)) return ''
  const br = new Date(d.getTime() - 3 * 60 * 60 * 1000)
  return br.toISOString().slice(0, 16)
}

/** Rótulo padrão exibido ao lado dos campos de data/hora. */
export const BRT_LABEL = 'Horário de Brasília (UTC−3)'
