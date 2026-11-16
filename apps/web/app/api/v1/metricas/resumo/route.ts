import { createAdminClient } from '@/lib/supabase/server'
import { handler, ok, erro, dataParam } from '@/lib/api-v1'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handler(req, 'metricas:read', async ({ auth, url }) => {
    const ate = dataParam(url, 'ate') ?? new Date().toISOString()
    const desde = dataParam(url, 'desde') ?? new Date(new Date(ate).getTime() - 30 * 86_400_000).toISOString()
    // Agregação no SQL (RPC) — nada de somar em JS.
    const { data, error } = await createAdminClient().rpc('api_v1_metricas_resumo', {
      p_tenant: auth.tenantId, p_desde: desde, p_ate: ate,
    })
    if (error) {
      const faltando = /api_v1_metricas_resumo|schema cache|does not exist/i.test(error.message || '')
      if (faltando) return erro(503, 'Métricas indisponíveis: aplique a migration 20261120000000_api_v1_metricas.sql.')
      throw error
    }
    return ok({ periodo: { desde, ate }, ...(data as object) })
  })
}
