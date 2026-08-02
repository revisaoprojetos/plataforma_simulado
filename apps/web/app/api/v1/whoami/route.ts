import { NextResponse } from 'next/server'
import { validarApiKey } from '@/lib/api-keys'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/whoami — endpoint autenticado por API key (Authorization: Bearer <chave>).
 * Serve para o integrador TESTAR a chave e ver a que tenant/escopos ela dá acesso.
 * É o primeiro consumidor real das API keys (antes existiam mas nada as validava).
 */
export async function GET(req: Request) {
  const auth = await validarApiKey(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  return NextResponse.json({
    ok: true,
    tenant_id: auth.tenantId,
    key: { id: auth.keyId, nome: auth.nome },
    escopos: auth.escopos,
  })
}
