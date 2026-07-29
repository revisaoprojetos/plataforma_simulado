import { Suspense } from 'react'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { LoginEpic, type Plataforma } from '@/components/auth/login-epic'
import { getConfigGlobal } from '@/lib/config-global'
import { getCurrentTenantId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const svc = createAdminClient()
  // Autenticar-first: se já há sessão (cookie do domínio), o LoginEpic pula pro seletor.
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  const jaLogado = !!user
  const tenantAtualId = await getCurrentTenantId()
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
    logoBg: (t.tema?.logo_png_bg as string) ?? '#ffffff',
    logoEstilo: (t.tema?.logo_estilo as string) ?? 'arredondado',
    logoFiltro: (t.tema?.logo_filtro_login as string) ?? (t.tema?.logo_filtro as string) ?? 'none',
    selecao: t.tema?.login_selecao !== false,
    cor: t.tema?.cor_primaria ?? null,
    modoPadrao: t.tema?.modo_padrao === 'dark' ? 'dark' : 'light',
  }))

  // Marca NEUTRA da entrada: vem da config GLOBAL (não de um tenant). Fallback ao
  // comportamento antigo (plataformas[0]) enquanto a config global não estiver preenchida,
  // para não mudar a aparência atual antes do super-admin configurar a entrada neutra.
  const cfg = await getConfigGlobal()
  const marca = {
    nome: cfg?.entrada_nome || plataformas[0]?.nome || 'Plataforma de Simulados',
    logo: cfg?.entrada_logo_url ?? plataformas[0]?.logo ?? null,
    logoGrande: cfg?.entrada_logo_url ?? plataformas[0]?.logoGrande ?? null,
    cor: cfg?.entrada_cor ?? plataformas[0]?.cor ?? null,
    modoPadrao: cfg?.entrada_modo ?? plataformas[0]?.modoPadrao ?? 'light',
    loginLayout: cfg?.login_layout ?? plataformas[0]?.loginLayout ?? 'painel',
    logoBg: plataformas[0]?.logoBg ?? '#ffffff',
    logoEstilo: plataformas[0]?.logoEstilo ?? 'arredondado',
    logoFiltro: cfg?.logo_filtro_login ?? plataformas[0]?.logoFiltro ?? 'none',
    // Só faz sentido pular a seleção com uma plataforma; com várias, mantém a escolha.
    mostrarSelecao: plataformas.length > 1 ? true : (cfg?.login_selecao ?? plataformas[0]?.selecao ?? true),
  }

  return (
    <Suspense fallback={null}>
      <LoginEpic marca={marca} jaLogado={jaLogado} tenantAtualId={tenantAtualId} />
    </Suspense>
  )
}
