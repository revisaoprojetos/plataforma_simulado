import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'

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
 * Usa service role para a resolução (acontece antes de haver contexto de RLS).
 */
export async function getCurrentTenant(): Promise<Tenant | null> {
  const h = await headers()
  const host = (h.get('host') ?? '').split(':')[0]
  const parts = host.split('.')

  let slug = process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG ?? 'demo'
  if (parts.length === 2 && parts[1] === 'localhost' && parts[0] !== 'www') {
    // Dev: {slug}.localhost → usa o slug (ex.: revisaopge.localhost)
    slug = parts[0]
  } else if (parts.length >= 3 && !['www', 'localhost'].includes(parts[0])) {
    // Produção: {slug}.dominio.com
    slug = parts[0]
  }

  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('simulado_tenants')
    .select('id, nome, slug, tema, plano, ativo')
    .eq('slug', slug)
    .maybeSingle()

  if (!data) {
    // Tenant não resolvido: as queries caem no uuid-nulo (estado vazio) em vez de estourar.
    // Aviso visível no log para diagnosticar slug/subdomínio errado (ver NEXT_PUBLIC_DEFAULT_TENANT_SLUG).
    console.warn(`[tenant] nenhum tenant com slug "${slug}" (host "${host}") — verifique NEXT_PUBLIC_DEFAULT_TENANT_SLUG ou o subdomínio.`)
  }

  return (data as Tenant | null) ?? null
}

export async function getCurrentTenantId(): Promise<string | null> {
  const tenant = await getCurrentTenant()
  return tenant?.id ?? null
}
