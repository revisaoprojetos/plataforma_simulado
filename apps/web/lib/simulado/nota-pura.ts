// Parte PURA do cálculo canônico da nota (sem I/O) — usada por lib/simulado/nota.ts (re-exporta) e por scripts.
// Escala 0–100. Regras de anulação por questão: pontua_todos (todos ganham o ponto) | desconsidera (sai do total).

type Politica = 'pontua_todos' | 'desconsidera'
export type TipoCorrecao = 'pontuacao' | 'cebraspe'

export interface NotaContexto {
  totalQuestoes: number
  anuladas: Map<string, Politica> // questao_id -> política
  // 'pontuacao' = +1 por acerto (padrão) | 'cebraspe' = acertos − erros (erro desconta um acerto).
  tipoCorrecao: TipoCorrecao
}

/** Calcula a nota (escala 0–100) de uma sessão a partir das respostas e do contexto. */
export function calcularNota(respostas: { questao_id: string; correta: boolean | null }[], ctx: NotaContexto): number {
  let nPontuaTodos = 0
  let nDesconsidera = 0
  for (const p of ctx.anuladas.values()) { if (p === 'desconsidera') nDesconsidera++; else nPontuaTodos++ }

  const denom = ctx.totalQuestoes - nDesconsidera // desconsideradas saem do total
  if (denom <= 0) return 0
  const corretasValidas = respostas.filter((r) => r.correta === true && !ctx.anuladas.has(r.questao_id)).length

  if (ctx.tipoCorrecao === 'cebraspe') {
    // Estilo CEBRASPE: nota = acertos − erros. Cada erro anula um acerto. Questões NÃO marcadas
    // ficam de fora (não descontam — não têm linha em respostas). Anuladas (pontua_todos) somam
    // ponto. Piso em 0 (o líquido não fica negativo).
    const errosValidos = respostas.filter((r) => r.correta === false && !ctx.anuladas.has(r.questao_id)).length
    const liquido = Math.max(0, corretasValidas + nPontuaTodos - errosValidos)
    return Math.round((liquido / denom) * 100 * 100) / 100
  }

  // Padrão: +1 por acerto. Escala 0–100 (percentual). Ex.: 13/100 acertos → 13,00; tudo certo → 100.
  const acertos = corretasValidas + nPontuaTodos // pontua_todos credita a todos
  return Math.round((acertos / denom) * 100 * 100) / 100
}

