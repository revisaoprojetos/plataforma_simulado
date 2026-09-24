/**
 * Domínio do cookie de sessão a partir do HOST da requisição.
 *
 * Usa o domínio "registrável" (com ponto na frente) para (a) compartilhar a sessão entre subdomínios
 * do MESMO domínio (ex.: .revisaopge.com.br) e, principalmente, (b) FUNCIONAR em domínios PRÓPRIOS
 * de cada tenant (ex.: .vikhdigital.com). Sem isto, um cookie fixo em .revisaopge.com.br é REJEITADO
 * pelo navegador em qualquer outro domínio → login não persiste ("Entrando…" infinito).
 *
 * localhost / IP → undefined (cookie por-host, comportamento de dev). Trata ccTLD de 2 níveis do
 * Brasil (.com.br, .net.br, ...) para não cortar o domínio errado.
 */
export function dominioCookieDeHost(hostRaw?: string | null): string | undefined {
  const host = (hostRaw ?? '').split(':')[0].trim().toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return undefined
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return undefined // IPv4 → por-host
  if (host.includes(':')) return undefined                    // IPv6 → por-host
  const parts = host.split('.')
  if (parts.length < 2) return undefined
  // ccTLD de 2 níveis (.com.br, .net.br, ...): o domínio registrável tem 3 rótulos (ex.: revisaopge.com.br).
  const segundoNivelBr = new Set(['com', 'net', 'org', 'gov', 'edu', 'co', 'adv', 'eng'])
  const tld = parts[parts.length - 1]
  const penult = parts[parts.length - 2]
  const n = tld === 'br' && segundoNivelBr.has(penult) ? 3 : 2
  return '.' + parts.slice(-Math.min(n, parts.length)).join('.')
}
