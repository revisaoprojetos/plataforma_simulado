import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { normalizarManutencaoAreas, ocultarDiscursivaDe, type ManutencaoAreas } from './manutencao-areas'

/**
 * Lê o mapa de áreas em manutenção do tenant atual. Seleciona só o caminho jsonb
 * (`tema->manutencao_areas`) para NÃO puxar os logos base64 do tema. Fail-open: qualquer
 * erro → nada em manutenção (nunca trancar por bug de leitura).
 */
export async function getManutencaoAreas(): Promise<ManutencaoAreas> {
  try {
    const tid = await getCurrentTenantId()
    const svc = createAdminClient()
    const base = svc.from('simulado_tenants').select('m:tema->manutencao_areas')
    const { data } = tid
      ? await base.eq('id', tid).maybeSingle()
      : await base.eq('ativo', true).limit(1).maybeSingle()
    return normalizarManutencaoAreas((data as { m?: unknown } | null)?.m)
  } catch {
    return normalizarManutencaoAreas(null)
  }
}

/** A discursiva deve ser escondida agora? (env global OU manutenção por-tenant.) Para server components. */
export async function getOcultarDiscursiva(): Promise<boolean> {
  return ocultarDiscursivaDe(await getManutencaoAreas())
}
