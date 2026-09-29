// Cálculo da SEQUÊNCIA (streak) de leitura a partir dos dias concluídos + AJUSTES manuais do suporte.
// `diasAuto` = dias (fuso do tenant, 'YYYY-MM-DD') em que o aluno completou uma aula. `overrides` =
// mapa dia→boolean vindo do calendário de reconfiguração: `true` FORÇA o dia a contar (preenche um
// buraco / reativa), `false` DESCONSIDERA um dia que o aluno fez (quebra a sequência ali). Dias fora
// do mapa usam o valor automático. Fonte única p/ o ranking (lista) e o detalhe do aluno (pop-up).

export type SequenciaOverrides = Record<string, boolean>

export interface SequenciaResult {
  streakAtual: number
  streakMaior: number
  diasEfetivos: string[] // dias que CONTAM (auto ± overrides), ordenados asc
}

/** Aplica os overrides ao conjunto de dias e calcula a sequência ATUAL e a MAIOR. `hojeISO`/`ontemISO`
 *  são 'YYYY-MM-DD' já no fuso do tenant (a sequência atual zera se o último dia não é hoje nem ontem). */
export function calcularSequencia(
  diasAuto: Iterable<string>,
  overrides: SequenciaOverrides | null | undefined,
  hojeISO: string,
  ontemISO?: string,
): SequenciaResult {
  const set = new Set<string>(diasAuto)
  for (const [dia, conta] of Object.entries(overrides ?? {})) {
    if (conta) set.add(dia)
    else set.delete(dia)
  }
  const dias = [...set].sort()
  let maior = 0
  let run = 0
  let prev = ''
  for (const d of dias) {
    const consec = !!prev && Date.parse(d + 'T00:00:00Z') - Date.parse(prev + 'T00:00:00Z') === 86_400_000
    run = consec ? run + 1 : 1
    if (run > maior) maior = run
    prev = d
  }
  const ultimo = dias[dias.length - 1] ?? ''
  const ontem = ontemISO ?? new Date(Date.parse(hojeISO + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10)
  const streakAtual = ultimo === hojeISO || ultimo === ontem ? run : 0
  return { streakAtual, streakMaior: maior, diasEfetivos: dias }
}
