import { getGamConfig, type GamConfig } from './config'
import { awardXp } from './xp'
import { registrarAtividade } from './streak'
import { progredirMissoes } from './missoes'
import { avaliarConquistas } from './conquistas'
import { gamAtivaParaAluno } from './publico'
import { diaLocal } from './datas'
import { normalizarPontuacaoLeitura, type PontuacaoLeitura } from '@/lib/leitura/pontuacao'
import { normalizarDesafios, progressoDesafio, type DesafioModulo } from '@/lib/leitura/desafios'
import { desempenhoLeituraAluno } from '@/lib/leitura/desafios-eval'

// Contexto de leitura (por MÓDULO) do documento — fonte dos pontos que viram XP (aula + combo) e dos
// desafios do módulo. Config no admin (ModuloPontuacaoForm/ModuloDesafiosForm → simulado_pastas). Tolerante.
async function contextoLeituraDoc(svc: any, tenantId: string, documentoId: string): Promise<{ pastaId: string | null; pontuacao: PontuacaoLeitura; desafios: DesafioModulo[] }> {
  try {
    const { data: doc } = await svc.from('simulado_documentos').select('pasta_id').eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle()
    const pastaId = (doc as any)?.pasta_id ?? null
    if (!pastaId) return { pastaId: null, pontuacao: normalizarPontuacaoLeitura(null), desafios: [] }
    // select com `desafios` (coluna nova) → cai p/ só `pontuacao` se ainda não migrada.
    let r = await svc.from('simulado_pastas').select('pontuacao, desafios').eq('id', pastaId).maybeSingle()
    if (r.error) r = await svc.from('simulado_pastas').select('pontuacao').eq('id', pastaId).maybeSingle()
    const pasta: any = r.data
    return { pastaId, pontuacao: normalizarPontuacaoLeitura(pasta?.pontuacao), desafios: normalizarDesafios(pasta?.desafios) }
  } catch { return { pastaId: null, pontuacao: normalizarPontuacaoLeitura(null), desafios: [] } }
}

// Avalia os DESAFIOS do módulo p/ o aluno e concede o bônus (uma vez por desafio — refId estável no ledger).
async function avaliarDesafiosModulo(svc: any, config: GamConfig, tenantId: string, estudanteId: string, pastaId: string, desafios: DesafioModulo[]): Promise<void> {
  const ativos = desafios.filter((d) => d.ativo && d.xp > 0)
  if (!ativos.length) return
  const desemp = await desempenhoLeituraAluno(svc, tenantId, estudanteId, pastaId)
  const mult = multiplicadorDia(config, diaLocal(config.timezone))
  for (const d of ativos) {
    if (progressoDesafio(d, desemp) >= d.meta) {
      await awardXp(svc, { tenantId, estudanteId, origem: 'leitura', refId: `desafio:${pastaId}:${d.id}`, xp: Math.round(d.xp * mult), meta: { desafio: d.id, pastaId, mult } })
    }
  }
}

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
    if (!config || !(await gamAtivaParaAluno(svc, tenantId, estudanteId, config))) return
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
    if (!config || !(await gamAtivaParaAluno(svc, tenantId, estudanteId, config))) return
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

/** Concluiu a leitura de um documento → XP (uma vez por documento) + streak + missões + conquistas. */
export async function onLeituraConcluida(
  svc: any,
  { tenantId, estudanteId, documentoId }: { tenantId: string | null; estudanteId: string | null; documentoId: string },
): Promise<void> {
  try {
    if (!tenantId || !estudanteId) return
    const config = await getGamConfig(svc, tenantId)
    if (!config || !(await gamAtivaParaAluno(svc, tenantId, estudanteId, config))) return
    // XP por AULA concluída = pontos_aula do módulo (configurável). Idempotente por documento (refId).
    const ctx = await contextoLeituraDoc(svc, tenantId, documentoId)
    const mult = multiplicadorDia(config, diaLocal(config.timezone))
    const xp = Math.round(Math.max(0, ctx.pontuacao.pontos_aula) * mult)
    await awardXp(svc, { tenantId, estudanteId, origem: 'leitura', refId: documentoId, xp, meta: { documentoId, pontos_aula: ctx.pontuacao.pontos_aula, mult } })
    await registrarAtividade(svc, { tenantId, estudanteId })
    await progredirMissoes(svc, { tenantId, estudanteId, evento: 'concluiu_aula_leitura' })
    if (ctx.pastaId) await avaliarDesafiosModulo(svc, config, tenantId, estudanteId, ctx.pastaId, ctx.desafios)
    await avaliarConquistas(svc, { tenantId, estudanteId })
    await verificarMetaDiaria(svc, config, tenantId, estudanteId)
  } catch (e) {
    console.error('[gamificacao] onLeituraConcluida:', (e as Error)?.message)
  }
}

/**
 * Concluiu o quiz "Questões do conteúdo" de uma aula → registra atividade + (se GABARITOU 100%) concede
 * o bônus de COMBO uma ÚNICA vez por documento (refId sem tentativa → não farma ao refazer). O XP por
 * acerto NÃO é creditado aqui: já vem das respostas inline (`onPraticaRespondida`) — evita dupla contagem.
 */
export async function onQuizConcluido(
  svc: any,
  { tenantId, estudanteId, documentoId, acertos, total }: { tenantId: string | null; estudanteId: string | null; documentoId: string; acertos: number; total: number },
): Promise<void> {
  try {
    if (!tenantId || !estudanteId) return
    const config = await getGamConfig(svc, tenantId)
    if (!config || !(await gamAtivaParaAluno(svc, tenantId, estudanteId, config))) return
    await registrarAtividade(svc, { tenantId, estudanteId }) // concluir o quiz conta como atividade do dia
    const ctx = await contextoLeituraDoc(svc, tenantId, documentoId)
    if (total > 0 && acertos >= total) {
      await progredirMissoes(svc, { tenantId, estudanteId, evento: 'gabaritou_quiz_leitura' })
      if (ctx.pontuacao.combo_ativo && ctx.pontuacao.combo_bonus > 0) {
        const mult = multiplicadorDia(config, diaLocal(config.timezone))
        await awardXp(svc, { tenantId, estudanteId, origem: 'leitura', refId: `combo:${documentoId}`, xp: Math.round(ctx.pontuacao.combo_bonus * mult), meta: { documentoId, combo: true, mult } })
      }
    }
    if (ctx.pastaId) await avaliarDesafiosModulo(svc, config, tenantId, estudanteId, ctx.pastaId, ctx.desafios)
    await avaliarConquistas(svc, { tenantId, estudanteId })
    await verificarMetaDiaria(svc, config, tenantId, estudanteId)
  } catch (e) {
    console.error('[gamificacao] onQuizConcluido:', (e as Error)?.message)
  }
}

/** Acesso diário ao portal → registra atividade (streak) + avalia conquistas. */
export async function onAtividadeDiaria(svc: any, { tenantId, estudanteId }: { tenantId: string | null; estudanteId: string | null }): Promise<void> {
  try {
    if (!tenantId || !estudanteId) return
    const config = await getGamConfig(svc, tenantId)
    if (!config || !(await gamAtivaParaAluno(svc, tenantId, estudanteId, config))) return
    await registrarAtividade(svc, { tenantId, estudanteId })
    await avaliarConquistas(svc, { tenantId, estudanteId })
  } catch (e) {
    console.error('[gamificacao] onAtividadeDiaria:', (e as Error)?.message)
  }
}

export { getGamConfig } from './config'
export type { GamConfig } from './config'
export { gamAtivaParaAluno } from './publico'
