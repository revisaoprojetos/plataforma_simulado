import { contextoOidc, jsonResp } from '@/lib/oidc/http'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const ctx = await contextoOidc(req)
  if (ctx instanceof Response) return ctx
  return jsonResp({ keys: [ctx.keys.publicJwk] })
}
