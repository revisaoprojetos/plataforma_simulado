import type { GamConfig } from './config'
import { nivelParaXp, xpAcumuladoParaNivel } from './niveis'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { remember, chaveRelatorio } from '@/lib/cache/relatorio-cache'

export interface MetricasGam {
  simulados: { qtd: number; questoes: number; xp: number }
  banco: { questoes: number; xp: number }
  conquistas: { qtd: number; xp: number }
  recorrentes: { streakDiaMax: number; missoesDia: number; missoesQtd: number; chestXp: number; chestCadaN: number }
  xpUnicoTotal: number      // simulados (gabarito 100%) + banco (1×) + conquistas
  nivelAlcancavel: number   // nível alcançável só com o XP único
  nivelMax: number
  xpParaNivelMax: number
  atingeMaxComUnico: boolean
}

/**
 * Calcula toda a pontuação POSSÍVEL no sistema atual e até que nível o aluno chega:
 * - Simulados: soma do XP máximo (base + acertos*todas as questões + bônus de nota cheio) de todos os publicados.
 * - Banco: XP por acertar cada questão publicada uma vez (a prática é repetível → recorrente).
 * - Conquistas: soma do XP de todas as conquistas (uma vez).
 * - Recorrentes: streak/dia (no teto), missões/dia, baú.
 */
export async function metricasGamificacao(svc: any, tenantId: string, config: GamConfig): Promise<MetricasGam> {
  const xr = config.xp_regras

  // ── Contagens (simulados publicados, questões válidas, banco) — cache 10 min por tenant ──
  // Só os CONTADORES são cacheados (a config entra no cálculo abaixo, sempre fresca).
  const cont = await remember(chaveRelatorio(tenantId, 'gam-metricas-contagens'), 600, async () => {
    let simQtd = 0
    let simQuestoes = 0
    let bancoQuestoes = 0
    const sims = (async () => {
      try {
        const ids = await fetchAll<any>(() =>
          svc.from('simulado_simulados').select('id').eq('tenant_id', tenantId).eq('status', 'publicado').eq('deletado', false).order('id'))
        simQtd = ids.length
        const lista = ids.map((s) => s.id)
        // Contagem em SQL (head+count) por chunk de 80 — em vez de baixar todas as linhas.
        const chunks: string[][] = []
        for (let i = 0; i < lista.length; i += 80) chunks.push(lista.slice(i, i + 80))
        const cs = await Promise.all(chunks.map(async (chunk) => {
          const { count } = await svc.from('simulado_prova_questoes').select('simulado_id', { count: 'exact', head: true })
            .in('simulado_id', chunk).or('anulada.is.null,anulada.eq.false')
          return count ?? 0
        }))
        simQuestoes = cs.reduce((a: number, n: number) => a + n, 0)
      } catch { /* tolerante */ }
    })()
    const banco = (async () => {
      try {
        const { count } = await svc.from('simulado_questoes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'publicada')
        bancoQuestoes = count ?? 0
      } catch { /* tolerante */ }
    })()
    await Promise.all([sims, banco])
    return { simQtd, simQuestoes, bancoQuestoes }
  })
  const { simQtd, simQuestoes, bancoQuestoes } = cont
  const xpSimulados = xr.simulado.base * simQtd + xr.simulado.por_acerto * simQuestoes + xr.simulado.bonus_nota_max * simQtd

  const xpBanco = xr.pratica.por_acerto * bancoQuestoes

  // ── Conquistas (uma vez) ──
  const conqQtd = config.conquistas_def.length
  const xpConquistas = config.conquistas_def.reduce((a, c) => a + (c.xp || 0), 0)

  // ── Recorrentes ──
  const streakDiaMax = Math.max(xr.streak.por_dia, xr.streak.cap)
  const missoesDia = config.missoes_def.reduce((a, m) => a + (m.xp || 0), 0)

  const xpUnicoTotal = xpSimulados + xpBanco + xpConquistas
  const nivelAlcancavel = nivelParaXp(xpUnicoTotal, config.nivel_curva)
  const nivelMax = Math.max(1, config.nivel_curva.nivel_max ?? 30)
  const xpParaNivelMax = xpAcumuladoParaNivel(nivelMax, config.nivel_curva)

  return {
    simulados: { qtd: simQtd, questoes: simQuestoes, xp: xpSimulados },
    banco: { questoes: bancoQuestoes, xp: xpBanco },
    conquistas: { qtd: conqQtd, xp: xpConquistas },
    recorrentes: { streakDiaMax, missoesDia, missoesQtd: config.missoes_def.length, chestXp: xr.chest.xp, chestCadaN: xr.chest.cada_n_dias },
    xpUnicoTotal,
    nivelAlcancavel,
    nivelMax,
    xpParaNivelMax,
    atingeMaxComUnico: xpUnicoTotal >= xpParaNivelMax,
  }
}
