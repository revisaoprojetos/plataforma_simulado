import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Next 16: convenção `proxy` (substitui o antigo `middleware`). Mesma lógica.
export async function proxy(request: NextRequest) {
  // Expõe o caminho atual aos Server Components (headers().get('x-pathname')) para o gate de rota
  // por permissão no layout do /admin. Reconstruído junto com os cookies do Supabase (sem alterar auth).
  const comPath = () => {
    const h = new Headers(request.headers)
    h.set('x-pathname', request.nextUrl.pathname)                                 // só o caminho (gate de rota do admin)
    h.set('x-full-path', request.nextUrl.pathname + request.nextUrl.search)       // caminho + query (p/ redirectTo pós-login)
    return NextResponse.next({ request: { headers: h } })
  }
  let supabaseResponse = comPath()

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
          supabaseResponse = comPath()
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
    loginUrl.searchParams.set('redirectTo', pathname + request.nextUrl.search) // preserva a query do link
    return NextResponse.redirect(loginUrl)
  }

  // Já autenticado em /login: NÃO pular direto pro /admin — /login é o SELETOR de plataforma
  // (pós-login). Só encaminha se veio de uma página protegida (redirectTo); senão mostra o seletor,
  // para que "Trocar de plataforma" / "Seletor de plataforma" (console) voltem para a escolha.
  if (pathname === '/login' && user) {
    const destino = request.nextUrl.searchParams.get('redirectTo')
    if (destino && destino.startsWith('/') && !destino.startsWith('/login')) {
      return NextResponse.redirect(new URL(destino, request.url))
    }
    return supabaseResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
