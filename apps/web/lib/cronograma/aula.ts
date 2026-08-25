/**
 * Regras da AULA — o campo mais frágil do módulo.
 *
 * `aula` é TEXTO e o casamento com os links é EXATO (R11): "01" não acha o link cadastrado
 * como "1". Qualquer código que gere ou transforme aulas precisa preservar o formato, e é por
 * isso que estas regras vivem aqui, puras e testadas, em vez de repetidas dentro de cada
 * action que precisa delas.
 */

/**
 * Soma `n` a uma aula preservando o formato.
 *
 *   somarAula('01', 1) → '02'      (zero à esquerda mantido)
 *   somarAula('9', 1)  → '10'
 *   somarAula('09', 1) → '10'      (a largura cede quando o número cresce)
 *   somarAula('1.1', 1) → '1.1'    (não é inteiro: fica como está)
 *   somarAula(null, 1)  → null
 *
 * Devolver o valor original no caso duvidoso é deliberado: um incremento errado espalhado por
 * 70 semanas quebra o link de todas elas em silêncio, e ninguém percebe até um aluno reclamar
 * que "não há link do QC/TEC".
 */
export function somarAula(aula: string | null, n: number): string | null {
  const t = (aula ?? '').trim()
  if (!t || n === 0) return aula
  if (!/^\d+$/.test(t)) return aula
  const alvo = Number(t) + n
  if (alvo < 0) return aula
  const novo = String(alvo)
  // Zero à esquerda só é reposto enquanto couber: '09' + 1 é '10', não '010'.
  return /^0\d/.test(t) && novo.length < t.length ? novo.padStart(t.length, '0') : novo
}

/**
 * A chave que define "a mesma aula" ao agrupar: '01' e '1' caem no mesmo balde, '1.1' não.
 *
 * Espelha `simulado_cronograma_chave_aula` no banco — as duas precisam concordar, senão a tela
 * de auditoria mostra um grupo que a correção não pega.
 */
export function chaveAula(aula: string | null): string {
  const t = (aula ?? '').trim()
  if (!t) return ''
  return /^\d+$/.test(t) ? String(Number(t)) : t.toLowerCase()
}
