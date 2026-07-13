/**
 * Resolve as três liberações independentes de um simulado — nota, gabarito e caderno —
 * a partir de `simulado.regras`. Cada uma pode ser `imediato`, `apos_janela` ou `manual`
 * (liberação manual grava a flag `*_liberado`). O caderno ainda tem público: `todos`
 * ou `passaporte` (só alunos com classificação "passaporte" baixam).
 */

export type ModoLiberacao = 'imediato' | 'apos_janela' | 'manual'

export type RegrasLiberacao = {
  liberar_nota?: ModoLiberacao
  nota_liberada?: boolean
  liberar_gabarito?: ModoLiberacao
  gabarito_liberado?: boolean
  liberar_caderno?: ModoLiberacao
  caderno_liberado?: boolean
  caderno_publico?: 'todos' | 'passaporte'
  exibir_nota?: boolean
} & Record<string, unknown>

export type SimuladoLiberavel = { status?: string | null; data_fim?: string | null }

export type Liberacoes = {
  notaLiberada: boolean
  gabaritoLiberado: boolean
  cadernoLiberado: boolean          // liberado no simulado (sem considerar o público)
  cadernoParaAluno: boolean         // liberado E o aluno atual tem direito (público)
  cadernoPublico: 'todos' | 'passaporte'
}

const janelaFechada = (s: SimuladoLiberavel) =>
  s.status === 'encerrado' || (!!s.data_fim && new Date(s.data_fim) < new Date())

const resolveModo = (modo: ModoLiberacao | undefined, flag: boolean | undefined, padrao: ModoLiberacao, fechada: boolean) => {
  // A flag manual, quando definida, é um override do admin em ambas as direções.
  if (flag === true) return true           // liberação manual forçada
  if (flag === false) return false         // bloqueio manual forçado
  const m = modo ?? padrao                 // flag indefinida → segue o modo
  if (m === 'imediato') return true
  if (m === 'apos_janela') return fechada
  return false                             // manual sem confirmação
}

/**
 * @param regras  simulado.regras (jsonb)
 * @param simulado status + data_fim para o cálculo de "após janela"
 * @param opts.classificacao classificação do aluno ('passaporte' libera o caderno restrito)
 */
export function resolverLiberacoes(
  regras: RegrasLiberacao | null | undefined,
  simulado: SimuladoLiberavel,
  opts?: { classificacao?: string | null },
): Liberacoes {
  const r = regras ?? {}
  const fechada = janelaFechada(simulado)

  // Compatibilidade: `exibir_nota === false` mantém a nota escondida como antes.
  const notaLiberada = r.exibir_nota === false ? false : resolveModo(r.liberar_nota, r.nota_liberada, 'imediato', fechada)
  const gabaritoLiberado = resolveModo(r.liberar_gabarito, r.gabarito_liberado, 'apos_janela', fechada)
  const cadernoLiberado = resolveModo(r.liberar_caderno, r.caderno_liberado, 'apos_janela', fechada)

  const cadernoPublico = r.caderno_publico ?? 'todos'
  const cadernoParaAluno = cadernoLiberado && (cadernoPublico === 'todos' || opts?.classificacao === 'passaporte')

  return { notaLiberada, gabaritoLiberado, cadernoLiberado, cadernoParaAluno, cadernoPublico }
}
