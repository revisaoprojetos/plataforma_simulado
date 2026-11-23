import { createHash, timingSafeEqual } from 'node:crypto'
import type { OidcClient } from './config'

/** Comparação em tempo constante de strings (hash prévio p/ igualar tamanhos). */
export function igualConstante(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb) && a.length === b.length
}

/** code_challenge S256 = BASE64URL(SHA256(verifier)). */
export function desafioS256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

/** Verifica code_verifier contra o challenge S256. Verifier segue RFC 7636 (43–128 chars [A-Za-z0-9-._~]). */
export function verificarPkce(verifier: string | null | undefined, challenge: string): boolean {
  if (!verifier || !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false
  return igualConstante(desafioS256(verifier), challenge)
}

/** redirect_uri: IGUALDADE EXATA contra a lista do client (sem curingas, sem normalização). */
export function redirectUriValido(client: OidcClient, uri: string | null | undefined): boolean {
  if (!uri) return false
  return client.redirectUris.some((u) => u === uri)
}

export function postLogoutUriValido(client: OidcClient, uri: string | null | undefined): boolean {
  if (!uri) return false
  return client.postLogoutUris.some((u) => u === uri)
}
