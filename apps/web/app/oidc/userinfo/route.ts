import { contextoOidc, ipDe, jsonResp } from '@/lib/oidc/http'
import { verificarAccessToken } from '@/lib/oidc/tokens'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function tratar(req: Request) {
  const rl = await rateLimit(`oidc:userinfo:${ipDe(req)}`, 240, 60_000)
  if (!rl.ok) return jsonResp({ error: 'invalid_request' }, 429, { 'retry-after': String(rl.retryAfter) })
  const ctx = await contextoOidc(req)
  if (ctx instanceof Response) return ctx
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')
  const bearerErr = (error: string) => jsonResp({ error }, 401, { 'www-authenticate': `Bearer error="${error}"` })
  if (!m) return bearerErr('invalid_request')
  const id = await verificarAccessToken(ctx.keys, ctx.issuer, m[1].trim())
  if (!id) return bearerErr('invalid_token')
  return jsonResp({ sub: id.sub, email: id.email, email_verified: true, name: id.name, preferred_username: id.email })
}

export const GET = tratar
export const POST = tratar // servidor-a-servidor: sem Origin (fora do CSRF)
