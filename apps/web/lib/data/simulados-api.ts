import 'server-only'

/**
 * Cliente das ESCRITAS de simulado na API dedicada (strangler — Fase 7). Quando `API_INTERNAL_URL`
 * (ou o legado `RELATORIOS_API_URL`) está setado, o app faz a operação pela API (apps/api) em vez de
 * rodar direto no Supabase. Chamada server-to-server autenticada por `x-api-secret`. Retorna `null`
 * em qualquer indisponibilidade/erro → o chamador cai no caminho local (PostgREST/Supabase).
 *
 * A permissão + ownership do usuário JÁ são validados no Next ANTES de chamar (a API é fronteira
 * interna confiável, como os relatórios/crons).
 */
async function apiPost<T>(path: string, body: unknown): Promise<T | null> {
  const base = (process.env.API_INTERNAL_URL ?? process.env.RELATORIOS_API_URL)?.replace(/\/$/, '')
  if (!base) return null
  try {
    const r = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-secret': process.env.API_INTERNAL_SECRET ?? '' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

/** Reordena a prova via API dedicada. `true` = a API cuidou; `null` = indisponível/fallback → local. */
export async function reordenarProvaViaApi(tenantId: string, simuladoId: string, ordem: string[]): Promise<boolean | null> {
  const j = await apiPost<{ ok?: boolean; fallback?: boolean }>('/v1/simulados/prova/reordenar', { tenantId, simuladoId, ordem })
  if (!j || j.fallback) return null
  return j.ok === true
}
