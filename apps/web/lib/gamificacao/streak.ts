import { getGamConfig } from './config'
import { diaLocal, diaAnterior } from './datas'
import { ensureCacheRow } from './cache'
import { awardXp } from './xp'
import { dispararEngajamento } from './engajamento'

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

  const limiteDia = config.xp_regras.limite_dia || 0

  // XP diário de streak (login): cresce com a sequência, limitado pelo cap. Com por_dia=0 fica sem XP fixo.
  const { por_dia, cap } = config.xp_regras.streak
  if (por_dia > 0) {
    const xpDia = Math.min(por_dia * streak, Math.max(por_dia, cap))
    await awardXp(svc, { tenantId, estudanteId, origem: 'streak', refId: hoje, xp: xpDia, meta: { streak }, dia: hoje, limiteDia })
  }

  // Baú a cada N dias de sequência (ex.: semanal +10 a cada 7 dias).
  const n = config.xp_regras.chest.cada_n_dias
  if (n > 0 && streak % n === 0) {
    await awardXp(svc, { tenantId, estudanteId, origem: 'chest', refId: `chest-${streak}`, xp: config.xp_regras.chest.xp, meta: { streak }, dia: hoje, limiteDia })
  }

  // Marcos de sequência (somam com o baú): ex.: 14 dias +15, 21 dias +35, 30 dias +50. Uma vez por marco.
  for (const m of config.xp_regras.streak.marcos ?? []) {
    if (m && m.dias === streak && m.xp > 0) {
      await awardXp(svc, { tenantId, estudanteId, origem: 'chest', refId: `marco-${m.dias}`, xp: m.xp, meta: { streak, marco: m.dias }, dia: hoje, limiteDia })
    }
  }

  // Engajamento em tempo real (webhook): sequência (N dias) + marcos (7/14/21/30…). Idempotente pelo
  // log; fire-and-forget para não segurar o fluxo do aluno. A INATIVIDADE fica no cron de engajamento.
  const eng = config.engajamento
  if (eng.sequencia.ativo && streak === (eng.sequencia.dias ?? 0)) {
    // Re-incentiva a CADA nova sequência: a chave usa a DATA DE INÍCIO do streak (não o valor), então
    // quebrar e refazer os N dias dispara de novo (início diferente = ref diferente).
    let inicio = hoje
    for (let i = 0; i < streak - 1; i++) inicio = diaAnterior(inicio)
    void dispararEngajamento(svc, { tenantId, estudanteId, tipo: 'sequencia', ref: `seq-${inicio}`, gatilho: eng.sequencia, streakAtual: streak, streakMaior: maior })
  }
  if (eng.marco.ativo && (eng.marco.marcos ?? []).includes(streak)) {
    void dispararEngajamento(svc, { tenantId, estudanteId, tipo: 'marco', ref: `marco-${streak}`, gatilho: eng.marco, streakAtual: streak, streakMaior: maior, marco: streak })
  }
}
