import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { carregarHudBanco } from '@/app/admin/banco-questoes/actions'
import { BancoHudPreview } from '@/components/admin/banco-hud-preview'

/** Aba "HUD do simulado" do banco: mostra a prévia do tema salvo; edição fica na rota /hud dedicada. */
export async function BancoHud({ bancoId }: { bancoId: string; cor?: string }) {
  const { base, porPagina } = await carregarHudBanco(bancoId)
  const svc = createAdminClient()
  const tid = await getCurrentTenantId()
  const { data } = await svc.from('simulado_pastas').select('nome').eq('id', bancoId).eq('tenant_id', tid ?? '00000000-0000-0000-0000-000000000000').maybeSingle()
  const titulo = ((data as { nome?: string } | null)?.nome ?? 'Simulado') as string
  return <BancoHudPreview bancoId={bancoId} titulo={titulo} base={base} porPagina={porPagina} />
}
