import 'server-only'
import type { ResumoRow } from 'data'

/**
 * Cliente da API dedicada (Fase 3, strangler). Quando `RELATORIOS_API_URL` está setado, o
 * app busca os relatórios na API (apps/api) em vez de rodar o SQL localmente. Chamada
 * server-to-server autenticada por segredo (x-api-secret). Retorna null em qualquer falha
 * (API fora, sem flag, erro) → o chamador cai no SQL local / PostgREST.
 */
export async function resumosRowsViaApi(tenantId: string): Promise<ResumoRow[] | null> {
  const base = process.env.RELATORIOS_API_URL
  if (!base) return null
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/v1/relatorios/resumos?tenantId=${encodeURIComponent(tenantId)}`, {
      headers: { 'x-api-secret': process.env.API_INTERNAL_SECRET ?? '' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    if (!r.ok) return null
    const j = (await r.json()) as { rows?: ResumoRow[] | null }
    return Array.isArray(j.rows) ? j.rows : null
  } catch {
    return null
  }
}
