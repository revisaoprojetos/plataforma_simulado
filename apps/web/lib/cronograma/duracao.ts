/**
 * Duração das metas — texto livre do cadastro virando minutos.
 *
 * A coluna `duracao` é TEXTO e vem da planilha da equipe, quase sempre como FAIXA:
 * "3 - 4h", "30 min - 1h", "40 min - 1:30h". Não é número, e por isso somar o dia exige
 * interpretar. As regras abaixo cobrem os formatos que existem nos dados reais.
 *
 * O que este módulo NÃO faz: adivinhar. Quando um pedaço não é reconhecido, devolve `null`
 * em vez de chutar — e quem chama mostra só a contagem de tarefas. Um total de horas errado
 * é pior do que total nenhum, porque o aluno organiza o dia em cima dele.
 */

/** Faixa em minutos. Duração exata vira `{ min: x, max: x }`. */
export type FaixaMinutos = { min: number; max: number }

/**
 * Um lado da faixa. `unidadeVizinha` resolve o caso "3 - 4h": o "3" não traz unidade e
 * herda a do outro lado — sem isso viraria 3 minutos em vez de 3 horas.
 */
function parteEmMinutos(txt: string, unidadeVizinha: 'h' | 'min' | null): number | null {
  const t = txt.trim().toLowerCase().replace(',', '.')
  if (!t) return null

  // "1:30h" / "1:30" — horas:minutos
  const relogio = /^(\d{1,2}):([0-5]\d)\s*h?$/.exec(t)
  if (relogio) return Number(relogio[1]) * 60 + Number(relogio[2])

  // "45 min" / "45min" / "45m"
  const minutos = /^(\d+(?:\.\d+)?)\s*(?:min|m)$/.exec(t)
  if (minutos) return Math.round(Number(minutos[1]))

  // "2h" / "2 h" / "1.5h"
  const horas = /^(\d+(?:\.\d+)?)\s*h$/.exec(t)
  if (horas) return Math.round(Number(horas[1]) * 60)

  // "3" — número solto: só faz sentido com a unidade do vizinho.
  const solto = /^(\d+(?:\.\d+)?)$/.exec(t)
  if (solto && unidadeVizinha) {
    const n = Number(solto[1])
    return unidadeVizinha === 'h' ? Math.round(n * 60) : Math.round(n)
  }

  return null
}

/** Qual unidade um pedaço declara — usado para o lado que não declara nenhuma. */
function unidadeDe(txt: string): 'h' | 'min' | null {
  const t = txt.trim().toLowerCase()
  if (/(?:min|m)$/.test(t)) return 'min'
  if (/h$/.test(t) || /^\d{1,2}:[0-5]\d/.test(t)) return 'h'
  return null
}

/** `null` quando o texto não é reconhecido — é sinal para não somar, não para tratar como zero. */
export function duracaoEmMinutos(texto: string | null | undefined): FaixaMinutos | null {
  if (!texto) return null
  const partes = texto.split(/[-–—]/)
  if (partes.length === 1) {
    const v = parteEmMinutos(partes[0], unidadeDe(partes[0]))
    return v === null ? null : { min: v, max: v }
  }
  if (partes.length !== 2) return null

  const [a, b] = partes
  const uA = unidadeDe(a)
  const uB = unidadeDe(b)
  const min = parteEmMinutos(a, uA ?? uB)
  const max = parteEmMinutos(b, uB ?? uA)
  if (min === null || max === null) return null
  return min <= max ? { min, max } : { min: max, max: min }
}

/** 90 → "1h30"; 240 → "4h"; 45 → "45min". */
export function fmtMinutos(total: number): string {
  if (total < 60) return `${total}min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/**
 * Soma o dia. Devolve `null` se QUALQUER duração for irreconhecível: um total parcial
 * apresentado como total é mentira, e o aluno usa esse número para planejar o dia.
 */
export function somarDuracoes(textos: (string | null | undefined)[]): FaixaMinutos | null {
  let min = 0
  let max = 0
  let houve = false
  for (const t of textos) {
    if (!t) continue // meta sem duração cadastrada não impede a soma das outras
    const f = duracaoEmMinutos(t)
    if (!f) return null
    min += f.min
    max += f.max
    houve = true
  }
  return houve ? { min, max } : null
}

/** "4h" quando min e max coincidem, "3h – 4h" quando é faixa. */
export function fmtFaixa(f: FaixaMinutos): string {
  return f.min === f.max ? fmtMinutos(f.min) : `${fmtMinutos(f.min)} – ${fmtMinutos(f.max)}`
}
