/**
 * Abre um link do simulado em nova aba. O destino já vem temado desde o 1º byte
 * (o `<html>` do app define `color-scheme` + fundo pelo tema resolvido no servidor),
 * então não pisca branco quando o servidor responde.
 */
export function abrirLinkTemado(url: string) {
  if (typeof window === 'undefined') return
  window.open(url, '_blank', 'noopener,noreferrer')
}
