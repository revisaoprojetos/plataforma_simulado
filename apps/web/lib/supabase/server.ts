import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'
import { dominioCookieDeHost } from './cookie-domain'

/**
 * Domínio do cookie de sessão — DINÂMICO por host. Cada tenant pode ter seu próprio domínio
 * (ex.: simulados.vikhdigital.com), então o cookie precisa ser escopado ao domínio ATUAL
 * (.vikhdigital.com), não a um fixo. Um domínio fixo (.revisaopge.com.br) é REJEITADO pelo
 * navegador em qualquer outro domínio → login não persiste. Resolve o domínio registrável do host.
 */
async function dominioAtual(): Promise<string | undefined> {
  try { return dominioCookieDeHost((await headers()).get('host')) } catch { return undefined }
}

/** Injeta o domínio nas opções do cookie (set E delete usam o mesmo escopo). */
function comDominio(options: Record<string, unknown> | undefined, dom: string | undefined) {
  return dom ? { ...(options ?? {}), domain: dom } : options
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
  const dom = await dominioAtual()

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
              cookieStore.set(name, value, comDominio(options, dom) as Parameters<typeof cookieStore.set>[2])
            )
          } catch {}
        },
      },
    }
  )
}

export async function createServiceClient() {
  const cookieStore = await cookies()
  const dom = await dominioAtual()

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
              cookieStore.set(name, value, comDominio(options, dom) as Parameters<typeof cookieStore.set>[2])
            )
          } catch {}
        },
      },
    }
  )
}
