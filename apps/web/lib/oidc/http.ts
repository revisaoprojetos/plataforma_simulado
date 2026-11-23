import { getClients, getIssuer, type OidcClient } from './config'
import { carregarChaves, ChaveAusenteError, type OidcKeys } from './keys'
import { rateLimit } from '@/lib/rate-limit'

export const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' } as const

export function jsonResp(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...NO_STORE, ...extra } })
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Página HTML de erro legível (sem scripts; segura p/ iframe). */
export function paginaErro(titulo: string, mensagem: string, status = 400): Response {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titulo)}</title>
<style>body{font-family:system-ui,sans-serif;background:#f6f5fa;color:#1f1b2e;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
.c{background:#fff;border:1px solid #e3e0ee;border-radius:12px;max-width:440px;padding:28px;text-align:center}h1{font-size:18px;margin:0 0 8px}p{font-size:14px;line-height:1.5;margin:0;color:#4a4560}</style></head>
<body><div class="c"><h1>${esc(titulo)}</h1><p>${esc(mensagem)}</p></div></body></html>`
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...NO_STORE } })
}

export interface ContextoOidc { issuer: string; keys: OidcKeys; clients: OidcClient[] }

/** Resolve issuer + chaves + clients, ou uma Response 503 clara quando a configuração falta. */
export async function contextoOidc(req: Request, formato: 'json' | 'html' = 'json'): Promise<ContextoOidc | Response> {
  const falha = (msg: string) => (formato === 'html' ? paginaErro('Serviço indisponível', msg, 503) : jsonResp({ error: 'temporarily_unavailable', error_description: msg }, 503))
  let origem: string | undefined
  try { origem = new URL(req.url).origin } catch { /* sem origem */ }
  const issuer = getIssuer(origem)
  if (!issuer) return falha('Provedor OIDC não configurado: defina CADERNOS_OIDC_ISSUER (https).')
  try {
    const keys = await carregarChaves()
    return { issuer, keys, clients: getClients() }
  } catch (e) {
    if (e instanceof ChaveAusenteError) return falha(`Provedor OIDC não configurado: ${e.message}`)
    throw e
  }
}

/** Replay do code: 1º uso passa, demais falham (janela > TTL do code). Best-effort — memória por processo se não houver Redis. */
export async function consumirCodeUmaVez(jti: string): Promise<boolean> {
  return (await rateLimit(`oidc:code:${jti}`, 1, 120_000)).ok
}

export function ipDe(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip')?.trim() || 'unknown'
}
