import { getGamConfig, type GamConfig } from './config'
import { awardXp } from './xp'
import { registrarAtividade } from './streak'
import { progredirMissoes } from './missoes'
import { avaliarConquistas } from './conquistas'
import { diaLocal } from './datas'

// Multiplicador de XP do dia (bônus de fim de semana), aplicado a simulado/prática.
function multiplicadorDia(config: GamConfig, dia: string): number {
  const fs = config.xp_regras.fim_semana
  if (!fs?.ativo) return 1
  const dow = new Date(dia + 'T00:00:00Z').getUTCDay() // 0=Dom, 6=Sáb
  return dow === 0 || dow === 6 ? Math.max(1, fs.multiplicador || 1) : 1
}

// Bônus de meta diária: ao cruzar o alvo de XP no dia, concede o bônus (uma vez por dia).
async function verificarMetaDiaria(svc: any, config: GamConfig, tenantId: string, estudanteId: string): Promise<void> {
  const md = config.xp_regras.meta_dia
  if (!md?.xp || !md.bonus) return
  const hoje = diaLocal(config.timezone)
  let xpHoje = 0
  try {
    const { data } = await svc.rpc('rpc_xp_dia', { p_tenant: tenantId, p_estudante: estudanteId, p_tz: config.timezone })
    xpHoje = Number(data ?? 0)
  } catch { return } // RPC ainda não migrada → recurso inerte
  if (xpHoje >= md.xp) await awardXp(svc, { tenantId, estudanteId, origem: 'meta_dia', refId: hoje, xp: md.bonus, meta: { xpHoje, alvo: md.xp } })
}

// Fachada de orquestração da gamificação. TODAS as funções são idempotentes e engolem os
// próprios erros (log) — chamadas a partir das rotas SEMPRE via `void ...` para nunca quebrar
// o finalize/prática (mesma disciplina de webhooks/audit). Gated pelo flag `ativo` do tenant.

/** Concluiu um simulado → XP (base + acertos + bônus por nota) + streak + missões + conquistas. */
export async function onSimuladoFinalizado(
  svc: any,
  { tenantId, estudanteId, sessaoId, nota, acertos, total }: { tenantId: string | null; estudanteId: string | null; sessaoId: string; nota: number; acertos: number; total: number },
): Promise<void> {
  try {
    if (!tenantId || !estudanteId) return
    const config = await getGamConfig(svc, tenantId)
    if (!config?.ativo) return
    const r = config.xp_regras.simulado
    const mult = multiplicadorDia(config, diaLocal(config.timezone))
    const bonusNota = Math.round((r.bonus_nota_max ?? 0) * (Number(nota || 0) / 100))
    const xp = Math.round(((r.base ?? 0) + (r.por_acerto ?? 0) * (acertos ?? 0) + bonusNota) * mult)
    await awardXp(svc, { tenantId, estudanteId, origem: 'simulado', refId: sessaoId, xp, meta: { nota, acertos, total, mult } })
    await registrarAtividade(svc, { tenantId, estudanteId })
    await progredirMissoes(svc, { tenantId, estudanteId, evento: 'finalizou_simulado' })
    if (acertos > 0) await progredirMissoes(svc, { tenantId, estudanteId, evento: 'acertou_questao', quantidade: acertos })
    await avaliarConquistas(svc, { tenantId, estudanteId })
    await verificarMetaDiaria(svc, config, tenantId, estudanteId)
  } catch (e) {
    console.error('[gamificacao] onSimuladoFinalizado:', (e as Error)?.message)
  }
}

/** Respondeu uma questão avulsa (prática) → atividade + missões + (se acertou) XP + bônus disciplina fraca. */
export async function onPraticaRespondida(
  svc: any,
  { tenantId, estudanteId, respostaId, correta, disciplinaId }: { tenantId: string | null; estudanteId: string | null; respostaId: string; correta: boolean; disciplinaId: string | null },
): Promise<void> {
  try {
    if (!tenantId || !estudanteId) return
    const config = await getGamConfig(svc, tenantId)
    if (!config?.ativo) return
    await registrarAtividade(svc, { tenantId, estudanteId }) // praticar conta como atividade (streak), mesmo errando
    await progredirMissoes(svc, { tenantId, estudanteId, evento: 'praticou' })
    if (correta) {
      const r = config.xp_regras.pratica
      let bonus = 0
      if (disciplinaId && (r.bonus_disc_fraca ?? 0) > 0) {
        const { data: hist } = await svc
          .from('simulado_respostas_avulsas')
          .select('correta')
          .eq('estudante_id', estudanteId).eq('disciplina_id', disciplinaId)
          .limit(200)
        const arr = (hist ?? []) as any[]
        if (arr.length >= 5) {
          const aproveitamento = arr.filter((x) => x.correta).length / arr.length
          if (aproveitamento < 0.5) bonus = r.bonus_disc_fraca
        }
      }
      const mult = multiplicadorDia(config, diaLocal(config.timezone))
      await awardXp(svc, { tenantId, estudanteId, origem: 'pratica', refId: respostaId, xp: Math.round(((r.por_acerto ?? 0) + bonus) * mult), meta: { disciplinaId, bonus, mult } })
      await progredirMissoes(svc, { tenantId, estudanteId, evento: 'acertou_questao' })
    }
    await avaliarConquistas(svc, { tenantId, estudanteId })
    await verificarMetaDiaria(svc, config, tenantId, estudanteId)
  } catch (e) {
    console.error('[gamificacao] onPraticaRespondida:', (e as Error)?.message)
  }
}

/** Acesso diário ao portal → registra atividade (streak) + avalia conquistas. */
export async function onAtividadeDiaria(svc: any, { tenantId, estudanteId }: { tenantId: string | null; estudanteId: string | null }): Promise<void> {
  try {
    if (!tenantId || !estudanteId) return
    const config = await getGamConfig(svc, tenantId)
    if (!config?.ativo) return
    await registrarAtividade(svc, { tenantId, estudanteId })
    await avaliarConquistas(svc, { tenantId, estudanteId })
  } catch (e) {
    console.error('[gamificacao] onAtividadeDiaria:', (e as Error)?.message)
  }
}

export { getGamConfig } from './config'
export type { GamConfig } from './config'
