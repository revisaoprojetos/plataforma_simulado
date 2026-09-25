import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_IMPERSONATION, verificarTokenImpersonation } from '@/lib/impersonation/token'
import { decisaoImpersonation } from '@/lib/impersonation/guard-rule'

// Superfícies do ALUNO cobertas pelo guard de visualização (impersonation). Inclui /lgpd para
// permitir bloquear consentimento/solicitação LGPD no modo operável (identidade do titular).
const SUPERFICIES_ALUNO = ['/aluno', '/api/aluno', '/simulado', '/api/simulado', '/embed', '/lgpd']

/**
 * Guard GLOBAL da visualização do aluno (impersonation). read_only bloqueia TODA mutação (não-GET)
 * nas superfícies do aluno — Server Actions inclusive. Ativa SÓ quando há cookie de visualização
 * (`aluno_impersonation`) e NÃO há sessão real do aluno (que sempre tem prioridade). Retorna a
 * resposta de bloqueio (403) ou null p/ seguir o fluxo normal.
 */
async function guardImpersonation(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl
  if (!SUPERFICIES_ALUNO.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null
  const imp = request.cookies.get(COOKIE_IMPERSONATION)?.value
  // Cookie de visualização presente → a VISUALIZAÇÃO tem prioridade (mesmo com uma `aluno_session`
  // residual no navegador do admin). Alunos reais nunca têm esse cookie.
  if (!imp) return null
  const claims = await verificarTokenImpersonation(imp)
  if (!claims) return null
  const d = decisaoImpersonation(claims.action_level, request.method, pathname)
  if (!d.bloquear) return null
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: d.motivo }, { status: 403 })
  return new NextResponse('Ação bloqueada durante a visualização do aluno (somente leitura).', {
    status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

// Next 16: convenção `proxy` (substitui o antigo `middleware`). Mesma lógica.
export async function proxy(request: NextRequest) {
  // Visualização do aluno (impersonation) — barra mutações no modo somente leitura antes de tudo.
  const bloqueio = await guardImpersonation(request)
  if (bloqueio) return bloqueio

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

  // Framing (embed na Curseduca): default SEGURO = framável. SÓ o painel admin/super é protegido
  // contra clickjacking (SAMEORIGIN). Antes era o inverso (allowlist de rotas framáveis + "todo o
  // resto bloqueado"), o que quebrava o embed sempre que o aluno caía numa rota FORA da lista —
  // inclusive a raiz "/" (que redireciona p/ /login) e qualquer rota pública nova. Como o aluno
  // acessa QUASE OBRIGATORIAMENTE pela Curseduca, o embed não pode depender de uma allowlist frágil.
  // ⚠️ frame-ancestors * = qualquer site pode embedar; para restringir, troque por
  //    "frame-ancestors 'self' https://*.curseduca.pro https://membros.revisaoensinojuridico.com.br".
  const protegido = pathname.startsWith('/admin') || pathname.startsWith('/super')
  if (protegido) {
    supabaseResponse.headers.set('X-Frame-Options', 'SAMEORIGIN')
    supabaseResponse.headers.set('Content-Security-Policy', "frame-ancestors 'self'")
  } else {
    supabaseResponse.headers.delete('X-Frame-Options')
    supabaseResponse.headers.set('Content-Security-Policy', 'frame-ancestors *')
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
