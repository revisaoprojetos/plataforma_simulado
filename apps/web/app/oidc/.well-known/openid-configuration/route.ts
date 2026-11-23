import { contextoOidc, jsonResp } from '@/lib/oidc/http'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const ctx = await contextoOidc(req)
  if (ctx instanceof Response) return ctx
  const i = ctx.issuer
  return jsonResp({
    issuer: i,
    authorization_endpoint: `${i}/authorize`,
    token_endpoint: `${i}/token`,
    userinfo_endpoint: `${i}/userinfo`,
    jwks_uri: `${i}/jwks`,
    end_session_endpoint: `${i}/end-session`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'profile', 'email'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
    claims_supported: ['iss', 'aud', 'sub', 'iat', 'exp', 'nonce', 'auth_time', 'email', 'email_verified', 'name', 'preferred_username'],
  })
}
