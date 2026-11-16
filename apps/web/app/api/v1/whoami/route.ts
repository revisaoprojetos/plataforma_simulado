import { NextResponse } from 'next/server'
import { validarApiKey, prefixoChave } from '@/lib/api-keys'
import { medirApi } from '@/lib/api-v1/uso'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/whoami — endpoint autenticado por API key (Authorization: Bearer <chave>).
 * Serve para o integrador TESTAR a chave e ver a que tenant/escopos ela dá acesso.
 * É o primeiro consumidor real das API keys (antes existiam mas nada as validava).
 */
export async function GET(req: Request) {
  return medirApi(req, async (uso) => {
    const auth = await validarApiKey(req)
    if (!auth.ok) {
      uso.keyId = auth.keyId ?? null; uso.tenantId = auth.tenantId ?? null
      uso.keyPrefix = prefixoChave(req); uso.erro = auth.error
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    uso.keyId = auth.keyId; uso.tenantId = auth.tenantId
    return NextResponse.json({
      ok: true,
      tenant_id: auth.tenantId,
      key: { id: auth.keyId, nome: auth.nome },
      escopos: auth.escopos,
    })
  })
}
