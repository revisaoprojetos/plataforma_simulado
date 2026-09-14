import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { getTenantTheme } from '@/lib/tenant-theme'
import { carregarHudBanco } from '@/app/admin/banco-questoes/actions'
import { bancoDoSimulado } from '@/lib/simulado/banco-do-simulado'
import { BancoHudDesigner } from '@/components/admin/banco-hud-designer'

export const dynamic = 'force-dynamic'

/**
 * Editor dedicado (full-screen) do HUD do simulado — acessado pelo botão "Editar HUD" da aba HUD.
 * Consolidação: o HUD mora no banco container (banco_base_id), mas o editor vive DENTRO da Aplicação
 * de Simulado (não sai mais para a área Banco). Volta para a aba HUD do simulado.
 */
export default async function SimuladoHudEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const svc = createAdminClient()
  const tenantId = await getCurrentTenantId()
  const tid = tenantId ?? '00000000-0000-0000-0000-000000000000'

  const sim = await svc.from('simulado_simulados').select('titulo').eq('id', id).eq('tenant_id', tid).maybeSingle()
  if (!sim.data) redirect('/admin/simulados')
  const bancoId = tenantId ? await bancoDoSimulado(svc, tenantId, id) : null
  if (!bancoId) redirect(`/admin/simulados/${id}?tab=hud`) // sem banco container → volta p/ o CTA da aba

  const { base, porPagina } = await carregarHudBanco(bancoId)
  const titulo = ((sim.data as { titulo?: string }).titulo ?? 'Simulado') as string

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
      <BancoHudDesigner bancoId={bancoId} titulo={titulo} baseInicial={base} porPaginaInicial={porPagina} sistemaLogo={sistemaLogo} voltarHref={`/admin/simulados/${id}?tab=hud`} />
    </div>
  )
}
