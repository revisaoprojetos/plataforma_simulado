import { createAdminClient } from '@/lib/supabase/server'
import { HUD_CORES_PADRAO, type HudCores, type HudPorPagina } from '@/lib/caderno-designer/types'

export interface HudConfigResolvido {
  base: HudCores
  porPagina: HudPorPagina
  /** id do caderno cujo tema/HUD foi aplicado (null = padrão) */
  cadernoId: string | null
}

const VAZIO: HudConfigResolvido = { base: HUD_CORES_PADRAO, porPagina: {}, cadernoId: null }

function montar(config: any, cadernoId: string | null): HudConfigResolvido {
  const hc = config?.hudCores
  const base = hc ? { ...HUD_CORES_PADRAO, ...hc } : HUD_CORES_PADRAO
  const porPagina = config?.hudPorPagina && typeof config.hudPorPagina === 'object' ? (config.hudPorPagina as HudPorPagina) : {}
  return { base, porPagina, cadernoId }
}

/**
 * Resolve o HUD (cores/estilo por página) do simulado — pela ENTREGA V2: `simulado.regras.banco_base_id`
 * → `simulado_pastas.hud`. Cai no padrão quando o banco não tem HUD. (`tenantId` mantido por compat.)
 */
export async function resolverHudConfig(simuladoId: string, _tenantId?: string | null): Promise<HudConfigResolvido> {
  try {
    const svc = createAdminClient()
    const { data: sim } = await svc.from('simulado_simulados').select('regras').eq('id', simuladoId).maybeSingle()
    const bancoId = (sim?.regras as { banco_base_id?: string } | null)?.banco_base_id
    if (bancoId) {
      try {
        const { data: pasta } = await svc.from('simulado_pastas').select('hud').eq('id', bancoId).maybeSingle()
        const hud = (pasta as { hud?: { hudCores?: unknown } } | null)?.hud
        if (hud?.hudCores) return montar(hud, null)
      } catch { /* coluna hud pode não existir ainda */ }
    }
    return VAZIO
  } catch {
    return VAZIO
  }
}
