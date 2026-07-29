import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { LoginEpic } from '@/components/auth/login-epic'
import { getConfigGlobal } from '@/lib/config-global'
import { getCurrentTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  // Autenticar-first: se já há sessão (cookie do domínio), o LoginEpic pula pro seletor.
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  const jaLogado = !!user
  const tenantAtualId = await getCurrentTenantId()

  // ENTRADA NEUTRA: nome/logo do PRODUTO (config global), NUNCA de um tenant. Assim o login
  // é idêntico em toda plataforma/subdomínio (nada de marca do Revisão). Fallback genérico.
  const cfg = await getConfigGlobal()
  const comoLogo = (v: unknown) => (typeof v === 'string' && /^(https?:|data:image)/.test(v) ? v : null)
  const marca = {
    nome: cfg?.entrada_nome || 'Simulados',
    logo: comoLogo(cfg?.entrada_logo_url),
  }

  return (
    <Suspense fallback={null}>
      <LoginEpic marca={marca} jaLogado={jaLogado} tenantAtualId={tenantAtualId} />
    </Suspense>
  )
}
