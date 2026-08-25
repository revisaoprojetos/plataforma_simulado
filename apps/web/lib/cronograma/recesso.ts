/**
 * R8 — o que conta como semana de recesso.
 *
 * O recesso é avaliado sobre o CALENDÁRIO, não sobre a grade: a pergunta é sempre
 * "a semana que começa nesta segunda-feira cai em recesso?". Quem aplica o resultado
 * é o alocador em `gerador.ts` (R7), empurrando o conteúdo para a semana seguinte.
 */

import { addDias, domingoSeguinteOuIgual, parseISO, segundaAnteriorOuIgual, type DataISO } from './datas'
import type { OpcoesGeracao } from './tipos'

/** A semana [inicio, inicio+6] contém a data (mês, dia) em qualquer ano? */
function semanaContemDataFixa(inicio: DataISO, mes: number, dia: number): boolean {
  for (let i = 0; i < 7; i++) {
    const d = new Date(parseISO(addDias(inicio, i)))
    if (d.getUTCMonth() + 1 === mes && d.getUTCDate() === dia) return true
  }
  return false
}

/**
 * Devolve o predicado que responde "esta semana é de recesso?".
 *
 * Natal = a semana que contém 25/12. Ano Novo = a que contém 01/01. "Outras" = o
 * intervalo informado pelo aluno, esticado para semanas inteiras (da segunda anterior
 * ao domingo seguinte).
 *
 * Sem as DUAS datas preenchidas em "Outras", NENHUMA semana é bloqueada — é o
 * comportamento da última frase de R8, e evita bloquear o cronograma inteiro por um
 * campo pela metade.
 */
export function montarPredicadoRecesso(op: OpcoesGeracao): (inicioSemana: DataISO) => boolean {
  const { modo, de, ate } = op.recesso

  if (modo === 'outras') {
    if (!de || !ate) return () => false
    const ini = parseISO(segundaAnteriorOuIgual(de))
    const fim = parseISO(domingoSeguinteOuIgual(ate))
    if (fim < ini) return () => false
    return (inicioSemana) => {
      const s = parseISO(inicioSemana)
      return s >= ini && s <= fim
    }
  }

  const natal = modo === 'natal' || modo === 'natal_ano_novo'
  const anoNovo = modo === 'ano_novo' || modo === 'natal_ano_novo'
  if (!natal && !anoNovo) return () => false

  return (inicioSemana) =>
    (natal && semanaContemDataFixa(inicioSemana, 12, 25)) ||
    (anoNovo && semanaContemDataFixa(inicioSemana, 1, 1))
}

/** Texto da faixa de uma semana de recesso (spec §3). */
export const TEXTO_RECESSO =
  'Não há metas programadas nesta semana; o cronograma será retomado na próxima segunda-feira.'
