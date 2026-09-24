import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { consumirHandoff } from '@/lib/auth/handoff'
import { dominioCookieDeHost } from '@/lib/supabase/cookie-domain'

/**
 * GET /auth/handoff?code=…&to=/admin — chegada no domínio de DESTINO ao trocar de plataforma.
 * Troca o código (uso único) pela sessão e grava o cookie NESTE domínio (domínio dinâmico), então
 * redireciona sem pedir login. Código inválido/expirado → cai no login desta plataforma.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code') ?? ''
  const toRaw = url.searchParams.get('to') ?? '/admin'
  // Evita open redirect: só caminho relativo interno.
  const to = /^\/(?!\/)/.test(toRaw) ? toRaw : '/admin'

  // HOST PÚBLICO (atrás do Traefik, request.url é o endereço interno 0.0.0.0:3000). Usa os headers
  // encaminhados para montar o redirect e o domínio do cookie no domínio REAL do tenant.
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host
  const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
  const base = `${proto}://${host}`

  const tokens = code ? await consumirHandoff(code) : null
  if (!tokens) return NextResponse.redirect(new URL('/login', base))

  const res = NextResponse.redirect(new URL(to, base))
  const dom = dominioCookieDeHost(host)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) =>
          toSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, { ...(options ?? {}), ...(dom ? { domain: dom } : {}) } as Parameters<typeof res.cookies.set>[2])),
      },
    },
  )
  try {
    await supabase.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token })
  } catch {
    return NextResponse.redirect(new URL('/login', url.origin))
  }
  return res
}
