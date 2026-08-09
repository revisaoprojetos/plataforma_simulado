import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { carregarHudBanco } from '@/app/admin/banco-questoes/actions'
import { BancoHudDesigner } from '@/components/admin/banco-hud-designer'

/** Aba "HUD do simulado" do banco: carrega o HUD salvo no banco e renderiza o designer novo. */
export async function BancoHud({ bancoId, cor = '#6d28d9' }: { bancoId: string; cor?: string }) {
  const { base, porPagina } = await carregarHudBanco(bancoId)
  const svc = createAdminClient()
  const tid = await getCurrentTenantId()
  const { data } = await svc.from('simulado_pastas').select('nome').eq('id', bancoId).eq('tenant_id', tid ?? '00000000-0000-0000-0000-000000000000').maybeSingle()
  const titulo = ((data as { nome?: string } | null)?.nome ?? 'Simulado') as string
  return <BancoHudDesigner bancoId={bancoId} titulo={titulo} baseInicial={base} porPaginaInicial={porPagina} cor={cor} />
}
