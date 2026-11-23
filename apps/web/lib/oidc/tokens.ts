import { randomUUID } from 'node:crypto'
import { EncryptJWT, SignJWT, jwtDecrypt, jwtVerify } from 'jose'
import type { OidcKeys } from './keys'

export const CODE_TTL_S = 60
export const ACCESS_TTL_S = 600
export const ID_TOKEN_TTL_S = 600

export interface Identidade {
  sub: string
  email: string
  name: string
}

export interface CodePayload extends Identidade {
  clientId: string
  redirectUri: string
  nonce?: string
  challenge?: string
  scope: string
  authTime: number
  jti: string
}

/** Code = JWE (dir/A256GCM) stateless, 60s. Opaco p/ o cliente; só este IdP decifra. */
export async function emitirCode(keys: OidcKeys, issuer: string, p: Omit<CodePayload, 'jti'>): Promise<string> {
  return new EncryptJWT({ ...p })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuer(issuer)
    .setAudience('oidc-code')
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${CODE_TTL_S}s`)
    .encrypt(keys.codeKey)
}

export async function verificarCode(keys: OidcKeys, issuer: string, code: string): Promise<CodePayload | null> {
  try {
    const { payload } = await jwtDecrypt(code, keys.codeKey, { issuer, audience: 'oidc-code', clockTolerance: 0 })
    if (!payload.jti || typeof payload.clientId !== 'string' || typeof payload.redirectUri !== 'string' || typeof payload.sub !== 'string') return null
    return payload as unknown as CodePayload
  } catch { return null }
}

/** ID Token (RS256): iss, aud, sub, iat, exp, nonce, email, email_verified=true, name, preferred_username. */
export async function emitirIdToken(keys: OidcKeys, issuer: string, clientId: string, id: Identidade, extra: { nonce?: string; authTime: number }): Promise<string> {
  const claims: Record<string, unknown> = {
    email: id.email,
    email_verified: true,
    name: id.name,
    preferred_username: id.email,
    auth_time: extra.authTime,
  }
  if (extra.nonce) claims.nonce = extra.nonce
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: keys.kid, typ: 'JWT' })
    .setIssuer(issuer)
    .setAudience(clientId)
    .setSubject(id.sub)
    .setIssuedAt()
    .setExpirationTime(`${ID_TOKEN_TTL_S}s`)
    .sign(keys.privateKey)
}

/** Access token curto (JWT RS256, aud = userinfo). Sem refresh. */
export async function emitirAccessToken(keys: OidcKeys, issuer: string, clientId: string, id: Identidade): Promise<string> {
  return new SignJWT({ email: id.email, name: id.name, client_id: clientId })
    .setProtectedHeader({ alg: 'RS256', kid: keys.kid, typ: 'at+jwt' })
    .setIssuer(issuer)
    .setAudience(`${issuer}/userinfo`)
    .setSubject(id.sub)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_S}s`)
    .sign(keys.privateKey)
}

export async function verificarAccessToken(keys: OidcKeys, issuer: string, token: string): Promise<(Identidade & { clientId: string }) | null> {
  try {
    const { payload, protectedHeader } = await jwtVerify(token, keys.publicKey, { issuer, audience: `${issuer}/userinfo`, algorithms: ['RS256'] })
    if (protectedHeader.typ !== 'at+jwt' || !payload.sub) return null
    return { sub: payload.sub, email: String(payload.email ?? ''), name: String(payload.name ?? ''), clientId: String(payload.client_id ?? '') }
  } catch { return null }
}

/** Verifica id_token_hint (assinatura RS256 + iss); aceita expirado (RP-initiated logout). */
export async function verificarIdTokenHint(keys: OidcKeys, issuer: string, token: string): Promise<{ aud: string } | null> {
  try {
    const { payload } = await jwtVerify(token, keys.publicKey, { issuer, algorithms: ['RS256'], clockTolerance: 60 * 60 * 24 * 30 })
    const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud
    return aud ? { aud } : null
  } catch { return null }
}
