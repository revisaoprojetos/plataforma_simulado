/**
 * IMPACTO de regras: compara dois resultados de geração de UM plano (base × alternativa) e decide a TRAVA de segurança.
 * PURO (sem I/O, sem relógio, sem importar o motor): testável sem banco. Somente tipos locais.
 */
export type PlanoMini = Record<string, [string, number]>
export interface ResultadoGeracao {
  plano: PlanoMini | null
  /** semanas até o fim (retorno do motor). */
  fim: number
  /** total de violações das invariantes no plano gerado. */
  violacoes: number
  erro?: string
}
export interface ImpactoPlano {
  erroBase?: string
  erroAlt?: string
  /** variação do fim em semanas (alt − base) e em dias (última data). */
  deltaFimSemanas: number
  deltaFimDias: number
  /** pendentes (não concluídas) cuja data mudou / que sumiram / que surgiram. */
  movidas: number
  removidas: number
  adicionadas: number
  violacoesBase: number
  violacoesAlt: number
  /** concluídas cuja data/presença na ALTERNATIVA difere do plano gravado — deve ser 0. */
  concluidasDivergentes: number
  /** o mesmo para a BASE (sanidade da re-simulação). */
  concluidasDivergentesBase: number
  exemplosDivergentes: string[]
}

const dias = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, (m || 1) - 1, d || 1) / 864e5) }
export function ultimaData(p: PlanoMini | null): string | null {
  if (!p) return null
  let u: string | null = null
  for (const v of Object.values(p)) if (u === null || v[0] > u) u = v[0]
  return u
}

/** Concluídas (ids) que mudaram de data ou sumiram do `resultado` em relação ao plano `gravado`. */
export function concluidasDivergentes(gravado: PlanoMini, resultado: PlanoMini | null, concluidas: ReadonlySet<string>): string[] {
  if (!resultado) return []
  const out: string[] = []
  for (const id of concluidas) {
    const g = gravado[id]
    if (!g) continue // concluída que nem consta do plano gravado não tem referência
    const r = resultado[id]
    if (!r || r[0] !== g[0]) out.push(id)
  }
  return out.sort()
}

export function compararResultados(base: ResultadoGeracao, alt: ResultadoGeracao, gravado: PlanoMini, concluidas: ReadonlySet<string>): ImpactoPlano {
  const dB = concluidasDivergentes(gravado, base.plano, concluidas)
  const dA = concluidasDivergentes(gravado, alt.plano, concluidas)
  let movidas = 0, removidas = 0, adicionadas = 0
  if (base.plano && alt.plano) {
    for (const [id, v] of Object.entries(base.plano)) {
      if (concluidas.has(id)) continue
      const a = alt.plano[id]
      if (!a) removidas++; else if (a[0] !== v[0]) movidas++
    }
    for (const id of Object.keys(alt.plano)) if (!concluidas.has(id) && !base.plano[id]) adicionadas++
  }
  const uB = ultimaData(base.plano), uA = ultimaData(alt.plano)
  return {
    ...(base.erro ? { erroBase: base.erro } : {}), ...(alt.erro ? { erroAlt: alt.erro } : {}),
    deltaFimSemanas: base.plano && alt.plano ? alt.fim - base.fim : 0,
    deltaFimDias: uB && uA ? dias(uA) - dias(uB) : 0,
    movidas, removidas, adicionadas,
    violacoesBase: base.violacoes, violacoesAlt: alt.violacoes,
    concluidasDivergentes: dA.length, concluidasDivergentesBase: dB.length, exemplosDivergentes: dA.slice(0, 5),
  }
}

// ── trava de segurança ───────────────────────────────────────────────────────────────────────────────
export interface ResumoTrava {
  planos: number
  /** planos com concluídas divergentes na proposta. */
  comDivergencia: number
  totalDivergentes: number
  /** planos que passam a ERRAR com a proposta e não erravam com as vigentes. */
  novosErros: number
  /** planos que já erravam com as vigentes (informativo). */
  errosPreexistentes: number
  exemplos: Array<{ planoId: string; motivo: string }>
}
export function resumirTrava(itens: Array<{ planoId: string; impacto: ImpactoPlano }>): ResumoTrava {
  const r: ResumoTrava = { planos: itens.length, comDivergencia: 0, totalDivergentes: 0, novosErros: 0, errosPreexistentes: 0, exemplos: [] }
  for (const { planoId, impacto: i } of itens) {
    if (i.concluidasDivergentes > 0) {
      r.comDivergencia++; r.totalDivergentes += i.concluidasDivergentes
      if (r.exemplos.length < 8) r.exemplos.push({ planoId, motivo: `${i.concluidasDivergentes} meta(s) concluída(s) mudaria(m) de data` })
    }
    if (i.erroBase) r.errosPreexistentes++
    else if (i.erroAlt) { r.novosErros++; if (r.exemplos.length < 8) r.exemplos.push({ planoId, motivo: `erro de geração: ${i.erroAlt}` }) }
  }
  return r
}
/** Exige confirmação quando há concluídas divergentes OU erro de geração novo. */
export const exigeConfirmacao = (r: ResumoTrava): boolean => r.comDivergencia > 0 || r.novosErros > 0

// ── diff de eventos de rastro (laboratório) ──────────────────────────────────────────────────────────
export interface EventoMini { id: string; cod: string; texto: string; de: string; ate: string; n: number }
export interface DiffEventos {
  soBase: EventoMini[]
  soAlt: EventoMini[]
  mudaram: Array<{ base: EventoMini; alt: EventoMini }>
}
export function diffEventos(base: EventoMini[], alt: EventoMini[]): DiffEventos {
  const k = (e: EventoMini) => e.id + '|' + e.cod
  const mb = new Map(base.map((e) => [k(e), e])), ma = new Map(alt.map((e) => [k(e), e]))
  const out: DiffEventos = { soBase: [], soAlt: [], mudaram: [] }
  for (const [key, e] of mb) {
    const o = ma.get(key)
    if (!o) out.soBase.push(e)
    else if (o.texto !== e.texto || o.de !== e.de || o.ate !== e.ate) out.mudaram.push({ base: e, alt: o })
  }
  for (const [key, e] of ma) if (!mb.has(key)) out.soAlt.push(e)
  return out
}

/** Metas pendentes que mudaram de data (ou sumiram) da base para a alternativa. Ordenado por id; corta em `limite`. */
export function listarMudancas(base: PlanoMini | null, alt: PlanoMini | null, concluidas: ReadonlySet<string>, limite = 100): { itens: Array<{ id: string; de: string; para: string | null }>; total: number } {
  if (!base || !alt) return { itens: [], total: 0 }
  const todas: Array<{ id: string; de: string; para: string | null }> = []
  for (const [id, v] of Object.entries(base)) {
    if (concluidas.has(id)) continue
    const a = alt[id]
    if (!a) todas.push({ id, de: v[0], para: null }); else if (a[0] !== v[0]) todas.push({ id, de: v[0], para: a[0] })
  }
  todas.sort((x, y) => x.de.localeCompare(y.de) || x.id.localeCompare(y.id))
  return { itens: todas.slice(0, limite), total: todas.length }
}
