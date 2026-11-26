import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'
import { dominioCookieDeHost } from './cookie-domain'

/**
 * Domínio do cookie de sessão — DINÂMICO por host. Cada tenant pode ter seu próprio domínio
 * (ex.: simulados.vikhdigital.com), então o cookie precisa ser escopado ao domínio ATUAL
 * (.vikhdigital.com), não a um fixo. Um domínio fixo (.revisaopge.com.br) é REJEITADO pelo
 * navegador em qualquer outro domínio → login não persiste. Resolve o domínio registrável do host.
 */
async function dominioAtual(): Promise<string | undefined> {
  // Usa x-forwarded-host (host real do aluno atrás do Traefik) antes do host cru, senão o cookie
  // é escopado ao domínio errado e o login não persiste.
  try { const h = await headers(); return dominioCookieDeHost(h.get('x-forwarded-host') || h.get('host')) } catch { return undefined }
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
// Singleton por processo: o client service-role é stateless (sem sessão/cookies), então reusar é seguro
// e evita reconstruir o PostgREST/GoTrue client (e re-ler env) a cada chamada.
const g = globalThis as unknown as { __adminSb?: SupabaseClient<any, 'public', any> }

const ADMIN_FETCH_TIMEOUT_MS = 25_000
const ADMIN_RETRY_BACKOFF_MS = 250

/** Combina o signal do chamador (se houver) com o timeout; qualquer um que disparar aborta. */
function sinalComTimeout(orig: AbortSignal | null | undefined): AbortSignal {
  const t = AbortSignal.timeout(ADMIN_FETCH_TIMEOUT_MS)
  if (!orig) return t
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any
  if (any) return any([orig, t])
  const c = new AbortController()
  const abort = (s: AbortSignal) => () => c.abort(s.reason)
  if (orig.aborted) c.abort(orig.reason); else orig.addEventListener('abort', abort(orig), { once: true })
  t.addEventListener('abort', abort(t), { once: true })
  return c.signal
}

/**
 * fetch do cliente admin: timeout de 25s (preservando o signal do chamador) e 1 retry com backoff curto SÓ para leituras
 * idempotentes (GET/HEAD) em deadlock (40P01) ou falha de rede. Escritas (POST/PATCH/PUT/DELETE) nunca são repetidas.
 */
export async function fetchAdminResiliente(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const metodo = (init?.method ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase()
  const idempotente = metodo === 'GET' || metodo === 'HEAD'
  const chamar = () => fetch(input, { ...init, signal: sinalComTimeout(init?.signal) })
  if (!idempotente) return chamar()
  const espera = () => new Promise((r) => setTimeout(r, ADMIN_RETRY_BACKOFF_MS + Math.floor(Math.random() * 150)))
  try {
    const res = await chamar()
    if (res.status === 409 || res.status === 500 || res.status === 503) {
      const corpo = await res.clone().text().catch(() => '')
      if (/40P01|deadlock detected/i.test(corpo) && !init?.signal?.aborted) { await espera(); return await chamar() }
    }
    return res
  } catch (e) {
    const err = e as { name?: string }
    // Abort do chamador não é repetido; timeout próprio (TimeoutError) e erro de rede (TypeError) sim, 1 vez.
    if (init?.signal?.aborted || err?.name === 'AbortError') throw e
    await espera()
    return chamar()
  }
}

export function createAdminClient(): SupabaseClient<any, 'public', any> {
  return (g.__adminSb ??= createSupabaseClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchAdminResiliente } },
  ))
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
