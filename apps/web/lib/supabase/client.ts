import { createBrowserClient } from '@supabase/ssr'
import { dominioCookieDeHost } from './cookie-domain'

// Domínio do cookie DINÂMICO por host (igual ao servidor): o refresh de token no navegador
// reescreve o cookie no domínio registrável do host ATUAL (ex.: .vikhdigital.com,
// .revisaopge.com.br), mantendo a sessão válida em cada domínio próprio de tenant. Um domínio
// fixo quebraria o login em qualquer domínio diferente. localhost/IP → por-host (dev).
export function createClient() {
  const dom = typeof window !== 'undefined' ? dominioCookieDeHost(window.location.host) : undefined
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    dom ? { cookieOptions: { domain: dom } } : undefined,
  )
}
