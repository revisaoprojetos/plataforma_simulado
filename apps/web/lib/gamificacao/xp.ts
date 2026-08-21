import { recomputarCache } from './cache'

export type OrigemXp = 'simulado' | 'pratica' | 'streak' | 'chest' | 'missao' | 'conquista' | 'meta_dia' | 'backfill' | 'leitura'

export interface AwardArgs {
  tenantId: string
  estudanteId: string
  origem: OrigemXp
  refId: string
  xp: number
  meta?: Record<string, unknown> | null
}

/**
 * Concede XP de forma IDEMPOTENTE: grava no ledger com ON CONFLICT DO NOTHING pela chave
 * (tenant, estudante, origem, ref). Se já existia (finalize rodou 2x, retry, backfill) → no-op,
 * sem tocar o cache. Se inseriu de fato → recalcula o cache (xp_total/nível/liga).
 */
export async function awardXp(svc: any, { tenantId, estudanteId, origem, refId, xp, meta }: AwardArgs): Promise<{ awarded: boolean; xpTotal?: number }> {
  if (!tenantId || !estudanteId || !xp || xp <= 0) return { awarded: false }
  const { data, error } = await svc
    .from('simulado_xp_eventos')
    .upsert(
      [{ tenant_id: tenantId, estudante_id: estudanteId, origem, ref_id: String(refId), xp: Math.round(xp), meta: meta ?? null }],
      { onConflict: 'tenant_id,estudante_id,origem,ref_id', ignoreDuplicates: true },
    )
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) return { awarded: false } // duplicado → já contabilizado
  const cache = await recomputarCache(svc, tenantId, estudanteId)
  return { awarded: true, xpTotal: cache.xp_total }
}
