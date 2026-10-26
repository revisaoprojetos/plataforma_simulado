import { cache } from 'react'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import { remember } from '@/lib/cache/relatorio-cache'

// Cache cross-request da resolução de tenant por host. O React `cache()` abaixo só dedupe DENTRO de
// um render; sem isto cada NAVEGAÇÃO relê `simulado_tenants`. TTL curto (60s) = auto-cura: mudança de
// tema/domínio/`ativo` aparece em até 60s, sem precisar cravar invalidação no save. `remember` degrada
// sozinho (computa direto se o Redis estiver fora) — o caminho de auth nunca quebra por causa do cache.
const TTL_TENANT = Number(process.env.TENANT_CACHE_TTL ?? 60)

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
  // Atrás do Traefik o `host` cru pode vir interno (ex.: 0.0.0.0) — o host real do aluno chega em
  // `x-forwarded-host`. Sem isto o tenant não resolve e o login do aluno dá "Plataforma não encontrada".
  const host = ((h.get('x-forwarded-host') || h.get('host')) ?? '').split(',')[0].split(':')[0].trim().toLowerCase()
  return remember(`tenant:host:${host || 'none'}`, TTL_TENANT, () => resolverTenantDoBanco(host))
})

/** Resolução de fato (1 ou 2 leituras de `simulado_tenants`). Isolada p/ ser envelopada pelo cache. */
async function resolverTenantDoBanco(host: string): Promise<Tenant | null> {
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
}

export async function getCurrentTenantId(): Promise<string | null> {
  const tenant = await getCurrentTenant()
  return tenant?.id ?? null
}
