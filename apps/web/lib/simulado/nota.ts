// Cálculo CANÔNICO da nota de uma sessão — fonte única de verdade, usada por
// finalizar, anular, trocar e remover correção (antes a regra estava triplicada
// e divergente). Escala 0–10.
//
// Regras de anulação (por questão, conforme o registro de re-correção):
//  - pontua_todos: a questão continua no total e TODOS ganham o ponto.
//  - desconsidera: a questão sai do total (não conta pra ninguém).
// Questões não anuladas: acerto normal (respostas.correta).

type AnyClient = { from: (t: string) => any }
type Politica = 'pontua_todos' | 'desconsidera'

export interface NotaContexto {
  totalQuestoes: number
  anuladas: Map<string, Politica> // questao_id -> política
}

/** Monta o contexto (total de questões + anuladas com política) UMA vez por simulado. */
export async function contextoNota(svc: AnyClient, simuladoId: string): Promise<NotaContexto> {
  const { data: pq } = await svc
    .from('simulado_prova_questoes')
    .select('questao_id, anulada')
    .eq('simulado_id', simuladoId)
  const { data: recs } = await svc
    .from('simulado_recorrecoes')
    .select('questao_id, tipo, politica')
    .eq('simulado_id', simuladoId)

  const politicaPorQ = new Map<string, Politica>()
  for (const r of (recs ?? []) as any[]) {
    if (r.tipo === 'anulacao') politicaPorQ.set(r.questao_id, (r.politica === 'desconsidera' ? 'desconsidera' : 'pontua_todos'))
  }
  const anuladas = new Map<string, Politica>()
  for (const q of (pq ?? []) as any[]) {
    if (q.anulada) anuladas.set(q.questao_id, politicaPorQ.get(q.questao_id) ?? 'pontua_todos')
  }
  return { totalQuestoes: (pq ?? []).length, anuladas }
}

/** Calcula a nota (0–10) de uma sessão a partir das respostas e do contexto. */
export function calcularNota(respostas: { questao_id: string; correta: boolean | null }[], ctx: NotaContexto): number {
  let nPontuaTodos = 0
  let nDesconsidera = 0
  for (const p of ctx.anuladas.values()) { if (p === 'desconsidera') nDesconsidera++; else nPontuaTodos++ }

  const denom = ctx.totalQuestoes - nDesconsidera // desconsideradas saem do total
  const corretasValidas = respostas.filter((r) => r.correta && !ctx.anuladas.has(r.questao_id)).length
  const acertos = corretasValidas + nPontuaTodos // pontua_todos credita a todos

  return denom > 0 ? Math.round((acertos / denom) * 10 * 100) / 100 : 0
}

/** Conveniência: recalcula e devolve a nota de UMA sessão (1 read de respostas). */
export async function calcularNotaSessao(svc: AnyClient, sessaoId: string, ctx: NotaContexto): Promise<number> {
  const { data: resp } = await svc
    .from('simulado_respostas_objetivas')
    .select('questao_id, correta')
    .eq('sessao_id', sessaoId)
  return calcularNota((resp ?? []) as any[], ctx)
}
