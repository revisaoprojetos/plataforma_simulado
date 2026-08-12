import { getGamConfig } from './config'
import { nivelParaXp, ligaParaXp } from './niveis'

export interface CacheEstudante {
  tenant_id: string
  estudante_id: string
  xp_total: number
  nivel: number
  liga: string
  streak_atual: number
  streak_maior: number
  ultimo_dia_ativo: string | null
}

/**
 * Recalcula o cache do aluno de forma AUTORITATIVA a partir do ledger (SUM via RPC) e
 * deriva nível/liga da config. Preserva os campos de streak (mantidos por streak.ts).
 * O cache é sempre reconstruível do ledger — se divergir, este recompute conserta.
 */
export async function recomputarCache(svc: any, tenantId: string, estudanteId: string): Promise<CacheEstudante> {
  const config = await getGamConfig(svc, tenantId)
  const { data: totalRaw } = await svc.rpc('rpc_xp_total', { p_tenant: tenantId, p_estudante: estudanteId })
  const xpTotal = Number(totalRaw ?? 0)
  const nivel = nivelParaXp(xpTotal, config!.nivel_curva)
  const liga = ligaParaXp(xpTotal, config!.ligas).id

  const { data: existing } = await svc
    .from('simulado_gamificacao_estudante')
    .select('streak_atual, streak_maior, ultimo_dia_ativo')
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId)
    .maybeSingle()

  const row: CacheEstudante = {
    tenant_id: tenantId,
    estudante_id: estudanteId,
    xp_total: xpTotal,
    nivel,
    liga,
    streak_atual: existing?.streak_atual ?? 0,
    streak_maior: existing?.streak_maior ?? 0,
    ultimo_dia_ativo: existing?.ultimo_dia_ativo ?? null,
  }
  await svc
    .from('simulado_gamificacao_estudante')
    .upsert({ ...row, atualizado_em: new Date().toISOString() }, { onConflict: 'tenant_id,estudante_id' })
  return row
}

/** Garante que existe uma linha de cache para o aluno (cria via recompute se faltar). */
export async function ensureCacheRow(svc: any, tenantId: string, estudanteId: string): Promise<void> {
  const { data } = await svc
    .from('simulado_gamificacao_estudante')
    .select('id')
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId)
    .maybeSingle()
  if (!data) await recomputarCache(svc, tenantId, estudanteId)
}

/**
 * Reconstrói o cache de TODOS os alunos do tenant a partir do ledger. Usado no backfill,
 * em reparo e quando os limites de liga mudam (a liga guardada precisa ser recalculada).
 */
export async function rebuildCacheTenant(svc: any, tenantId: string): Promise<number> {
  const config = await getGamConfig(svc, tenantId)
  if (!config) return 0
  // IDs distintos de alunos com eventos (paginado para não estourar o teto de 1000).
  const ids = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await svc
      .from('simulado_xp_eventos')
      .select('estudante_id')
      .eq('tenant_id', tenantId)
      .order('estudante_id')
      .range(from, from + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const r of data) ids.add(r.estudante_id)
    if (data.length < 1000) break
  }
  let n = 0
  for (const estId of ids) { await recomputarCache(svc, tenantId, estId); n++ }
  return n
}
