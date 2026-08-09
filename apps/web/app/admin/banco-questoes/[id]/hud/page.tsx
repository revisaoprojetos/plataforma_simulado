import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { getTenantTheme } from '@/lib/tenant-theme'
import { carregarHudBanco } from '@/app/admin/banco-questoes/actions'
import { BancoHudDesigner } from '@/components/admin/banco-hud-designer'

export const dynamic = 'force-dynamic'

/** Editor dedicado (full-screen) do HUD do banco — acessado pelo botão "Editar HUD" da aba. */
export default async function BancoHudEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { base, porPagina } = await carregarHudBanco(id)
  const svc = createAdminClient()
  const tid = await getCurrentTenantId()
  const { data } = await svc.from('simulado_pastas').select('nome').eq('id', id).eq('tenant_id', tid ?? '00000000-0000-0000-0000-000000000000').maybeSingle()
  const titulo = ((data as { nome?: string } | null)?.nome ?? 'Simulado') as string

  // Logo do sistema (tenant) — p/ o botão "Usar a logo do sistema" no carregamento.
  const { tema } = await getTenantTheme()
  const ti = (tema ?? {}) as Record<string, unknown>
  const sistemaLogo = {
    url: (ti.logo_url as string | null) ?? null,
    bg: (ti.logo_png_bg as string) ?? '#ffffff',
    estilo: (ti.logo_estilo as string) ?? 'arredondado',
    filtro: (ti.logo_filtro_sistema as string) ?? (ti.logo_filtro as string) ?? 'none',
  }

  return (
    <div className="-m-6 h-screen">
      <BancoHudDesigner bancoId={id} titulo={titulo} baseInicial={base} porPaginaInicial={porPagina} sistemaLogo={sistemaLogo} voltarHref={`/admin/banco-questoes/${id}?tab=hud`} />
    </div>
  )
}
