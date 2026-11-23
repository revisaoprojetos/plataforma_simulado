/**
 * Configuração do Provedor OIDC (IdP) dos cadernos externos (BookStack/AFFiNE).
 * Env: CADERNOS_OIDC_ISSUER, CADERNOS_OIDC_PRIVATE_KEY, CADERNOS_OIDC_CLIENTS. Ver docs/cadernos-externos-oidc.md.
 */
export interface OidcClient {
  id: string
  secret: string
  redirectUris: string[]
  postLogoutUris: string[]
  pkce: 'required' | 'optional'
}

/** Pura: valida/normaliza o JSON de clients. Entradas inválidas são descartadas (fail-closed). */
export function parseClients(raw: string | undefined | null): OidcClient[] {
  if (!raw || !raw.trim()) return []
  let arr: unknown
  try { arr = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(arr)) return []
  const out: OidcClient[] = []
  for (const c of arr as Array<Record<string, unknown>>) {
    if (!c || typeof c !== 'object') continue
    const id = typeof c.id === 'string' ? c.id.trim() : ''
    const secret = typeof c.secret === 'string' ? c.secret : ''
    const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [])
    const redirectUris = lista(c.redirectUris)
    if (!id || secret.length < 16 || redirectUris.length === 0) continue
    out.push({ id, secret, redirectUris, postLogoutUris: lista(c.postLogoutUris), pkce: c.pkce === 'required' ? 'required' : 'optional' })
  }
  return out
}

export function getClients(): OidcClient[] {
  return parseClients(process.env.CADERNOS_OIDC_CLIENTS)
}

export function findClient(clients: OidcClient[], id: string | null | undefined): OidcClient | null {
  if (!id) return null
  return clients.find((c) => c.id === id) ?? null
}

/** Issuer sem barra final. Em produção exige https; em dev, sem env, deriva da origem da requisição. */
export function getIssuer(origemDev?: string): string | null {
  const env = (process.env.CADERNOS_OIDC_ISSUER ?? '').trim().replace(/\/+$/, '')
  if (env) {
    if (process.env.NODE_ENV === 'production' && !env.startsWith('https://')) return null
    return env
  }
  if (process.env.NODE_ENV !== 'production' && origemDev) return `${origemDev.replace(/\/+$/, '')}/oidc`
  return null
}
