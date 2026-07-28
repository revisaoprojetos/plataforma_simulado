import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * Domínio do cookie de sessão. Quando definido (ex.: ".revisaopge.com.br"), a
 * sessão passa a valer em TODOS os subdomínios (login compartilhado entre
 * plataformas). Se vazio (dev/localhost), mantém o comportamento por-host —
 * nada muda. Precisa ser NEXT_PUBLIC_ porque o cliente do navegador também usa.
 */
const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim() || undefined

/** Injeta o domínio nas opções do cookie (set E delete usam o mesmo escopo). */
function comDominio(options?: Record<string, unknown>) {
  return COOKIE_DOMAIN ? { ...(options ?? {}), domain: COOKIE_DOMAIN } : options
}

/**
 * Cliente service-role REAL (sem sessão de usuário) — bypassa RLS de fato.
 * Use APENAS em operações administrativas confiáveis (gestão de tenants,
 * onboarding, seeds). O createServiceClient abaixo herda a sessão dos cookies
 * e por isso NÃO bypassa o RLS quando há usuário logado.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, comDominio(options) as Parameters<typeof cookieStore.set>[2])
            )
          } catch {}
        },
      },
    }
  )
}

export async function createServiceClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, comDominio(options) as Parameters<typeof cookieStore.set>[2])
            )
          } catch {}
        },
      },
    }
  )
}
