import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Next 16: convenção `proxy` (substitui o antigo `middleware`). Mesma lógica.
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const protectedAdminPaths = ['/admin']
  const publicPaths = ['/login', '/auth', '/aluno/login', '/simulado', '/embed']

  const isAdminPath = protectedAdminPaths.some(p => pathname.startsWith(p))

  // Embed routes: permit framing — granular CSP is set in the layout server component
  // after reading allowed origins from the DB. Here we set a permissive default that
  // will be overridden by the layout response headers via next/headers.
  if (pathname.startsWith('/embed/')) {
    supabaseResponse.headers.set('X-Frame-Options', 'ALLOWALL')
    supabaseResponse.headers.set('Content-Security-Policy', "frame-ancestors *")
    return supabaseResponse
  }

  // Rotas do aluno/login PODEM ser embedadas em plataformas externas (ex.: Curseduca).
  // O painel /admin continua protegido contra clickjacking (SAMEORIGIN).
  // ⚠️ frame-ancestors * = qualquer site pode embedar. Para restringir, troque por
  //    "frame-ancestors 'self' https://revisaopge.curseduca.pro https://*.curseduca.pro".
  const framavel = ['/login', '/aluno', '/simulado', '/auth'].some(p => pathname === p || pathname.startsWith(p + '/'))
  if (framavel) {
    supabaseResponse.headers.delete('X-Frame-Options')
    supabaseResponse.headers.set('Content-Security-Policy', 'frame-ancestors *')
  } else {
    supabaseResponse.headers.set('X-Frame-Options', 'SAMEORIGIN')
    supabaseResponse.headers.set('Content-Security-Policy', "frame-ancestors 'self'")
  }

  if (isAdminPath && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
