import { consumirCodeUmaVez, contextoOidc, ipDe, jsonResp } from '@/lib/oidc/http'
import { processarToken } from '@/lib/oidc/protocolo'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Chamado servidor-a-servidor (BookStack/AFFiNE): sem cookie de aluno, sem Origin — fora do check de CSRF (proxy.ts não cobre /oidc).
export async function POST(req: Request) {
  const rl = await rateLimit(`oidc:token:${ipDe(req)}`, 120, 60_000)
  if (!rl.ok) return jsonResp({ error: 'invalid_request', error_description: 'Muitas requisições.' }, 429, { 'retry-after': String(rl.retryAfter) })
  const ctx = await contextoOidc(req)
  if (ctx instanceof Response) return ctx
  const ct = req.headers.get('content-type') ?? ''
  if (!ct.includes('application/x-www-form-urlencoded')) return jsonResp({ error: 'invalid_request', error_description: 'Use application/x-www-form-urlencoded.' }, 400)
  const form = new URLSearchParams(await req.text())
  const r = await processarToken({
    form, authorization: req.headers.get('authorization'),
    clients: ctx.clients, keys: ctx.keys, issuer: ctx.issuer, consumirCode: consumirCodeUmaVez,
  })
  return jsonResp(r.body, r.status, r.wwwAuthenticate ? { 'www-authenticate': 'Basic realm="oidc"' } : {})
}
