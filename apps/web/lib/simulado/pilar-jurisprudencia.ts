// Sub-pilar da JURISPRUDÊNCIA por tribunal/origem (STF / STJ / Sistemas Internacionais / Outros).
//
// Motivação: nos minissimulados de jurisprudência as questões NÃO trazem o tribunal num campo
// estruturado (categoria="Jurisprudência", pilar_1/grupo vazios/genéricos) — ele só aparece no texto
// livre (comentário do professor "Conforme entendimento do STF…" e/ou enunciado). A análise do caderno
// derivava o pilar por palavra-chave e colapsava TUDO em "Jurisprudência". Este helper detecta o
// tribunal pelo texto para a análise poder abrir a jurisprudência em sub-pilares.
//
// É um SUB-nível de "Jurisprudência" (aditivo): a questão continua contando no pilar "Jurisprudência"
// (soma com Lei seca/Doutrina = total) e também no seu tribunal — que, entre si, somam o total da
// jurisprudência. Prioridade: Sistemas Internacionais > STF > STJ; sem tribunal reconhecido → "Outros".

const RE_INTL = /interameric|corte\s*idh|\bcidh\b|vs\.?\s*brasil|internacional de direitos humanos|comiss[aã]o interamericana/i
const RE_STF = /\bstf\b|supremo tribunal federal/i
const RE_STJ = /\bstj\b|superior tribunal de justi/i

export type TribunalJuris = 'STF' | 'STJ' | 'Sistemas Internacionais' | 'Outros'

/** Detecta o tribunal/origem a partir de um ou mais textos livres (comentário do professor, enunciado…). */
export function tribunalJurisprudencia(...textos: (string | null | undefined)[]): TribunalJuris {
  const t = textos.map((x) => (x ?? '').toString()).join(' ').replace(/<[^>]+>/g, ' ')
  if (RE_INTL.test(t)) return 'Sistemas Internacionais'
  if (RE_STF.test(t)) return 'STF'
  if (RE_STJ.test(t)) return 'STJ'
  return 'Outros'
}

/**
 * Sub-pilar da jurisprudência de uma questão. Se `pilar_1` vier preenchido e NÃO for genérico
 * (não é "único"/"jurisprudência"), ele tem prioridade (classificação manual explícita);
 * caso contrário, detecta pelo texto (comentário + enunciado).
 */
export function subPilarJurisprudencia(pilar1: string | null | undefined, comentario: string | null | undefined, enunciado: string | null | undefined): string {
  const p1 = (pilar1 ?? '').toString().trim()
  if (p1 && !/^[úu]nico$/i.test(p1) && !/jurisprud/i.test(p1)) return p1
  return tribunalJurisprudencia(comentario, enunciado)
}
