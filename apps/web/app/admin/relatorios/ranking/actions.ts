'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import type { CriteriosRanking } from '@/lib/simulado/ranking'

/** Salva os critérios de ranking no `regras.ranking` do simulado (por simulado). */
export async function salvarCriteriosRanking(simuladoId: string, criterios: CriteriosRanking) {
  const svc = await createServiceClient()
  const tenantId = await getCurrentTenantId()
  const { data: sim } = await svc.from('simulado_simulados').select('regras').eq('id', simuladoId).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').maybeSingle()
  if (!sim) return { error: 'Simulado não encontrado.' }
  const regras = { ...((sim.regras as Record<string, unknown>) ?? {}), ranking: criterios }
  const { error } = await svc.from('simulado_simulados').update({ regras }).eq('id', simuladoId).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
  if (error) return { error: error.message }
  return { ok: true }
}
