import 'server-only'
import type { ConfigIA } from '../config'
import { chamarIA, type ConteudoUser, type UsoTokens } from './cliente'
import { modeloDoNivel, custoUSD, type Nivel } from './niveis'

// Orquestrador de multi-agents em NÍVEIS. Primitivas:
//  - Agente: um papel (nível + instruções + schema opcional).
//  - rodarAgente: executa UM agente, usando o modelo do NÍVEL e contabilizando tokens/custo.
//  - emParalelo: roda N tarefas com teto de concorrência (agilidade sem estourar rate limit).
//  - pipelineNiveis: fluxo triagem(Haiku) → execução(Sonnet, paralela) → consolidação(Opus, condicional),
//    com ORÇAMENTO (early-exit) e TRACE (pra ver o funcionamento/custo de cada passo).

export interface Agente {
  nome: string
  nivel: Nivel
  /** System prompt — o papel/instruções do agente. */
  instrucoes: string
  /** Saída estruturada (JSON Schema). No Anthropic vira tool-use; nos demais, JSON + parse. */
  schema?: { name?: string; input_schema: any }
  maxTokens?: number
  temperatura?: number
}

export interface Uso { entrada: number; saida: number; custoUSD: number; chamadas: number }
export interface PassoTrace { agente: string; nivel: Nivel; modelo: string; usage: UsoTokens; custoUSD: number }
export interface SaidaAgente<O = any> { saida: O; texto: string; trace: PassoTrace }

export const novoUso = (): Uso => ({ entrada: 0, saida: 0, custoUSD: 0, chamadas: 0 })
function acumular(acc: Uso, p: PassoTrace) { acc.entrada += p.usage.entrada; acc.saida += p.usage.saida; acc.custoUSD += p.custoUSD; acc.chamadas++ }
export const resumoUso = (u: Uso) => `${u.chamadas} chamada(s) · ${u.entrada.toLocaleString('pt-BR')} tok entrada · ${u.saida.toLocaleString('pt-BR')} tok saída · ~US$ ${u.custoUSD.toFixed(4)}`

/** Executa UM agente (modelo do seu nível), devolvendo a saída (estruturada se tiver schema) + trace. */
export async function rodarAgente<O = any>(cfg: ConfigIA, ag: Agente, entrada: ConteudoUser, acc?: Uso): Promise<SaidaAgente<O>> {
  const model = modeloDoNivel(cfg.provider, ag.nivel, cfg.modelo)
  const r = await chamarIA(cfg, {
    system: ag.instrucoes, user: entrada, model,
    maxTokens: ag.maxTokens ?? 2048, temperature: ag.temperatura ?? 0.2,
    tool: ag.schema ? { name: ag.schema.name || 'responder', input_schema: ag.schema.input_schema } : undefined,
  })
  const custo = custoUSD(model, r.usage)
  const trace: PassoTrace = { agente: ag.nome, nivel: ag.nivel, modelo: model, usage: r.usage, custoUSD: custo }
  if (acc) acumular(acc, trace)
  return { saida: (r.toolInput ?? r.texto) as O, texto: r.texto, trace }
}

/** Roda `fn` sobre os itens com TETO de concorrência (preserva a ordem no resultado). */
export async function emParalelo<T, R>(itens: T[], fn: (item: T, i: number) => Promise<R>, concorrencia = 6): Promise<R[]> {
  const out: R[] = new Array(itens.length)
  let i = 0
  const worker = async () => { while (i < itens.length) { const idx = i++; out[idx] = await fn(itens[idx], idx) } }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concorrencia, itens.length || 1)) }, worker))
  return out
}

// ── Pipeline de 3 níveis ────────────────────────────────────────────────────────
export interface ConfigPipeline<Item = any, Tri = any, Exec = any, Cons = any> {
  itens: Item[]
  /** Nível 1 (opcional): filtra/roteia barato. `passa=false` descarta o item ANTES da execução (poupa tokens). */
  triagem?: { agente: Agente; entrada: (item: Item) => ConteudoUser; passa: (saida: Tri, item: Item) => boolean }
  /** Nível 2: o trabalho principal, rodado EM PARALELO só nos itens triados. */
  execucao: { agente: Agente; entrada: (item: Item, tri: Tri | undefined) => ConteudoUser }
  /** Nível 3 (opcional): só roda nos casos onde `precisa=true` (dúvida/consolidação). */
  consolidacao?: { agente: Agente; precisa: (saida: Exec, item: Item) => boolean; entrada: (saida: Exec, item: Item) => ConteudoUser }
  concorrencia?: number
  /** Teto de custo (US$). Ao atingir, para de abrir novas chamadas (early-exit). */
  orcamentoUSD?: number
}
export interface ResultadoItem<Item = any, Exec = any, Cons = any> { item: Item; triado: boolean; execucao?: Exec; consolidacao?: Cons; trace: PassoTrace[] }
export interface ResultadoPipeline<Item = any, Exec = any, Cons = any> { resultados: ResultadoItem<Item, Exec, Cons>[]; uso: Uso; trace: PassoTrace[] }

export async function pipelineNiveis<Item = any, Tri = any, Exec = any, Cons = any>(
  cfg: ConfigIA, c: ConfigPipeline<Item, Tri, Exec, Cons>,
): Promise<ResultadoPipeline<Item, Exec, Cons>> {
  const uso = novoUso()
  const conc = c.concorrencia ?? 6
  const estourou = () => c.orcamentoUSD != null && uso.custoUSD >= c.orcamentoUSD

  // Nível 1 — TRIAGEM (paralela, barata)
  const triados = await emParalelo(c.itens, async (item): Promise<{ item: Item; triado: boolean; tri: Tri | undefined; trace: PassoTrace[] }> => {
    if (!c.triagem) return { item, triado: true, tri: undefined, trace: [] }
    if (estourou()) return { item, triado: false, tri: undefined, trace: [] }
    const r = await rodarAgente<Tri>(cfg, c.triagem.agente, c.triagem.entrada(item), uso)
    return { item, triado: !!c.triagem.passa(r.saida, item), tri: r.saida, trace: [r.trace] }
  }, conc)

  // Nível 2 — EXECUÇÃO (paralela, só nos triados) + Nível 3 — CONSOLIDAÇÃO (condicional)
  const resultados = await emParalelo(triados, async (t): Promise<ResultadoItem<Item, Exec, Cons>> => {
    const trace = [...t.trace]
    if (!t.triado || estourou()) return { item: t.item, triado: t.triado, trace }
    const ex = await rodarAgente<Exec>(cfg, c.execucao.agente, c.execucao.entrada(t.item, t.tri), uso)
    trace.push(ex.trace)
    let cons: Cons | undefined
    if (c.consolidacao && c.consolidacao.precisa(ex.saida, t.item) && !estourou()) {
      const co = await rodarAgente<Cons>(cfg, c.consolidacao.agente, c.consolidacao.entrada(ex.saida, t.item), uso)
      trace.push(co.trace); cons = co.saida
    }
    return { item: t.item, triado: true, execucao: ex.saida, consolidacao: cons, trace }
  }, conc)

  return { resultados, uso, trace: resultados.flatMap((r) => r.trace) }
}
