import { createBrowserClient } from '@supabase/ssr'

// Mesmo domínio de cookie do servidor (lib/supabase/server.ts): quando definido,
// o refresh de token no navegador reescreve o cookie no domínio inteiro, mantendo
// a sessão compartilhada entre subdomínios. Vazio (dev) = comportamento por-host.
const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim() || undefined

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    COOKIE_DOMAIN ? { cookieOptions: { domain: COOKIE_DOMAIN } } : undefined,
  )
}
