import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { LoginEpic } from '@/components/auth/login-epic'
import { AlunoEntrarForm } from '@/components/aluno/aluno-entrar-form'
import { resolverLoginConfig } from '@/lib/login-config'
import { getConfigGlobal } from '@/lib/config-global'
import { getCurrentTenant, getCurrentTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  const jaLogado = !!user
  const tenant = await getCurrentTenant()
  const tenantAtualId = tenant?.id ?? (await getCurrentTenantId())

  // NÃO LOGADO + tenant resolvido → tela de login BRANDED da empresa (modo admin: e-mail + senha),
  // a MESMA que o aluno vê, montada no console. Após autenticar, o form manda para /login já com
  // sessão → cai no seletor/console abaixo (super-admin) ou é levado ao /admin (admin comum).
  if (!jaLogado && tenant) {
    const tema = (tenant.tema ?? {}) as any
    return (
      <AlunoEntrarForm
        modoInicial="admin"
        metodo="email"
        plataforma={tema.nome_site ?? tenant.nome ?? 'Plataforma'}
        logo={tema.logo_url ?? null}
        subtitulo={tema.subtitulo_site ?? null}
        logoBg={tema.logo_png_bg ?? '#ffffff'}
        logoEstilo={tema.logo_estilo ?? 'arredondado'}
        logoFiltro={tema.logo_filtro_sistema ?? tema.logo_filtro ?? 'none'}
        config={resolverLoginConfig(tema.login)}
      />
    )
  }

  // LOGADO (ou host neutro sem tenant): entrada neutra do produto + seletor de plataformas/console.
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
