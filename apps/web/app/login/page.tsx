import { Suspense } from 'react'
import { createAdminClient } from '@/lib/supabase/server'
import { LoginEpic, type Plataforma } from '@/components/auth/login-epic'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const svc = createAdminClient()
  const { data: tenants } = await svc
    .from('simulado_tenants')
    .select('id, nome, dominio, tema')
    .eq('ativo', true)
    .order('nome')

  // logo configurada em Configurações → Avançado (logo_dark_url / logo_url). Só URL/data-url de imagem.
  const comoLogo = (v: unknown) => (typeof v === 'string' && /^(https?:|data:image)/.test(v) ? v : null)
  const logoDoTema = (tema: any) => comoLogo(tema?.logo_dark_url) ?? comoLogo(tema?.logo_url)
  const plataformas: Plataforma[] = (tenants ?? []).map((t: any) => ({
    id: t.id,
    nome: t.tema?.nome_site || t.nome,
    dominio: t.dominio ?? null,
    logo: logoDoTema(t.tema), // pequena (header)
    logoGrande: comoLogo(t.tema?.logo_grande_url) ?? logoDoTema(t.tema), // grande (painel do login)
    logoSelecao: comoLogo(t.tema?.logo_selecao_url) ?? logoDoTema(t.tema), // bloco de seleção
    selecaoEstilo: (['quadrada', 'redonda', 'borda'].includes(t.tema?.logo_selecao_estilo) ? t.tema.logo_selecao_estilo : 'redonda') as 'quadrada' | 'redonda' | 'borda',
    loginLayout: (t.tema?.login_layout === 'centralizado' ? 'centralizado' : 'painel') as 'painel' | 'centralizado',
    cor: t.tema?.cor_primaria ?? null,
    modoPadrao: t.tema?.modo_padrao === 'dark' ? 'dark' : 'light',
  }))

  const marca = {
    nome: plataformas[0]?.nome ?? 'Plataforma de Simulados',
    logo: plataformas[0]?.logo ?? null,
    logoGrande: plataformas[0]?.logoGrande ?? null,
    cor: plataformas[0]?.cor ?? null,
    modoPadrao: plataformas[0]?.modoPadrao ?? 'light',
    loginLayout: plataformas[0]?.loginLayout ?? 'painel',
  }

  return (
    <Suspense fallback={null}>
      <LoginEpic plataformas={plataformas} marca={marca} />
    </Suspense>
  )
}
