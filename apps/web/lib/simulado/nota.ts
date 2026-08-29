// Cálculo CANÔNICO da nota de uma sessão — fonte única de verdade, usada por
// finalizar, anular, trocar e remover correção (antes a regra estava triplicada
// e divergente). Escala 0–100 (percentual de acerto; ex.: 13 de 100 → 13).
//
// Regras de anulação (por questão, conforme o registro de re-correção):
//  - pontua_todos: a questão continua no total e TODOS ganham o ponto.
//  - desconsidera: a questão sai do total (não conta pra ninguém).
// Questões não anuladas: acerto normal (respostas.correta).

import { funcaoEtiquetaPorQuestao } from './etiqueta-funcao'

type AnyClient = { from: (t: string) => any }
type Politica = 'pontua_todos' | 'desconsidera'
export type TipoCorrecao = 'pontuacao' | 'cebraspe'

export interface NotaContexto {
  totalQuestoes: number
  anuladas: Map<string, Politica> // questao_id -> política
  // 'pontuacao' = +1 por acerto (padrão) | 'cebraspe' = acertos − erros (erro desconta um acerto).
  tipoCorrecao: TipoCorrecao
}

/** Monta o contexto (total de questões + anuladas com política + tipo de correção) UMA vez por simulado. */
export async function contextoNota(svc: AnyClient, simuladoId: string): Promise<NotaContexto> {
  const { data: pq } = await svc
    .from('simulado_prova_questoes')
    .select('questao_id, anulada')
    .eq('simulado_id', simuladoId)
  // Tipo de correção vem das regras do simulado (default pontuação).
  const { data: sim } = await svc.from('simulado_simulados').select('regras').eq('id', simuladoId).maybeSingle()
  const tipoCorrecao: TipoCorrecao = ((sim as any)?.regras?.tipo_correcao === 'cebraspe') ? 'cebraspe' : 'pontuacao'
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
  // Etiquetas FUNCIONAIS da questão (nível banco): 'anular' → pontua_todos; 'desconsiderar' → sai do total.
  const funcs = await funcaoEtiquetaPorQuestao(svc, (pq ?? []).map((q: any) => q.questao_id))
  for (const [qid, ef] of funcs) {
    if (ef.funcao === 'anular') anuladas.set(qid, 'pontua_todos')
    else if (ef.funcao === 'desconsiderar') anuladas.set(qid, 'desconsidera')
    // 'avisar' não afeta a nota
  }
  // Anulação GLOBAL no banco (simulado_questoes.anulada) — vale para QUALQUER simulado (oficiais
  // e pessoais). pontua_todos; NÃO sobrescreve a política já definida por recorreção/etiqueta.
  const qids = (pq ?? []).map((q: any) => q.questao_id).filter(Boolean)
  if (qids.length) {
    const { data: banco } = await svc.from('simulado_questoes').select('id').in('id', qids).eq('anulada', true)
    for (const b of (banco ?? []) as any[]) if (!anuladas.has(b.id)) anuladas.set(b.id, 'pontua_todos')
  }
  return { totalQuestoes: (pq ?? []).length, anuladas, tipoCorrecao }
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

/** Conveniência: recalcula e devolve a nota de UMA sessão (1 read de respostas). */
export async function calcularNotaSessao(svc: AnyClient, sessaoId: string, ctx: NotaContexto): Promise<number> {
  const { data: resp } = await svc
    .from('simulado_respostas_objetivas')
    .select('questao_id, correta')
    .eq('sessao_id', sessaoId)
  return calcularNota((resp ?? []) as any[], ctx)
}
