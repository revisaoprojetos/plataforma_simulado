import { createServerClient } from '@supabase/ssr'
import { createClient as createDirectSupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_IMPERSONATION, verificarTokenImpersonation } from '@/lib/impersonation/token'
import { decisaoImpersonation } from '@/lib/impersonation/guard-rule'
import { dominioCookieDeHost } from '@/lib/supabase/cookie-domain'
import { avaliarOrigem, deveVerificarOrigem, modoCsrf } from '@/lib/seguranca/origem-csrf'
import { frameAncestorsFallback, registrarOrigensBoas, sanearOrigens } from '@/lib/seguranca/frame-ancestors'
import { anexarEnforce, cspEnforce, diretivasScript, gerarNonce, ignoraCspScript, valorReportOnly } from '@/lib/seguranca/csp'

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
  // CSRF do cookie do aluno (SameSite=None p/ iframe): valida Origin/Referer nos POST/PUT/PATCH/DELETE das APIs
  // do aluno. Regras e decisões em lib/seguranca/origem-csrf.ts. ALUNO_CSRF_ORIGIN=off|report|enforce.
  if (deveVerificarOrigem(request.method, request.nextUrl.pathname)) {
    const modo = modoCsrf()
    if (modo !== 'off') {
      const h = request.headers
      const v = avaliarOrigem({ origin: h.get('origin'), referer: h.get('referer'), secFetchSite: h.get('sec-fetch-site'), host: h.get('host'), forwardedHost: h.get('x-forwarded-host') })
      if (!v.ok) {
        console.warn(`[csrf-origin] ${modo === 'enforce' ? 'BLOQUEADO' : 'report'} ${request.method} ${request.nextUrl.pathname} — ${v.motivo}`)
        if (modo === 'enforce') return NextResponse.json({ message: 'Origem da requisição não permitida.' }, { status: 403 })
      }
    }
  }

  // Visualização do aluno (impersonation) — barra mutações no modo somente leitura antes de tudo.
  const bloqueio = await guardImpersonation(request)
  if (bloqueio) return bloqueio

  // Expõe o caminho atual aos Server Components (headers().get('x-pathname')) para o gate de rota
  // por permissão no layout do /admin. Reconstruído junto com os cookies do Supabase (sem alterar auth).
  // CSP de scripts (nonce + strict-dynamic). O Next lê o nonce do header de CSP da REQUISIÇÃO e o aplica aos scripts que emite.
  // Padrão = Report-Only (não bloqueia); CSP_ENFORCE=1 liga o modo bloqueante. Ver lib/seguranca/csp.ts.
  const comCsp = !ignoraCspScript(request.nextUrl.pathname)
  const enforceCsp = cspEnforce()
  const cspNonce = comCsp ? gerarNonce() : ''
  const comPath = () => {
    const h = new Headers(request.headers)
    h.set('x-pathname', request.nextUrl.pathname)                                 // só o caminho (gate de rota do admin)
    h.set('x-full-path', request.nextUrl.pathname + request.nextUrl.search)       // caminho + query (p/ redirectTo pós-login)
    if (comCsp) {
      h.set('x-nonce', cspNonce)
      h.set(enforceCsp ? 'content-security-policy' : 'content-security-policy-report-only', enforceCsp ? diretivasScript(cspNonce) : valorReportOnly(cspNonce))
    }
    return NextResponse.next({ request: { headers: h } })
  }
  let supabaseResponse = comPath()

  // Domínio do cookie DINÂMICO por host (multi-domínio) — TEM que casar com o login, o handoff e o
  // server.ts (todos usam `.vocenadefensoria.com.br` etc.). Se o proxy gravar o cookie renovado SEM
  // domínio (host-only), fica um DUPLICADO do cookie de domínio (mesmo nome, escopos diferentes) e o
  // servidor passa a ler uma sessão ambígua → getUser oscila → loop /admin↔/login (quebra o handoff
  // entre plataformas). Atrás do Traefik, o host real vem em x-forwarded-host (host cru = 0.0.0.0).
  const cookieDom = dominioCookieDeHost(request.headers.get('x-forwarded-host') || request.headers.get('host'))
  // Marca se o getUser RENOVOU o token nesta request (setAll chamado) — nesse caso o cookie de
  // DOMÍNIO acabou de ser gravado fresco/válido, então dá p/ apagar o órfão host-only com segurança.
  let renovou = false

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          renovou = true
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = comPath()
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, { ...(options ?? {}), ...(cookieDom ? { domain: cookieDom } : {}) } as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // @supabase/ssr: se o getUser RENOVAR o token (rotação), os novos cookies ficam em
  // `supabaseResponse`. Ao devolver um redirect (NOVO response), é OBRIGATÓRIO copiar esses
  // cookies — senão a rotação se perde, a sessão não persiste e o navegador entra em LOOP
  // /admin↔/login ("carregando e não termina" pós-login). Padrão oficial do Supabase.
  const redirecionarPreservandoCookies = (url: URL) => {
    const res = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c.name, c.value, c))
    return res
  }

  // AUTO-CURA do cookie host-only ÓRFÃO que o proxy ANTIGO gravava (sem domínio). Ele fica
  // DUPLICADO do cookie de DOMÍNIO (mesmo nome, escopo diferente) e com TOKEN DIVERGENTE → sempre
  // que o servidor lê o órfão (stale) o getUser falha → a sessão cai a cada ação/navegação, não só
  // no login. Expiramos a variante host-only (Set-Cookie SEM Domain) dos cookies de auth do Supabase
  // quando é SEGURO: (a) não há sessão válida (`!user`, o órfão não está segurando nada), ou (b) o
  // token acabou de ser RENOVADO (`renovou`, o cookie de domínio já foi gravado fresco). Fora esses
  // casos (sessão válida que não renovou) NÃO mexe — não dá p/ saber qual cookie o getUser leu, então
  // preserva. O cookie de DOMÍNIO nunca é apagado (chave = nome+domínio+path). Só em prod (cookieDom).
  // DETECÇÃO do par ambíguo: o navegador manda os cookies duplicados no MESMO header `Cookie`
  // (`sb-x=A; sb-x=B`). O Next colapsa em request.cookies.getAll() (só vê 1 valor), então contamos
  // no header CRU. Se um cookie de auth aparece >1x, é a corrupção host-only×domínio → só então
  // apagamos TAMBÉM a variante de domínio (evita deslogar quem teve um getUser transitório null).
  const authCookieRe = /^sb-.+-auth-token(\.\d+)?$/
  const cabCookie = request.headers.get('cookie') || ''
  const ocorrencias = new Map<string, number>()
  for (const par of cabCookie.split(';')) {
    const nome = par.split('=')[0].trim()
    if (nome && authCookieRe.test(nome)) ocorrencias.set(nome, (ocorrencias.get(nome) ?? 0) + 1)
  }
  const finalizar = (res: NextResponse) => {
    if (comCsp) {
      if (enforceCsp) res.headers.set('Content-Security-Policy', anexarEnforce(res.headers.get('Content-Security-Policy'), cspNonce))
      else res.headers.set('Content-Security-Policy-Report-Only', valorReportOnly(cspNonce))
    }
    if (!cookieDom || (user && !renovou)) return res
    for (const c of request.cookies.getAll()) {
      if (!authCookieRe.test(c.name)) continue
      // Variante host-only (sem Domain) — o órfão que o proxy antigo gravava.
      res.headers.append('set-cookie', `${c.name}=; Path=/; Max-Age=0; Secure; SameSite=Lax`)
      // Par duplicado DETECTADO + sem sessão válida → zera também a variante de DOMÍNIO, p/ o usuário
      // re-logar do zero e quebrar o loop "Entrando…". (Com sessão válida ou sem duplicata, não mexe.)
      if (!user && (ocorrencias.get(c.name) ?? 0) > 1) {
        res.headers.append('set-cookie', `${c.name}=; Path=/; Max-Age=0; Secure; SameSite=Lax; Domain=${cookieDom}`)
      }
    }
    return res
  }

  const { pathname } = request.nextUrl

  const protectedAdminPaths = ['/admin']
  const publicPaths = ['/login', '/auth', '/aluno/login', '/simulado', '/embed']

  const isAdminPath = protectedAdminPaths.some(p => pathname.startsWith(p))

  // Embed routes: frame-ancestors via HTTP header (meta tag é ignorado por navegadores).
  // Lê origens_permitidas do tenant via service role. SUCESSO: comportamento inalterado (lista configurada;
  // lista vazia = legado `*` p/ Curseduca enquanto o config não foi preenchido). FALHA na resolução (erro de
  // banco/exceção/tenant não achado): FALHA FECHADA com fallback seguro (lib/seguranca/frame-ancestors.ts) — nunca `*`.
  if (pathname.startsWith('/embed/')) {
    supabaseResponse.headers.delete('X-Frame-Options')
    const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(':')[0]
    let motivoFalha = 'tenant não encontrado'
    try {
      const admin = createDirectSupabaseClient(
        process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      )
      const { data: tenantRow, error: errT } = await admin.from('tenants').select('id').eq('dominio', host).maybeSingle()
      if (errT) throw errT
      if (tenantRow?.id) {
        const { data: ec, error: errC } = await admin.from('simulado_embed_config')
          .select('origens_permitidas')
          .eq('tenant_id', tenantRow.id)
          .maybeSingle()
        if (errC) throw errC
        const origens = sanearOrigens(ec?.origens_permitidas)
        // Config preenchida mas 100% inválida → trata como falha (fail-closed), não como "vazio = legado *".
        if (Array.isArray(ec?.origens_permitidas) && ec.origens_permitidas.length > 0 && origens.length === 0) throw new Error('origens_permitidas inválidas')
        if (origens.length > 0) registrarOrigensBoas(host, origens)
        const csp = origens.length > 0 ? `frame-ancestors 'self' ${origens.join(' ')}` : "frame-ancestors *"
        supabaseResponse.headers.set('Content-Security-Policy', csp)
        return finalizar(supabaseResponse)
      }
    } catch (e) { motivoFalha = `erro: ${(e as Error)?.message ?? 'desconhecido'}` }
    supabaseResponse.headers.set('Content-Security-Policy', frameAncestorsFallback(host, motivoFalha))
    return finalizar(supabaseResponse)
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
    return finalizar(redirecionarPreservandoCookies(loginUrl))
  }

  // Já autenticado em /login: NÃO pular direto pro /admin — /login é o SELETOR de plataforma
  // (pós-login). Só encaminha se veio de uma página protegida (redirectTo); senão mostra o seletor,
  // para que "Trocar de plataforma" / "Seletor de plataforma" (console) voltem para a escolha.
  if (pathname === '/login' && user) {
    const destino = request.nextUrl.searchParams.get('redirectTo')
    if (destino && destino.startsWith('/') && !destino.startsWith('/login')) {
      return finalizar(redirecionarPreservandoCookies(new URL(destino, request.url)))
    }
    return finalizar(supabaseResponse)
  }

  return finalizar(supabaseResponse)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
