import 'server-only'
import type { ResumoRow, EstData, GraficoData, DiscData } from 'data'

/**
 * Cliente da API dedicada (Fase 3, strangler). Quando `RELATORIOS_API_URL` está setado, o
 * app busca os relatórios na API (apps/api) em vez de rodar o SQL localmente. Chamada
 * server-to-server autenticada por segredo (x-api-secret). Retorna null em qualquer falha
 * (API fora, sem flag, erro) → o chamador cai no SQL local / PostgREST.
 */
async function apiGet<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const base = process.env.RELATORIOS_API_URL?.replace(/\/$/, '')
  if (!base) return null
  try {
    const qs = new URLSearchParams(params).toString()
    const r = await fetch(`${base}${path}?${qs}`, {
      headers: { 'x-api-secret': process.env.API_INTERNAL_SECRET ?? '' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

export async function resumosRowsViaApi(tenantId: string): Promise<ResumoRow[] | null> {
  const j = await apiGet<{ rows?: ResumoRow[] | null }>('/v1/relatorios/resumos', { tenantId })
  return j && Array.isArray(j.rows) ? j.rows : null
}

export async function estudanteViaApi(estId: string, tenantId: string): Promise<EstData | null> {
  const j = await apiGet<{ data?: EstData | null }>('/v1/relatorios/estudante', { estId, tenantId })
  return j && j.data ? j.data : null
}

export async function graficoViaApi(tenantId: string): Promise<GraficoData | null> {
  const j = await apiGet<{ data?: GraficoData | null }>('/v1/relatorios/graficos', { tenantId })
  return j && j.data ? j.data : null
}

export async function disciplinaViaApi(discId: string, tenantId: string): Promise<DiscData | null> {
  const j = await apiGet<{ data?: DiscData | null }>('/v1/relatorios/disciplina', { discId, tenantId })
  return j && j.data ? j.data : null
}
