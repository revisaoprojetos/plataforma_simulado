import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { atualizarPainelSnapshot } from '@/lib/painel/snapshot'
import { marcarDesempenhoDesatualizado } from '@/lib/desempenho/snapshot'

/** Depois de mudar o plano em foco (fixar/arquivar/renomear/gerar): recomputa o painel e marca o desempenho como
 *  desatualizado (a próxima leitura recomputa `foco`). Best-effort; chamar dentro de `after()` quando possível. */
export async function refrescarAposMudarFoco(svc: SupabaseClient, tenantId: string, estId: string): Promise<void> {
  await Promise.allSettled([
    atualizarPainelSnapshot(svc, tenantId, estId),
    marcarDesempenhoDesatualizado(svc, tenantId, estId),
  ])
}
