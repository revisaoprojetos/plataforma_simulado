import { cache } from 'react'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'

export interface Tenant {
  id: string
  nome: string
  slug: string
  tema: Record<string, unknown>
  plano: string
  ativo: boolean
}

/**
 * Resolve o tenant atual.
 * - Produção: pelo subdomínio do host (`revisaopge.seudominio.com` → slug `revisaopge`).
 * - Desenvolvimento (localhost, sem subdomínio): usa `NEXT_PUBLIC_DEFAULT_TENANT_SLUG`
 *   ou `demo`.
 * Usa service role REAL (createAdminClient) — a resolução acontece antes de haver
 * contexto de RLS, e alguns bancos (ex.: migrados) têm RLS incompleto que bloquearia
 * a leitura do tenant se rodasse como o usuário autenticado.
 */
// Memoizado por request (React cache): o layout + a página + várias libs chamam isto no mesmo
// render — sem cache seriam N leituras idênticas de `simulado_tenants`. Host é constante no request.
export const getCurrentTenant = cache(async (): Promise<Tenant | null> => {
  const h = await headers()
  const host = (h.get('host') ?? '').split(':')[0].toLowerCase()
  const supabase = createAdminClient()
  const COLS = 'id, nome, slug, tema, plano, ativo'

  // 1) DOMÍNIO CUSTOMIZADO (white-label): casa o HOST COMPLETO contra `tenants.dominio`.
  //    Permite cada empresa ter seu próprio domínio (ex.: vocenadefensoria.vnd.com.br) sem depender
  //    do primeiro rótulo virar slug. É o caminho preferido para onboard de novas empresas.
  if (host && host !== 'localhost') {
    const { data } = await supabase.from('simulado_tenants').select(COLS).eq('dominio', host).maybeSingle()
    if (data) return data as Tenant
  }

  // 2) FALLBACK por SLUG = primeiro rótulo do host (subdomínio), como antes.
  //    Dev: {slug}.localhost; Produção: {slug}.dominio.com (ex.: simulado.revisaopge.com.br → "simulado").
  const parts = host.split('.')
  let slug = process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG ?? 'demo'
  if (parts.length === 2 && parts[1] === 'localhost' && parts[0] !== 'www') {
    slug = parts[0]
  } else if (parts.length >= 3 && !['www', 'localhost'].includes(parts[0])) {
    slug = parts[0]
  }

  const { data } = await supabase.from('simulado_tenants').select(COLS).eq('slug', slug).maybeSingle()
  if (!data) {
    // Tenant não resolvido: as queries caem no uuid-nulo (estado vazio) em vez de estourar.
    console.warn(`[tenant] nenhum tenant para o host "${host}" (nem por dominio, nem por slug "${slug}") — verifique tenants.dominio/slug ou NEXT_PUBLIC_DEFAULT_TENANT_SLUG.`)
  }
  return (data as Tenant | null) ?? null
})

export async function getCurrentTenantId(): Promise<string | null> {
  const tenant = await getCurrentTenant()
  return tenant?.id ?? null
}
