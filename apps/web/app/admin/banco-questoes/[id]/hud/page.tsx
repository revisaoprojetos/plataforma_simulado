import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
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
  return (
    <div className="p-4">
      <BancoHudDesigner bancoId={id} titulo={titulo} baseInicial={base} porPaginaInicial={porPagina} voltarHref={`/admin/banco-questoes/${id}?tab=hud`} />
    </div>
  )
}
