/**
 * Formato de uma questão objetiva:
 * - 'multipla'     → múltipla escolha (A–E)
 * - 'certo_errado' → julgamento Certo/Errado (2 opções: Certo e Errado)
 *
 * Certo/Errado NÃO é um `tipo` separado (continua tipo = 'objetiva' para
 * correção/renderização); é só uma CLASSIFICAÇÃO em `simulado_questoes.formato`.
 */
export type FormatoQuestao = 'multipla' | 'certo_errado'

export const FORMATO_LABEL: Record<FormatoQuestao, string> = {
  multipla: 'Múltipla escolha',
  certo_errado: 'Certo/Errado',
}

const _norm = (s?: string) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** O texto do "Tipo" indica Certo/Errado? (aceita "Certo/Errado", "certo errado", "julgamento", "ce"). */
export function tipoEhCertoErrado(tipoRaw?: string): boolean {
  const t = _norm(tipoRaw).replace(/[\s_/-]+/g, '')
  return /^ce$/.test(t) || /certo(e|ou)?errado/.test(t) || /julgamento/.test(t)
}

/** As alternativas são exatamente "Certo" e "Errado"? */
export function alternativasSaoCertoErrado(textos: string[]): boolean {
  const t = textos.map(_norm)
  return t.length === 2 && t.includes('certo') && t.includes('errado')
}

/**
 * Classifica o formato efetivo de uma questão. Usa o valor salvo quando existir;
 * senão, deduz pelas alternativas (útil para questões antigas sem a coluna).
 */
export function classificarFormato(formatoSalvo: string | null | undefined, textosAlternativas: string[] = []): FormatoQuestao {
  if (formatoSalvo === 'certo_errado') return 'certo_errado'
  if (formatoSalvo === 'multipla') return 'multipla'
  return alternativasSaoCertoErrado(textosAlternativas) ? 'certo_errado' : 'multipla'
}
