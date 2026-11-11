import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export const UUID_META_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** metaId vem do cliente: precisa ser UUID (senão o Postgres devolve 500) e ser uma meta DO cronograma da emissão
 *  (senão dava para gravar check/nota de meta alheia). Só vale para MARCAR/ESCREVER; desmarcar aceita meta órfã
 *  (catálogo reimportado) — basta ser UUID. */
export async function metaDoCronograma(svc: SupabaseClient, tenantId: string, cronogramaId: string, metaId: string): Promise<boolean> {
  if (!UUID_META_RE.test(metaId)) return false
  const { data } = await svc.from('simulado_cronograma_metas').select('id')
    .eq('tenant_id', tenantId).eq('cronograma_id', cronogramaId).eq('id', metaId).maybeSingle()
  return !!data
}
