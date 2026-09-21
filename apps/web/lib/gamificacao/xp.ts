import { recomputarCache } from './cache'

export type OrigemXp = 'simulado' | 'pratica' | 'streak' | 'chest' | 'missao' | 'conquista' | 'meta_dia' | 'backfill' | 'leitura'

export interface AwardArgs {
  tenantId: string
  estudanteId: string
  origem: OrigemXp
  refId: string
  xp: number
  meta?: Record<string, unknown> | null
  /** Dia local (YYYY-MM-DD) do ganho — carimbado no meta; base do teto diário. */
  dia?: string
  /** Teto de XP do dia (0/undefined = sem teto). Reduz o ganho p/ não passar do teto. */
  limiteDia?: number
}

/**
 * Concede XP de forma IDEMPOTENTE: grava no ledger com ON CONFLICT DO NOTHING pela chave
 * (tenant, estudante, origem, ref). Se já existia (finalize rodou 2x, retry, backfill) → no-op,
 * sem tocar o cache. Se inseriu de fato → recalcula o cache (xp_total/nível/liga).
 * Com `dia` + `limiteDia`, aplica TETO DIÁRIO: soma o XP já ganho hoje (meta.dia) e corta o excedente.
 */
export async function awardXp(svc: any, { tenantId, estudanteId, origem, refId, xp, meta, dia, limiteDia }: AwardArgs): Promise<{ awarded: boolean; xpTotal?: number; capado?: boolean }> {
  if (!tenantId || !estudanteId || !xp || xp <= 0) return { awarded: false }
  let xpFinal = Math.round(xp)
  // Teto diário: só concede o que ainda cabe no dia (não é atômico — best-effort, aceita leve corrida).
  if (dia && limiteDia && limiteDia > 0) {
    const { data: hoje } = await svc
      .from('simulado_xp_eventos')
      .select('xp')
      .eq('tenant_id', tenantId).eq('estudante_id', estudanteId)
      .filter('meta->>dia', 'eq', dia)
    const somaHoje = (hoje ?? []).reduce((s: number, r: any) => s + (Number(r.xp) || 0), 0)
    const restante = limiteDia - somaHoje
    if (restante <= 0) return { awarded: false, capado: true }
    xpFinal = Math.min(xpFinal, restante)
  }
  const metaFinal = dia ? { ...(meta ?? {}), dia } : (meta ?? null)
  const { data, error } = await svc
    .from('simulado_xp_eventos')
    .upsert(
      [{ tenant_id: tenantId, estudante_id: estudanteId, origem, ref_id: String(refId), xp: xpFinal, meta: metaFinal }],
      { onConflict: 'tenant_id,estudante_id,origem,ref_id', ignoreDuplicates: true },
    )
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) return { awarded: false } // duplicado → já contabilizado
  const cache = await recomputarCache(svc, tenantId, estudanteId)
  return { awarded: true, xpTotal: cache.xp_total }
}
