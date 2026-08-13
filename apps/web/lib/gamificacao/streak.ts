import { getGamConfig } from './config'
import { diaLocal } from './datas'
import { ensureCacheRow } from './cache'
import { awardXp } from './xp'

const diaNum = (dia: string) => Math.floor(Date.parse(dia + 'T00:00:00Z') / 86_400_000)

/**
 * Registra atividade diária do aluno e mantém a sequência (streak). Idempotente por dia:
 * chamar várias vezes no mesmo dia não repete a contagem nem o XP. Concede XP de streak
 * (crescente, limitado pelo cap) e o "baú" a cada N dias.
 */
export async function registrarAtividade(svc: any, { tenantId, estudanteId }: { tenantId: string; estudanteId: string }): Promise<void> {
  const config = await getGamConfig(svc, tenantId)
  if (!config?.ativo) return

  const hoje = diaLocal(config.timezone)
  const { data: row } = await svc
    .from('simulado_gamificacao_estudante')
    .select('streak_atual, streak_maior, ultimo_dia_ativo')
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId)
    .maybeSingle()

  const ultimo: string | null = row?.ultimo_dia_ativo ?? null
  if (ultimo === hoje) return // já contou hoje

  // Tolerância (grace): mantém a sequência se o intervalo desde a última atividade couber na folga.
  const tol = Math.max(0, config.xp_regras.streak.tolerancia_dias ?? 0)
  let streak = 1
  if (ultimo) {
    const gap = diaNum(hoje) - diaNum(ultimo)
    if (gap >= 1 && gap <= 1 + tol) streak = (row?.streak_atual ?? 0) + 1
  }
  const maior = Math.max(row?.streak_maior ?? 0, streak)

  await ensureCacheRow(svc, tenantId, estudanteId)
  await svc
    .from('simulado_gamificacao_estudante')
    .update({ streak_atual: streak, streak_maior: maior, ultimo_dia_ativo: hoje, atualizado_em: new Date().toISOString() })
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId)

  // XP diário de streak: cresce com a sequência, limitado pelo cap.
  const { por_dia, cap } = config.xp_regras.streak
  const xpDia = Math.min(Math.max(1, por_dia) * streak, Math.max(por_dia, cap))
  await awardXp(svc, { tenantId, estudanteId, origem: 'streak', refId: hoje, xp: xpDia, meta: { streak } })

  // Baú a cada N dias de sequência.
  const n = config.xp_regras.chest.cada_n_dias
  if (n > 0 && streak % n === 0) {
    await awardXp(svc, { tenantId, estudanteId, origem: 'chest', refId: `chest-${streak}`, xp: config.xp_regras.chest.xp, meta: { streak } })
  }
}
