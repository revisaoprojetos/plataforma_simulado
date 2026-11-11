/**
 * Invariantes de integridade da grade do cronograma LEGADO — módulo PURO.
 *
 * O gerador (`compactarSemanas`) descarta, sem avisar o aluno, as metas de semanas listadas
 * em `semanas_revisao`. Então a regra do cadastro é: semana de revisão NÃO pode ter meta, e
 * nenhuma meta pode ficar fora de `total_semanas` / `dias_curso`. Estas funções devolvem a
 * mensagem em pt-BR (ou null) e são usadas por atualizarCronograma, criar/salvar e metas-actions.
 */

import { parseISO, toISO } from './datas'

/** 'YYYY-MM-DD' que EXISTE no calendário (rejeita 2026-02-31, 2026-13-01 etc.). */
export function dataISOValida(d: unknown): d is string {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  try {
    return toISO(parseISO(d)) === d
  } catch {
    return false
  }
}

export type MetaPosicao ={ semana: number; dia: number }
export type GradeLimites = { total_semanas: number; dias_curso: number[]; semanas_revisao: number[] }

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** Conta metas por semana. */
export function contarPorSemana(metas: MetaPosicao[]): Map<number, number> {
  const m = new Map<number, number>()
  for (const x of metas) m.set(x.semana, (m.get(x.semana) ?? 0) + 1)
  return m
}

/**
 * `semanas_revisao` não pode cruzar semanas que têm metas (as metas sumiriam da grade do aluno).
 * Diz QUAIS semanas e QUANTAS metas.
 */
export function conflitoRevisaoComMetas(metas: MetaPosicao[], semanasRevisao: number[]): string | null {
  if (!semanasRevisao.length) return null
  const porSemana = contarPorSemana(metas)
  const conflitos = [...new Set(semanasRevisao)]
    .filter((s) => (porSemana.get(s) ?? 0) > 0)
    .sort((a, b) => a - b)
  if (!conflitos.length) return null
  const total = conflitos.reduce((acc, s) => acc + (porSemana.get(s) ?? 0), 0)
  const detalhe = conflitos.map((s) => `semana ${s} (${plural(porSemana.get(s) ?? 0, 'meta', 'metas')})`).join(', ')
  return (
    `Não é possível marcar como revisão: ${detalhe} já ${conflitos.length === 1 ? 'tem' : 'têm'} metas cadastradas ` +
    `(${plural(total, 'meta sumiria', 'metas sumiriam')} da grade do aluno). Remova ou remaneje essas metas antes.`
  )
}

/** Metas fora do novo `total_semanas` ou do novo número de `dias_curso`. */
export function metasForaDoLimite(metas: MetaPosicao[], limites: { total_semanas: number; nDias: number }): string | null {
  const foraSemana = metas.filter((m) => m.semana > limites.total_semanas)
  if (foraSemana.length) {
    return `Reduzir para ${limites.total_semanas} semana(s) deixaria ${plural(foraSemana.length, 'meta', 'metas')} fora da grade (a partir da semana ${Math.min(...foraSemana.map((m) => m.semana))}). Remova ou remaneje essas metas antes.`
  }
  const foraDia = metas.filter((m) => m.dia >= limites.nDias)
  if (foraDia.length) {
    const semanas = [...new Set(foraDia.map((m) => m.semana))].sort((a, b) => a - b)
    const amostra = semanas.slice(0, 5).join(', ') + (semanas.length > 5 ? '…' : '')
    return `Reduzir para ${plural(limites.nDias, 'dia', 'dias')} de curso deixaria ${plural(foraDia.length, 'meta', 'metas')} com dia fora do novo limite (semana(s) ${amostra}). Remova ou remaneje essas metas antes.`
  }
  return null
}

/** Valida UMA meta contra a grade (limites + semana de revisão). */
export function validarPosicaoMeta(m: MetaPosicao, g: GradeLimites): string | null {
  if (!Number.isInteger(m.semana) || m.semana < 1 || m.semana > g.total_semanas) {
    return `Semana precisa estar entre 1 e ${g.total_semanas}.`
  }
  if (!Number.isInteger(m.dia) || m.dia < 0 || m.dia >= g.dias_curso.length) {
    return `Dia precisa ser um índice entre 0 e ${g.dias_curso.length - 1} (é a posição dentro dos dias de curso, não o dia da semana).`
  }
  if (g.semanas_revisao.includes(m.semana)) {
    return `A semana ${m.semana} está marcada como semana de revisão e não pode ter metas (elas sumiriam da grade do aluno). Escolha outra semana ou tire-a da lista de revisão.`
  }
  return null
}

/** Validação em lote (mensagem prefixada com a posição da meta). */
export function validarPosicoesEmLote(metas: MetaPosicao[], g: GradeLimites): string | null {
  for (const [i, m] of metas.entries()) {
    const e = validarPosicaoMeta(m, g)
    if (e) return `Meta ${i + 1}: ${e}`
  }
  return null
}
