/**
 * R19 — faixa semanal, e R9 — subtítulo recalculado.
 *
 * No gerador legado as duas saíam do TEXTO do nome do cronograma, o que fazia renomear
 * "12 Matérias (6 horas)" para "12 Matérias – 6h" mudar silenciosamente o grupo em que
 * ele aparecia. Aqui a faixa é lida de `dias_curso`, que é onde a informação realmente
 * está, e o subtítulo é derivado da grade já montada.
 */

import type { ResumoGrade } from './tipos'

/**
 * R19 — deduzida do maior dia de curso usado.
 * Domingo (0) conta como o mais alto, porque na semana de estudo ele é o último dia.
 */
export function faixaSemanal(diasCurso: number[]): string {
  if (!diasCurso.length) return 'Segunda - Sexta'
  const maior = Math.max(...diasCurso.map((d) => (d === 0 ? 7 : d)))
  if (maior >= 7) return 'Semana Completa'
  if (maior === 6) return 'Segunda - Sábado'
  return 'Segunda - Sexta'
}

/** Rótulo do seletor de cronogramas (spec §4, passo 4). */
export function rotuloCronograma(nome: string, diasCurso: number[]): string {
  return `${nome} (${faixaSemanal(diasCurso)})`
}

const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`

/**
 * R9 — "X semanas de conteúdo + Y revisão(ões) periódica(s) + Z semana(s) de recesso".
 * Recalculado a cada mudança; ignora o `subtitulo` gravado no cadastro.
 */
export function subtituloGrade(r: Pick<ResumoGrade, 'semanasConteudo' | 'semanasRevisao' | 'semanasRecesso'>): string {
  const partes = [plural(r.semanasConteudo, 'semana de conteúdo', 'semanas de conteúdo')]
  if (r.semanasRevisao > 0) partes.push(plural(r.semanasRevisao, 'revisão periódica', 'revisões periódicas'))
  if (r.semanasRecesso > 0) partes.push(plural(r.semanasRecesso, 'semana de recesso', 'semanas de recesso'))
  return partes.join(' + ')
}
