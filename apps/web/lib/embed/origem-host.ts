/**
 * Origem do HOST (página que embeda nosso iframe) — usada no lugar de postMessage(..., '*').
 * Módulo CLIENT-SAFE (sem imports de node). Regras:
 *  - A origem do pai é DERIVADA, nunca recebida do pai: window.location.ancestorOrigins[0] (Chrome/Safari)
 *    ou new URL(document.referrer).origin (Firefox / fallback).
 *  - Só é considerada confiável se casar com a allowlist efetiva = origens_permitidas do tenant (simulado_embed_config,
 *    entregue pelo servidor via <EmbedOrigensProvider>) + origens conhecidas da Curseduca
 *    (+ NEXT_PUBLIC_EMBED_HOST_ORIGINS, lista separada por vírgula/espaço, valor de BUILD).
 *  - Origem confiável → targetOrigin EXATO (nunca '*'), payload completo.
 *  - Origem indeterminada/não permitida → só eventos SEM dados sensíveis (altura/início/fim) com '*'; qualquer
 *    campo sensível (nota, ids) é REMOVIDO. Nada sensível sai com '*'.
 */

export const ORIGENS_HOST_CONHECIDAS = ['https://*.curseduca.pro', 'https://membros.revisaoensinojuridico.com.br']

function extras(): string[] {
  const raw = (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_EMBED_HOST_ORIGINS : '') || ''
  return raw.split(/[\s,]+/).map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean)
}

export function allowlistEfetiva(doTenant: readonly string[] = []): string[] {
  return [...doTenant, ...ORIGENS_HOST_CONHECIDAS, ...extras()].map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean)
}

/** `origem` (ex.: https://a.curseduca.pro) casa com algum padrão (aceita `https://*.dominio`)? */
export function origemPermitida(origem: string | null | undefined, padroes: readonly string[]): boolean {
  if (!origem) return false
  let o: URL
  try { o = new URL(origem) } catch { return false }
  if (o.protocol !== 'https:' && o.protocol !== 'http:') return false
  const norm = o.origin
  return padroes.some((p) => {
    if (p === norm) return true
    const m = /^(https?:)\/\/\*\.(.+)$/.exec(p)
    if (!m) return false
    return o.protocol === m[1] && o.hostname.endsWith('.' + m[2].replace(/:\d+$/, '')) && (!/:\d+$/.test(m[2]) || o.port === m[2].split(':')[1])
  })
}

/** Origem do pai (sem validar). null se não for iframe ou não der para saber. */
export function origemBrutaDoPai(): string | null {
  if (typeof window === 'undefined' || window.parent === window) return null
  try {
    const anc = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins
    if (anc && anc.length > 0 && anc[0] && anc[0] !== 'null') return anc[0]
  } catch { /* ignore */ }
  try {
    if (document.referrer) return new URL(document.referrer).origin
  } catch { /* ignore */ }
  return null
}

/** Origem do pai VALIDADA contra a allowlist efetiva, ou null. */
export function origemHostValidada(doTenant: readonly string[] = []): string | null {
  const o = origemBrutaDoPai()
  return o && origemPermitida(o, allowlistEfetiva(doTenant)) ? new URL(o).origin : null
}

/**
 * Envia ao pai. `sensivel` = campos que só vão com origem validada (removidos caso contrário).
 * `msg` = parte sem dados sensíveis (tipo, altura...).
 */
export function enviarAoPai(msg: Record<string, unknown>, sensivel: Record<string, unknown> = {}, doTenant: readonly string[] = []): void {
  if (typeof window === 'undefined' || window.parent === window) return
  const alvo = origemHostValidada(doTenant)
  try {
    if (alvo) window.parent.postMessage({ ...msg, ...sensivel }, alvo)
    else window.parent.postMessage(msg, '*') // só dados não sensíveis
  } catch { /* pai inacessível */ }
}

/** Escuta mensagens do pai ignorando qualquer origem fora da allowlist efetiva. Retorna o cleanup. */
export function ouvirDoPai(handler: (data: unknown, origem: string) => void, doTenant: readonly string[] = []): () => void {
  if (typeof window === 'undefined') return () => {}
  const fn = (e: MessageEvent) => {
    if (e.source !== window.parent) return
    if (!origemPermitida(e.origin, allowlistEfetiva(doTenant))) return
    handler(e.data, e.origin)
  }
  window.addEventListener('message', fn)
  return () => window.removeEventListener('message', fn)
}
