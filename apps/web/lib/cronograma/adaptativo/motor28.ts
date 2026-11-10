/**
 * MOTOR DO CRONOGRAMA ADAPTATIVO — lógica de distribuição do modelo "Cronograma_Adaptativo_2.8.html".
 *
 * FONTE ÚNICA: este arquivo é usado no SERVIDOR (engine.ts → gerarPlano) e, compilado por
 * `pnpm --filter web cronograma:motor` (scripts/build-motor28.mjs), no IFRAME do aluno
 * (public/cronograma/adaptativo/motor28.js → window.Motor28). Sem imports: puro, determinístico.
 *
 * PORTE das funções do modelo (mesmos nomes, mesma ordem de decisões — só sem os globais `S`/`AS`):
 *  · gerarPlanoBase          — distribuição semana a semana;
 *  · gerarPlanoCatalogo      — ordem das aulas (catálogo) sem o histórico prévio + metas remanejadas presas;
 *  · gerarPlano              — com metas remanejadas, refaz o fluxo pelo efeito dominó (calcularDomino);
 *  · perfilSemana, planoRevisao(+Concentrada), criarRodizioLP25, permitirLegproc25, chaveLei,
 *    limitePDF27, novosPDFDia27, detalhesPdf.
 *
 * Regras resultantes (modelo 2.8):
 *  · PDFull = max(30, teto(páginas ÷ ritmo × 2) × 30) min (60 págs se não informado); o que não cabe vira
 *    partes (pp:i:k … pf:i) e a continuação vem depois. Até 2 PDFulls NOVOS por dia (1 se maisPDFull=false);
 *    a continuação não conta. 1º PDFull depois das revisões; o 2º só depois das questões e do LegProc.
 *  · Revisão 1 semana de conteúdo depois (60 min); Questões 2 semanas depois (30 min) — nunca descartadas.
 *  · Semana com até 18 h e +1 dia disponível: o último dia concentra as Questões (sem PDFull/Revisão novos).
 *  · LegProc (30 min) por disciplina selecionada, na ordem do catálogo; por dia até 4 metas, no máx. 2
 *    disciplinas, no máx. 2 metas da mesma disciplina e — quando 2 — da MESMA lei; rodízio com janela de 6.
 *  · Semanas de revisão (cfg.revisao): sem aula nova; reservam Revisão + Questões; sobra p/ pendências/LegProc.
 *  · Disponibilidade: horas pontuais da data > recesso (zera) > rotina vigente.
 *
 * Interrupções (formato da plataforma → mecanismo do modelo, `cfg.remanejadas`):
 *  · cfg.sobras[id] = minutos restantes (Revisão/Questões/LegProc) → remanejada {desde: âncora, minutos};
 *  · cfg.paginasLidas[i] = última página lida do PDFull → remanejada pf:i com as páginas que faltam.
 *  · "Já estuda pelo Revisão?": cfg.ultimosTemas[disc] = posição (0-based) da última aula estudada
 *    daquela disciplina → ela e as anteriores ficam fora da nova programação.
 */

export type DataISO = string
export type Plano = Record<string, [DataISO, number]>
export type AulaAS = [string, string, string, number, string, string, string?, string?]

export interface ItemLP {
  /** id estável da meta (ex.: "lp:L3f9a2c1b:4"). */
  id: string
  /** disciplina (nome) — vínculo obrigatório. */
  disc: string
  /** chave da lei (2 metas no mesmo dia só se da mesma lei). */
  lei: string
  /** orientação de leitura exibida ao aluno (ex.: "Lei nº 9.717/98 (RPPS) — Art. 1º ao art. 6º"). */
  texto: string
  /** documento da Biblioteca (abre no leitor). */
  doc?: string | null
  /** duração (min). */
  min?: number
}

export interface Remanejada { desde: DataISO; minutos: number; geracao?: string | null; detalhe?: Detalhe }
export interface Detalhe { semanaRevisao?: boolean; semanaOrigemRevisao?: number; ordemAlternancia?: number; essencialNaoSelecionada?: boolean; material?: string; percentualOrigem?: number; continuacao?: boolean; pai?: string; origem?: string; paginaInicio?: number; paginaFim?: number; totalPaginas?: number; artigo?: string; deslocada?: boolean; geracao?: string | null; jurisprudencia?: boolean; historico?: boolean; reforco?: boolean }

export interface Cfg28 {
  start: DataISO
  horas: number[]
  rotinas?: Array<{ desde: DataISO; horas: number[] }>
  recessos?: Array<{ ini: DataISO; fim: DataISO; motivo?: string }>
  horasPontuais?: Record<DataISO, number>
  discs: string[]
  metas: { pf?: boolean; fl?: boolean; qu?: boolean; lp?: boolean }
  revisao?: { ativa?: boolean; cada?: number }
  vel?: number
  maisPDFull?: boolean
  jaEstudaRevisao?: boolean
  ultimosTemas?: Record<string, number>
  paginasLidas?: Record<string, number>
  partesLidas?: Record<string, number>
  sobras?: Record<string, number>
  remanejadas?: Record<string, Remanejada>
  /** ids de LegProc que contam como já lidos (equivalência de metas antigas). */
  lpIgnorar?: string[]
  [k: string]: unknown
}

export interface Contexto {
  /** ordem de distribuição das aulas (índices em AS). Sem ela: ordem de AS. */
  ordem?: number[]
  /** ids de metas concluídas (S.prog[id].s === 'done' no modelo). */
  feitas?: Iterable<string>
  /** ids que já têm registro de progresso (evita reusar o nº de uma parte pp:i:k). */
  usados?: Iterable<string>
  /** detalhes de continuidade já calculados (páginas das partes etc.). */
  detalhes?: Record<string, Detalhe>
  /** parâmetros configuráveis do motor (v3); ausente/parcial = defaults 2.8. */
  params?: ParamsMotor28 | null
  /** anotações do aluno por meta (grau/res/err) — só usadas com params.usarDesempenhoNoPlano. */
  notas?: Record<string, NotaTema> | null
}

export const VERSAO_MOTOR = '2.8.1'
export const SEM_FLASH = new Set(['Direito Eleitoral', 'Direito Internacional', 'Direito Internacional Privado', 'Legislação de Ensino', 'Legislação da AGU'])
export const MAX_SEM = 200
export const VEL_PADRAO = 17
export const DUR: Record<string, number> = { fl: 60, qu: 30, lp: 30 }
export const DUR_REVISAO: Record<string, number> = { rf: 60, rq: 30 }

// ── Parâmetros configuráveis (v3) — defaults = 2.8 ───────────────────────────────────────────────
// Entram por `ctx.params` (flat/opcional). `resolverParams` monta o objeto `P` usado na geração; sem
// params, P reproduz EXATAMENTE as constantes acima → o plano é idêntico ao de hoje (ver resolverParams).
export interface ParamsMotor28 {
  velPadrao?: number
  durFl?: number; durQu?: number; durLp?: number; durRf?: number; durRq?: number
  offsetRevisao?: number; offsetQuestoes?: number
  semFlash?: string[]
  tetoPdfDia?: number
  lpMetasDia?: number; lpDiscDia?: number; lpMesmaDisc?: number; lpJanelaRodizio?: number
  concentracaoAteH?: number; maxSemanas?: number
  /** inteligência de desempenho (Fase 3): antecipa revisão/questões dos temas fracos em TODO o plano. */
  usarDesempenhoNoPlano?: boolean; pesoDesempenho?: number; acertoMin?: number
  /** regras 2.18 (desligadas por padrão). */
  pdfInteiro218?: boolean; revisaoPorResultado218?: boolean
  /** 2.19: meta semanal de Jurisprudência (desligada por padrão) e sua duração em minutos (padrão 60). */
  jurisprudencia219?: boolean; jurisprudenciaMin?: number
  /** 2.13/2.17: diagnóstico dos temas anteriores ("Já estuda pelo Revisão?" = Sim) e reforço pelo resultado (desligado por padrão). */
  historicoDiagnostico219?: boolean
}
export interface ParamsResolvido {
  velPadrao: number
  offsetRevisao: number; offsetQuestoes: number
  semFlash: Set<string>
  tetoPdfDia: number
  lpJanelaRodizio: number
  concentracaoAteH: number
  maxSemanas: number
  dur: Record<string, number>        // { fl, qu, lp }
  durRevisao: Record<string, number> // { rf, rq }
  legproc: { metasDia: number; discDia: number; mesmaDisc: number }
  desempenho: { ativo: boolean; peso: number; acertoMin: number }
  regras218: { pdfInteiro: boolean; revisaoPorResultado: boolean }
  juris: { ativo: boolean; min: number }
  historico: { ativo: boolean }
}
export function resolverParams(p?: ParamsMotor28 | null): ParamsResolvido {
  const q = p || {}
  const num = (v: number | undefined, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  return {
    velPadrao: q.velPadrao && q.velPadrao > 0 ? q.velPadrao : VEL_PADRAO,
    offsetRevisao: num(q.offsetRevisao, 1),
    offsetQuestoes: num(q.offsetQuestoes, 2),
    semFlash: Array.isArray(q.semFlash) ? new Set(q.semFlash) : SEM_FLASH,
    tetoPdfDia: num(q.tetoPdfDia, 2),
    lpJanelaRodizio: num(q.lpJanelaRodizio, 6),
    concentracaoAteH: num(q.concentracaoAteH, 18),
    maxSemanas: num(q.maxSemanas, MAX_SEM),
    dur: { fl: num(q.durFl, DUR.fl), qu: num(q.durQu, DUR.qu), lp: num(q.durLp, DUR.lp) },
    durRevisao: { rf: num(q.durRf, DUR_REVISAO.rf), rq: num(q.durRq, DUR_REVISAO.rq) },
    legproc: { metasDia: num(q.lpMetasDia, 4), discDia: num(q.lpDiscDia, 2), mesmaDisc: num(q.lpMesmaDisc, 2) },
    desempenho: { ativo: q.usarDesempenhoNoPlano === true, peso: Math.max(0, num(q.pesoDesempenho, 1)), acertoMin: num(q.acertoMin, 60) },
    regras218: { pdfInteiro: q.pdfInteiro218 === true, revisaoPorResultado: q.revisaoPorResultado218 === true },
    historico: { ativo: q.historicoDiagnostico219 === true },
    juris: { ativo: q.jurisprudencia219 === true, min: Math.min(180, Math.max(15, Math.round(num(q.jurisprudenciaMin, 60)))) },
  }
}
export const PARAMS_PADRAO_MOTOR = resolverParams()

// ── Inteligência de desempenho (Fase 3) ──────────────────────────────────────────────────────────
export interface NotaTema { grau?: number; res?: number; err?: number; cert?: number | null; resultadoAtualizadoEm?: number }
/** Temas (índice em AS) "fracos": grau de dificuldade ≥ 7 OU acerto (questões da aula + das semanas de revisão) < acertoMin. */
export function temasFracos(notas: Record<string, NotaTema> | undefined | null, acertoMin: number): Set<number> {
  const fracos = new Set<number>(), res: Record<number, number> = {}, err: Record<number, number> = {}
  for (const [id, n] of Object.entries(notas || {})) {
    if (!n) continue
    const p = id.split(':')
    if (p[0] === 'pf') { if (p.length === 2 && (+(n.grau ?? 0)) >= 7) fracos.add(+p[1]) }
    else if (p[0] === 'qu' || p[0] === 'rq') { const i = +p[p[0] === 'rq' ? 2 : 1]; res[i] = (res[i] || 0) + +(n.res || 0); err[i] = (err[i] || 0) + +(n.err || 0) }
  }
  for (const k of Object.keys(res)) { const i = +k; if (res[i] > 0 && Math.max(0, (res[i] - (err[i] || 0)) / res[i] * 100) < acertoMin) fracos.add(i) }
  return fracos
}
// ── Regras da versão 2.18 (puras, testáveis) ─────────────────────────────────────────────────────
/** Reforço/revisão pelo percentual EXATO, sem arredondar: <50 → 'pf' (releitura) · 50 até <70 → 'fl' (PDFlash) · ≥70 → 'ok' (nada). */
export function classificarResultado218(pct: number): 'pf' | 'fl' | 'ok' { return pct < 50 ? 'pf' : pct < 70 ? 'fl' : 'ok' }
/** Resultado de um tema: questões da aula (qu:i) + das semanas de revisão (rq:*:i). Válido só com total inteiro > 0 e 0 ≤ acertos ≤ total. */
export function resultadoTema218(notas: Record<string, NotaTema> | undefined | null, i: number): { pct: number; total: number } | null {
  let total = 0, err = 0
  for (const [id, n] of Object.entries(notas || {})) {
    if (!n) continue
    const p = id.split(':')
    if ((p[0] === 'qu' && +p[1] === i) || (p[0] === 'rq' && +p[2] === i)) {
      const t = +(n.res || 0), e = +(n.err || 0)
      if (Number.isInteger(t) && Number.isInteger(e) && t > 0 && e >= 0 && e <= t) { total += t; err += e }
    }
  }
  return total > 0 ? { pct: (total - err) / total * 100, total } : null
}
/**
 * Fila da semana de revisão pelo resultado recente (2.18): <50% primeiro, depois 50–70%, depois temas sem resultado;
 * ≥70% fica de fora. Dentro do grupo: menor acerto, depois PDFull mais antigo, depois índice. Temas já revisados vão ao fim do grupo.
 */
export function rankingRevisao218(plano: Record<string, [DataISO, number]>, notas: Record<string, NotaTema> | undefined | null, ateData: DataISO, jaRevisados: Set<number>) {
  const cand: Array<{ i: number; d: DataISO; grau: number | null; acerto: number | null; prioritario: boolean; pontos: number }> = []
  for (const [id, [d]] of Object.entries(plano)) {
    if (!/^pf:[0-9]+$/.test(id) || d >= ateData) continue
    const i = +id.split(':')[1], r = resultadoTema218(notas, i)
    const cls = r ? classificarResultado218(r.pct) : null
    if (cls === 'ok') continue
    const grupo = cls === 'pf' ? 0 : cls === 'fl' ? 1 : 2
    cand.push({ i, d, grau: ((notas || {})['pf:' + i]?.grau as number | undefined) ?? null, acerto: r ? r.pct : null, prioritario: grupo < 2, pontos: -(grupo * 1000) + (r ? 100 - r.pct : 0) - (jaRevisados.has(i) ? 4 : 0) })
  }
  return cand.sort((a, b) => (b.pontos - a.pontos) || (a.d < b.d ? -1 : a.d > b.d ? 1 : a.i - b.i))
}

/**
 * Data ideal da revisão ('fl') ou das questões ('qu') de uma aula. Sem desempenho ligado, ou para tema não fraco,
 * é exatamente a do modelo 2.8 (mesmo dia da semana, N semanas de conteúdo depois). Tema FRACO: antecipa
 * round(peso × 2) dias, nunca antes de 1 dia após o PDFull.
 */
export function idealRev(cfg: Cfg28, P: ParamsResolvido, fracos: Set<number>, i: number, dataPdf: DataISO, tipo: 'fl' | 'qu'): DataISO {
  const due = proxSemConteudo(cfg, dataPdf, tipo === 'fl' ? P.offsetRevisao : P.offsetQuestoes)
  if (!P.desempenho.ativo || !fracos.has(i)) return due
  const adiantado = dAdd(due, -Math.round(P.desempenho.peso * 2)), minimo = dAdd(dataPdf, 1)
  return adiantado > minimo ? adiantado : (due < minimo ? due : minimo)
}

// ── datas (ISO local, sem fuso) ──
export function dParse(s: DataISO): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12) }
export function dISO(d: Date): DataISO { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
// funções de data memoizadas (puras sobre strings; dParse devolve Date mutável, então só os resultados string/number são cacheados)
const memoStr = <T>(f: (k: string) => T) => { const c = new Map<string, T>(); return (k: string): T => { let v = c.get(k); if (v === undefined) { if (c.size > 80000) c.clear(); v = f(k); c.set(k, v) } return v } }
const dAddMemo = memoStr((k: string) => { const i = k.indexOf('|'); const d = dParse(k.slice(0, i)); d.setDate(d.getDate() + Number(k.slice(i + 1))); return dISO(d) })
export function dAdd(s: DataISO, n: number): DataISO { return typeof s === 'string' && typeof n === 'number' ? dAddMemo(s + '|' + n) : (() => { const d = dParse(s); d.setDate(d.getDate() + n); return dISO(d) })() }
const dDowMemo = memoStr((s: string) => (dParse(s).getDay() + 6) % 7)
export function dDow(s: DataISO): number { return typeof s === 'string' ? dDowMemo(s) : (dParse(s).getDay() + 6) % 7 }
export function dMon(s: DataISO): DataISO { return dAdd(s, -dDow(s)) }
const semDeMemo = memoStr((k: string) => { const i = k.indexOf('|'); return Math.round((+dParse(dMon(k.slice(i + 1))) - +dParse(dMon(k.slice(0, i)))) / 864e5 / 7) + 1 })
export function semDe(start: DataISO, s: DataISO): number { return typeof s === 'string' && typeof start === 'string' ? semDeMemo(start + '|' + s) : Math.round((+dParse(dMon(s)) - +dParse(dMon(start))) / 864e5 / 7) + 1 }
export function semInicio(start: DataISO, sem: number): DataISO { return dAdd(dMon(start), (sem - 1) * 7) }

// ── disponibilidade ──
export function horasEm(cfg: Cfg28, d: DataISO): number[] {
  let h = cfg.horas
  for (const r of [...(cfg.rotinas || [])].sort((a, b) => (a.desde < b.desde ? -1 : 1))) if (r.desde <= d) h = r.horas
  return h
}
export function recessoEm(cfg: Cfg28, d: DataISO) { return (cfg.recessos || []).find((r) => r.ini <= d && d <= r.fim) || null }
/** Horas do dia: pontual da data > recesso (0) > rotina vigente. */
export function horasDia(cfg: Cfg28, d: DataISO): number {
  const p = cfg.horasPontuais && cfg.horasPontuais[d]
  if (p != null && Number.isFinite(+p)) return Math.max(0, Math.min(24, +p))
  return recessoEm(cfg, d) ? 0 : (+(horasEm(cfg, d)[dDow(d)] || 0))
}
export function ehRev(cfg: Cfg28, sem: number): boolean {
  const r = cfg.revisao
  return !!(r && r.ativa && r.cada && r.cada > 0 && sem > 0 && sem % r.cada === 0)
}
export function proxSemConteudo(cfg: Cfg28, s: DataISO, n: number): DataISO {
  let sem = semDe(cfg.start, s), k = 0
  while (k < n) { sem++; if (!ehRev(cfg, sem)) k++ }
  return dAdd(semInicio(cfg.start, sem), dDow(s))
}
export function minPdf(p: number, vel?: number, velPadrao = VEL_PADRAO): number { const v = vel && vel > 0 ? vel : (velPadrao > 0 ? velPadrao : VEL_PADRAO); return Math.max(30, Math.ceil((p || 60) / v * 2 - 1e-9) * 30) }
export const proximoEstudo = (cfg: Cfg28, aPartir: DataISO): DataISO | null => {
  for (let n = 0, d = aPartir; n < 1400; n++, d = dAdd(d, 1)) if (d >= cfg.start && horasDia(cfg, d) > 0) return d
  return null
}

/** Perfil da semana: horas da rotina e o dia que concentra as questões (≤18 h e mais de 1 dia disponível). */
export function perfilSemana(cfg: Cfg28, sem: number, ateH = 18): { horas: number; concentrado: DataISO | null } {
  const ini = semInicio(cfg.start, sem), datas = Array.from({ length: 7 }, (_, i) => dAdd(ini, i))
  const horas = datas.reduce((n, d) => n + (+(horasEm(cfg, d)[dDow(d)] || 0)), 0)
  const disponiveis = datas.filter((d) => d >= cfg.start && horasDia(cfg, d) > 0)
  return { horas, concentrado: horas <= ateH && disponiveis.length > 1 ? disponiveis[disponiveis.length - 1] : null }
}

type ItemRev = { t: string; n: number }
/** Semana de revisão: por tema, Revisão (60) + Questões (30), preenchendo cada dia; dia concentrado só recebe questões. */
export function planoRevisao(capDias: number[], temas: number, apenasQuestoes: boolean[] = [], dur: Record<string, number> = DUR_REVISAO): Array<{ itens: ItemRev[]; usado: number }> {
  if (apenasQuestoes.some(Boolean)) return planoRevisaoConcentrada(capDias, temas, apenasQuestoes, dur)
  const fila: ItemRev[] = []
  for (let n = 0; n < temas; n++) fila.push({ t: 'rf', n }, { t: 'rq', n })
  let q = 0
  return capDias.map((c) => {
    const itens: ItemRev[] = []; let usado = 0
    while (q < fila.length && usado + dur[fila[q].t] <= c) { itens.push(fila[q]); usado += dur[fila[q].t]; q++ }
    return { itens, usado }
  })
}
export function planoRevisaoConcentrada(capDias: number[], temas: number, apenasQuestoes: boolean[], dur: Record<string, number> = DUR_REVISAO): Array<{ itens: ItemRev[]; usado: number }> {
  const out = capDias.map(() => ({ itens: [] as ItemRev[], usado: 0 })), livre = capDias.map((c) => Math.max(0, c))
  for (let n = 0; n < temas; n++) {
    let colocou = false
    for (let r = 0; r < livre.length; r++) {
      if (apenasQuestoes[r] || livre[r] < dur.rf) continue
      livre[r] -= dur.rf
      const pref = livre.map((_, k) => k).filter((k) => k >= r).sort((a, b) => Number(!!apenasQuestoes[b]) - Number(!!apenasQuestoes[a]) || a - b)
      const q = pref.find((k) => livre[k] >= dur.rq)
      if (q == null) { livre[r] += dur.rf; continue }
      out[r].itens.push({ t: 'rf', n }); out[r].usado += dur.rf
      out[q].itens.push({ t: 'rq', n }); out[q].usado += dur.rq; livre[q] -= dur.rq; colocou = true; break
    }
    if (!colocou) break
  }
  return out
}

const chaveLeiCache = new Map<string, string>()
/** Chave da lei de uma meta de LegProc (disciplina + lei normalizada). */
export function chaveLei(meta: { disc?: string; lei?: string } | null | undefined): string {
  if (!meta?.lei || !String(meta.lei).trim()) return ''
  const k = meta.disc + ' ' + meta.lei
  let v = chaveLeiCache.get(k); if (v !== undefined) return v
  v = meta.disc + '|' + String(meta.lei).normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')
  if (chaveLeiCache.size > 20000) chaveLeiCache.clear()
  chaveLeiCache.set(k, v); return v
}
/** Pode entrar mais esta meta de LegProc no dia? ≤4 metas; ≤2 disciplinas; ≤2 por disciplina, e da mesma lei. */
export function permitirLegproc25(id: string, idsDia: string[], metaDe: (id: string) => ItemLP | undefined, lim: { metasDia: number; discDia: number; mesmaDisc: number } = { metasDia: 4, discDia: 2, mesmaDisc: 2 }): boolean {
  const m = metaDe(id); if (!m?.disc || idsDia.length >= lim.metasDia) return false
  const existentes = idsDia.map((x) => ({ id: x, m: metaDe(x) })).filter((x) => x.m?.disc) as Array<{ id: string; m: ItemLP }>
  const disciplinas = new Set(existentes.map((x) => x.m.disc)), daDisc = existentes.filter((x) => x.m.disc === m.disc)
  if (daDisc.length >= lim.mesmaDisc) return false
  if (!daDisc.length) return disciplinas.size < lim.discDia
  const lei = chaveLei(m)
  return !!lei && daDisc.every((x) => chaveLei(x.m) === lei)
}
/** Rodízio de disciplinas do LegProc: janela das 6 primeiras com metas pendentes, girando após a última usada. */
export function criarRodizioLP25(disciplinas: string[], ultima: string | null = null, janela = 6) {
  const ordem = [...new Set(disciplinas)], estado = { ultima }
  return {
    ordenar(pendentes: Array<string | undefined>): string[] {
      const disponiveis = new Set(pendentes), ativas = ordem.filter((d) => disponiveis.has(d)).slice(0, janela)
      const pos = ordem.indexOf(estado.ultima as string)
      return [...ativas.filter((d) => ordem.indexOf(d) > pos), ...ativas.filter((d) => ordem.indexOf(d) <= pos)]
    },
    avancar(disciplina: string | undefined) { estado.ultima = disciplina ?? null },
  }
}
export function limitePDF27(cfg: Cfg28, teto = 2): number { return cfg.maisPDFull === false ? 1 : teto }
/** Aulas cujo PDFull COMEÇA no dia d (continuações não contam). */
export function novosPDFDia27(plano: Plano, cfg: Cfg28, d: DataISO, detalhes: Record<string, Detalhe> = {}): Set<number> {
  const primeiros = new Map<number, DataISO>(), restos = new Set<number>()
  for (const [id, [dia]] of Object.entries(plano)) {
    if (!/^p[fp]:[0-9]+(:[0-9]+)?$/.test(id)) continue
    const i = +id.split(':')[1]
    if (!primeiros.has(i) || dia < primeiros.get(i)!) primeiros.set(i, dia)
    if (detalhes[id]?.continuacao || (cfg.paginasLidas?.[i] || 0) > 0 || (cfg.partesLidas?.[i] || 0) > 0) restos.add(i)
  }
  return new Set([...primeiros].filter(([i, dia]) => dia === d && !restos.has(i)).map(([i]) => i))
}

// ── histórico prévio ("Já estuda pelo Revisão?") ──
/** Índices de AS declarados como já estudados (prefixo inclusivo, na ordem de AS, por disciplina selecionada). */
export function indicesAnteriores(cfg: Cfg28, AS: AulaAS[], ordem?: number[] | null): Set<number> {
  const out = new Set<number>()
  if (!cfg.jaEstudaRevisao || !cfg.ultimosTemas) return out
  const ativas = new Set(cfg.discs)
  const pos: Record<string, number> = {}
  const escolhida: Record<string, number> = {} // disciplina → índice (em AS) da aula que o aluno marcou como a última estudada
  AS.forEach((a, i) => {
    const disc = a[0]; const k = pos[disc] = (pos[disc] ?? -1) + 1
    const lim = cfg.ultimosTemas![disc]
    if (ativas.has(disc) && typeof lim === 'number' && lim >= 0 && k <= lim) out.add(i)
    if (ativas.has(disc) && typeof lim === 'number' && lim >= 0 && k === lim) escolhida[disc] = i
  })
  // O prefixo "já estudado" vale na ORDEM DO CURSO (a de estudo), não na ordem de AS (títulos da Biblioteca, que pode ser
  // alfabética: marcava "Parte 3" sem as partes 1 e 2 e repetia conteúdo já visto). A aula escolhida continua sendo a mesma.
  if (ordem && ordem.length) {
    const rank = new Map(ordem.map((i, k) => [i, k]))
    for (const [disc, i] of Object.entries(escolhida)) {
      const r = rank.get(i); if (r == null) continue // aula fora da ordem (inativa): mantém o prefixo antigo da disciplina
      AS.forEach((a, j) => { if (a[0] === disc) { const rj = rank.get(j); if (rj != null) { if (rj <= r) out.add(j); else out.delete(j) } } })
    }
  }
  return out
}
/**
 * Matérias em PARALELO. O catálogo traz as aulas em "ondas" (as 4 primeiras matérias consomem muitas semanas antes de as
 * outras começarem). Aqui a fila é reequilibrada entre as disciplinas SELECIONADAS: mantém a ordem das aulas dentro de cada
 * disciplina (Parte 1 → 2 → 3…) e, a cada passo, escolhe a disciplina com MENOR fração do conteúdo já consumida (em páginas),
 * dentro de uma janela de `paralelo` disciplinas (ao terminar uma, entra a próxima da fila).
 *  · paralelo > 0  → janela fixa escolhida pelo aluno (limitada ao nº de disciplinas);
 *  · paralelo null/0 → automático: até 4 disciplinas mantém o catálogo; acima de 4 equilibra todas (evita "4 matérias por 19 semanas").
 * Não mexe nas aulas fora da seleção / já estudadas (ficam ao fim, na ordem original).
 */
export function ordemParalela(ordem: number[], AS: AulaAS[], ativas: Set<string>, anteriores: Set<number>, paralelo: number | null): number[] {
  const uteis = ordem.filter((i) => AS[i] && ativas.has(AS[i][0]) && !anteriores.has(i))
  const resto = ordem.filter((i) => !(AS[i] && ativas.has(AS[i][0]) && !anteriores.has(i)))
  const discs: string[] = []
  const fila = new Map<string, number[]>()
  for (const i of uteis) { const d = AS[i][0]; if (!fila.has(d)) { fila.set(d, []); discs.push(d) } fila.get(d)!.push(i) }
  const n = discs.length
  const janela = paralelo && paralelo > 0 ? Math.min(Math.floor(paralelo), n) : (n > 4 ? n : 0)
  if (!janela || n <= 1) return ordem
  const pag = (i: number) => Math.max(1, +AS[i][3] || 60)
  const total = new Map(discs.map((d) => [d, fila.get(d)!.reduce((s, i) => s + pag(i), 0)]))
  const lido = new Map<string, number>(), pos = new Map<string, number>()
  const ativasJanela = discs.slice(0, janela); let proxima = janela
  ativasJanela.forEach((d) => { lido.set(d, 0); pos.set(d, 0) })
  const fr = (d: string) => lido.get(d)! / total.get(d)!
  const saida: number[] = []
  while (ativasJanela.length) {
    let melhor = ativasJanela[0]
    for (const d of ativasJanela) if (fr(d) < fr(melhor) - 1e-9) melhor = d
    const q = fila.get(melhor)!, k = pos.get(melhor)!
    saida.push(q[k]); pos.set(melhor, k + 1); lido.set(melhor, lido.get(melhor)! + pag(q[k]))
    if (k + 1 >= q.length) {
      const idx = ativasJanela.indexOf(melhor); ativasJanela.splice(idx, 1)
      if (proxima < discs.length) { // a próxima disciplina entra no nível das que seguem em andamento (não "recupera" tudo de uma vez)
        const nova = discs[proxima++]
        lido.set(nova, ativasJanela.length ? Math.min(...ativasJanela.map(fr)) * total.get(nova)! : 0); pos.set(nova, 0)
        ativasJanela.push(nova)
      }
    }
  }
  return [...saida, ...resto]
}
const tipoEstudo = (id: string) => id.split(':')[0]
/** 2.13: diagnóstico de tema anterior (`qu:<aula>:hist:<semana>`) e reforço do diagnóstico (`pf|fl:<aula>:reforco:<semana>`). */
export const ehHist = (id: string) => /^qu:\d+:hist:\d+$/.test(id)
export const ehReforco = (id: string) => /^(pf|fl):\d+:reforco:\d+$/.test(id)
const ehPdf = (t: string) => t === 'pf' || t === 'pp'
const indiceAula = (id: string) => { const p = id.split(':'); return +p[/^r[fq]$/.test(p[0]) ? 2 : 1] }
const copiar = <T>(x: T): T => JSON.parse(JSON.stringify(x ?? {}))

export interface ResultadoPlano { plano: Plano; fim: number; detalhes?: Record<string, Detalhe> }

/**
 * gerarPlanoBase do modelo. cfg.ordemAulas = fila de aulas; legprocs = metas na ordem do catálogo (id = id no plano).
 * fixos = {id: [data, horas]} — metas que não se movem. ancora = data a partir da qual o resto é distribuído.
 */
function gerarPlanoBase(cfg: Cfg28, AS: AulaAS[], ordemAulas: number[] | null, legprocs: ItemLP[], fixos: Plano, ancora: DataISO | null, P: ParamsResolvido, fracos: Set<number>): ResultadoPlano {
  const start = cfg.start
  // v3: parâmetros configuráveis sombreiam as constantes 2.8 — sem params = valores idênticos aos de hoje.
  const DUR = P.dur, SEM_FLASH = P.semFlash, MAX_SEM = P.maxSemanas
  const A = ancora && ancora > start ? ancora : start
  const ativas = new Set(cfg.discs)
  const metas = cfg.metas || {}
  const plano: Plano = {}
  const carga: Record<string, number> = {} // data -> minutos ocupados
  for (const [id, v] of Object.entries(fixos)) {
    if (/^r[fqv]:/.test(id) && !cfg.remanejadas?.[id]) continue
    plano[id] = v
    if (v[0] >= A) carga[v[0]] = (carga[v[0]] || 0) + Math.round(v[1] * 60)
  }
  const fixo = (id: string) => !!fixos[id]
  const algumDia = [cfg.horas, ...(cfg.rotinas || []).map((r) => r.horas), Object.values(cfg.horasPontuais || {})].some((h) => (h || []).some((x) => +x > 0))
  if (!algumDia) return { plano, fim: semDe(start, A) }

  const pdfQ: number[] = []
  ;(ordemAulas || AS.map((_, i) => i)).forEach((i) => { const a = AS[i]; if (a && ativas.has(a[0]) && !fixo('pf:' + i)) pdfQ.push(i) })
  let qi = 0
  // PDFULL dividido em partes ('pp:i:k'): partes já concluídas descontam do tempo que falta ler
  const feitoParte: Record<string, number> = {}, maxParte: Record<string, number> = {}
  for (const [id, v] of Object.entries(fixos)) if (id.startsWith('pp:')) { const [, i, k] = id.split(':'); feitoParte[i] = (feitoParte[i] || 0) + Math.round(v[1] * 60); maxParte[i] = Math.max(maxParte[i] || 0, +k) }
  const restante = (i: number) => Math.max(30, minPdf(AS[i][3], cfg.vel, P.velPadrao) - (feitoParte[i] || 0) - (cfg.partesLidas?.[i] || 0))
  let ultimaLeitura = start
  let emCurso: { i: number; resta: number; k: number; ultima: DataISO } | null = null
  type Devido = { id: string; due: DataISO; tipo: string; ord: number }
  const devidos: Devido[] = []
  let ord = 0
  const registrar = (i: number, dataPdf: DataISO) => {
    const disc = AS[i][0]
    if (metas.fl && !SEM_FLASH.has(disc) && !fixo('fl:' + i)) devidos.push({ id: 'fl:' + i, due: idealRev(cfg, P, fracos, i, dataPdf, 'fl'), tipo: 'fl', ord: ord++ })
    if (metas.qu && !fixo('qu:' + i)) devidos.push({ id: 'qu:' + i, due: idealRev(cfg, P, fracos, i, dataPdf, 'qu'), tipo: 'qu', ord: ord++ })
  }
  // dívidas: PDFs já concluídos cujas revisões/questões ainda não foram feitas
  AS.forEach((a, i) => { if (ativas.has(a[0]) && (!ordemAulas || ordemAulas.includes(i)) && fixos['pf:' + i]) registrar(i, fixos['pf:' + i][0]) })

  const semA = semDe(start, A)
  // O catálogo fornece uma fila estável e vinculada às disciplinas selecionadas.
  const ignorar = new Set(cfg.lpIgnorar || [])
  const lpCarry = metas.lp ? legprocs.filter((x) => ativas.has(x.disc) && !fixo(x.id) && !ignorar.has(x.id)).map((x) => x.id) : []
  const mapaLP25 = new Map(legprocs.map((m, k) => [m.id, { ...m, ordem: k }]))
  const historicoLP25 = Object.entries(fixos).filter(([id, [d]]) => id.startsWith('lp:') && d <= A && mapaLP25.has(id))
    .sort((a, b) => a[1][0].localeCompare(b[1][0]) || mapaLP25.get(a[0])!.ordem - mapaLP25.get(b[0])!.ordem)
  const ultimaLP25 = historicoLP25.length ? mapaLP25.get(historicoLP25[historicoLP25.length - 1][0])!.disc : null
  const rodizioLP25 = criarRodizioLP25(cfg.discs, ultimaLP25, P.lpJanelaRodizio)
  const porData = (a: Devido, b: Devido) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.ord - b.ord)
  const lpMetas = mapaLP25 as Map<string, ItemLP>

  let fim = semA
  for (let sem = semA; sem <= MAX_SEM; sem++) {
    const ini = semInicio(start, sem), fimSem = dAdd(ini, 6)
    const diasSem = [0, 1, 2, 3, 4, 5, 6].map((d) => dAdd(ini, d)).filter((dt) => dt >= A && horasDia(cfg, dt) > 0)
    const semRev = ehRev(cfg, sem)
    const perfil = perfilSemana(cfg, sem, P.concentracaoAteH)
    const concentrado = perfil.concentrado && diasSem.includes(perfil.concentrado) ? perfil.concentrado : null
    const diasConteudo = diasSem.filter((d) => d !== concentrado)
    const diasQuestoes = concentrado ? [concentrado, ...diasConteudo] : diasSem
    const cap = (dt: DataISO) => horasDia(cfg, dt) * 60
    const livre = (dt: DataISO) => cap(dt) - (carga[dt] || 0)
    const por = (dt: DataISO, id: string, m: number) => { plano[id] = [dt, m / 60]; carga[dt] = (carga[dt] || 0) + m }
    const maisLivre = (lista: DataISO[], m: number) => { let b: DataISO | null = null, r = -1; for (const dt of lista) { const x = livre(dt); if (x >= m && x > r) { r = x; b = dt } } return b }
    const vencidos = (tipo?: string) => devidos.filter((x) => x.due <= fimSem && (!tipo || x.tipo === tipo)).sort(porData)
    const tirar = (x: Devido) => devidos.splice(devidos.indexOf(x), 1)
    /** Coloca uma meta no dia do vencimento; se não couber, no dia mais livre a partir dele; depois, no mais livre da semana. */
    const encaixar = (x: Devido, dias: DataISO[], soNoDia?: boolean) => {
      const m = DUR[x.tipo]
      let dt: DataISO | null = dias.includes(x.due) && livre(x.due) >= m ? x.due : null
      if (!dt && !soNoDia) dt = maisLivre(dias.filter((d) => d >= x.due), m) || maisLivre(dias, m)
      if (dt) { por(dt, x.id, m); tirar(x); return true }
      return false // sem espaço: passa para a semana seguinte, nunca é descartada
    }
    const encaixarTipo = (tipo: string, dias: DataISO[], soNoDia?: boolean) => {
      for (const x of vencidos(tipo)) {
        if (tipo === 'qu' && concentrado && dias.includes(concentrado) && livre(concentrado) >= DUR.qu) { por(concentrado, x.id, DUR.qu); tirar(x) }
        else encaixar(x, dias, soNoDia)
      }
    }
    /** Até duas metas da mesma lei; um segundo bloco deve ser de outra disciplina. */
    const encaixarLP = (dias: DataISO[]) => {
      const meta = (id: string) => lpMetas.get(id)
      for (const dt of [...dias].sort()) {
        const idsDia = () => Object.keys(plano).filter((id) => id.startsWith('lp:') && plano[id][0] === dt)
        while (livre(dt) >= DUR.lp) {
          let k = -1
          const rodizio = rodizioLP25.ordenar(lpCarry.map((id) => meta(id)?.disc))
          for (const disc of rodizio) {
            const primeiro = lpCarry.findIndex((id) => meta(id)?.disc === disc)
            if (primeiro >= 0 && permitirLegproc25(lpCarry[primeiro], idsDia(), meta, P.legproc)) { k = primeiro; break }
          }
          if (k < 0) break
          const id = lpCarry.splice(k, 1)[0], m = meta(id)!; por(dt, id, DUR.lp)
          rodizioLP25.avancar(m.disc)
          // Completa o primeiro bloco antes de procurar uma segunda disciplina.
          const j = lpCarry.findIndex((x) => meta(x)?.disc === m.disc)
          if (j >= 0 && livre(dt) >= DUR.lp && permitirLegproc25(lpCarry[j], idsDia(), meta, P.legproc)) por(dt, lpCarry.splice(j, 1)[0], DUR.lp)
        }
      }
    }
    /** Lê PDFULL em um dia: termina o que estiver em curso ou começa o próximo; o que não couber vira parte e continua depois. */
    const pdfsEm = (dt: DataISO) => new Set(Object.entries(plano).filter(([id, [d]]) => d === dt && /^p[fp]:/.test(id)).map(([id]) => +id.split(':')[1]))
    const lerPdf = (dt: DataISO, limite: number, soInteiro = false): boolean => {
      if (dt < ultimaLeitura) return false
      const candidato = emCurso?.i ?? pdfQ[qi]
      if (candidato == null) return false
      if (soInteiro && !emCurso && restante(candidato) > limite) return false // 2.18 (CT-06): não abre PDFull que não cabe inteiro na sobra
      const datas = Object.entries(plano).filter(([id]) => /^p[fp]:/.test(id) && +id.split(':')[1] === candidato).map(([, v]) => v[0])
      const resto = (emCurso?.ultima && emCurso.ultima < dt) || datas.some((d) => d < dt) || (cfg.paginasLidas?.[candidato] || 0) > 0 || (cfg.partesLidas?.[candidato] || 0) > 0
      if (!resto && !pdfsEm(dt).has(candidato) && novosPDFDia27(plano, cfg, dt).size >= limitePDF27(cfg, P.tetoPdfDia)) return false
      if (!emCurso) {
        if (qi >= pdfQ.length) return false
        const i = pdfQ[qi++]
        emCurso = { i, resta: restante(i), k: maxParte[i] || 0, ultima: Object.entries(fixos).filter(([id]) => id.startsWith('pp:' + i + ':')).reduce((d, [, v]) => (v[0] > d ? v[0] : d), '') }
      }
      if (emCurso.ultima && dt < emCurso.ultima) return false // a continuação nunca vem antes da parte já marcada
      const m = Math.min(emCurso.resta, Math.floor(limite / 30) * 30)
      if (m < 30) return false
      ultimaLeitura = dt
      const { i } = emCurso
      if (m >= emCurso.resta) { if (metas.pf) por(dt, 'pf:' + i, m); registrar(i, dt); emCurso = null }
      else { if (metas.pf) por(dt, `pp:${i}:${++emCurso.k}`, m); emCurso.resta -= m; emCurso.ultima = dt }
      return true
    }
    /** Sobras são usadas somente depois das quatro prioridades do dia. */
    const preencher = (dias: DataISO[]) => {
      encaixarTipo('fl', dias.filter((d) => d !== concentrado))
      encaixarTipo('qu', dias)
      encaixarLP(dias)
      if (qi >= pdfQ.length && !emCurso) {
        // Na reta final, mantém a precedência da aula e da revisão de cada tema.
        for (const tipo of ['fl', 'qu']) for (const x of [...devidos].filter((y) => y.tipo === tipo).sort(porData)) {
          const i = x.id.split(':')[1], antes = tipo === 'qu' && plano['fl:' + i] ? plano['fl:' + i][0] : plano['pf:' + i]?.[0]
          const permitidos = (tipo === 'fl' ? dias.filter((d) => d !== concentrado) : diasQuestoes).filter((d) => !antes || d > antes)
          const dt = permitidos.find((d) => livre(d) >= DUR[tipo])
          if (dt) { por(dt, x.id, DUR[tipo]); tirar(x) }
        }
      }
    }
    if (semRev) {
      // Semana de revisão: sem aulas novas. Reserva Revisão + questões (1h30) por tema já estudado;
      // o tempo que sobrar recebe pendências e LegProc.
      const temas = Object.entries(plano).filter(([id, [d]]) => id.startsWith('pf:') && d < ini).length
      const reserva = planoRevisao(diasSem.map((dt) => livre(dt)), temas, diasSem.map((dt) => dt === concentrado), P.durRevisao)
      diasSem.forEach((dt, k) => { if (reserva[k].usado) carga[dt] = (carga[dt] || 0) + reserva[k].usado })
      preencher(diasSem)
      fim = sem; continue
    }

    // Primeiro PDF depois das revisões; segundo PDF somente depois das questões e dos dois blocos de LegProc.
    encaixarTipo('fl', diasConteudo)
    const diasPdf = diasConteudo.filter((d) => cap(d) >= 30)
    if (concentrado) encaixarTipo('qu', [concentrado])
    for (const dt of [...diasSem].sort()) {
      const permitePdf = diasPdf.includes(dt)
      if (permitePdf && pdfsEm(dt).size === 0) lerPdf(dt, livre(dt))
      encaixarTipo('qu', [dt])
      encaixarLP([dt])
      if (permitePdf) for (let tentativa = 0; tentativa < 2 && livre(dt) >= 30; tentativa++) if (!lerPdf(dt, livre(dt), P.regras218.pdfInteiro)) break
    }
    preencher(diasSem)
    if (diasSem.some((dt) => carga[dt])) fim = sem
    const acabou = qi >= pdfQ.length && !emCurso && !devidos.length && !lpCarry.length
    if (acabou) break
  }
  return { plano, fim }
}

/** Páginas (início/fim) de uma parte de PDFull, proporcionais aos minutos das partes da aula no plano. */
export function detalhesPdf(id: string, plano: Plano, detalhes: Record<string, Detalhe>, AS: AulaAS[]): Detalhe {
  if (detalhes[id]?.paginaInicio != null) return { ...detalhes[id] }
  const i = indiceAula(id), total = AS[i]?.[3] || 0
  const blocos = Object.entries(plano).filter(([k]) => /^p[fp]:[0-9]+(:[0-9]+)?$/.test(k) && indiceAula(k) === i)
    .sort((a, b) => a[1][0].localeCompare(b[1][0]) || (Number(tipoEstudo(a[0]) === 'pf') - Number(tipoEstudo(b[0]) === 'pf')) || a[0].localeCompare(b[0], 'en', { numeric: true }))
  const minutos = blocos.reduce((s, [, [, h]]) => s + h * 60, 0); let antes = 0
  for (const [k, [, h]] of blocos) {
    const ini = minutos ? Math.floor(total * antes / minutos) + 1 : 1
    antes += h * 60
    if (k === id) return { paginaInicio: ini, paginaFim: minutos ? Math.floor(total * antes / minutos) : total, totalPaginas: total }
  }
  return { paginaInicio: 1, paginaFim: total, totalPaginas: total }
}

interface CtxInterno { AS: AulaAS[]; LP: ItemLP[]; lpMap: Map<string, ItemLP>; lpPos: Map<string, number>; ordem: number[]; feitas: Set<string>; usados: Set<string>; params: ParamsResolvido; fracos: Set<number> }

/**
 * calcularDomino do modelo: redistribui `fonte` a partir de `desde`, dia a dia, respeitando continuidade
 * (metas remanejadas primeiro), Revisão → PDFull → Questões → LegProc, a ordem das aulas, o limite de PDFull
 * novos e as regras do LegProc. Lança erro se não houver disponibilidade (o chamador decide o que fazer).
 */
export function calcularDomino(fonte: Plano, cfg: Cfg28, desde: DataISO, opcoes: { detalhes?: Record<string, Detalhe>; adiantarLP?: boolean; adiantarPDF?: boolean }, c: CtxInterno): ResultadoPlano {
  const plano: Plano = {}, detalhes: Record<string, Detalhe> = copiar(opcoes.detalhes || {})
  type It = { id: string; t: string; data: DataISO; minutos: number; detalhe: Detalhe; seq: number }
  const fila: It[] = []
  const ordem = new Map((c.ordem || []).map((i, k) => [i, k]))
  const contadores: Record<string, number> = {}
  for (const id of new Set([...Object.keys(fonte), ...c.usados, ...Object.keys(detalhes)])) if (id.startsWith('pp:')) {
    const [, i, k] = id.split(':'); contadores[i] = Math.max(contadores[i] || 0, +k || 0)
  }
  const lpDe = (id: string) => c.lpMap.get(id)
  const disciplinaMeta = (id: string) => (tipoEstudo(id) === 'lp' ? lpDe(id)?.disc : c.AS[indiceAula(id)]?.[0])
  const leiMeta = (id: string) => chaveLei(lpDe(id)) || (lpDe(id)?.disc + '|meta:' + id)
  let sequencia = 0
  for (const [id, [data, h]] of Object.entries(fonte)) {
    const t = tipoEstudo(id), minutos = Math.round(h * 60)
    if (c.feitas.has(id) || data < desde) { plano[id] = [data, h]; continue }
    const disc = disciplinaMeta(id), meta = t === 'pp' ? 'pf' : t === 'rf' ? 'fl' : t === 'rq' ? 'qu' : t
    if (!cfg.discs.includes(disc as string) || !(cfg.metas as Record<string, boolean | undefined>)[meta]) continue
    if (minutos <= 0) continue
    const detalhe = ehPdf(t) ? detalhesPdf(id, fonte, detalhes, c.AS) : { ...(detalhes[id] || {}) }
    fila.push({ id, t, data, minutos, detalhe, seq: sequencia++ })
  }
  const capacidade = (d: DataISO) => Math.round(horasDia(cfg, d) * 60)
  // Índices incrementais do plano (mesmo resultado das varreduras do modelo; cada id entra uma única vez).
  const ocupadoDia: Record<string, number> = {}, idsDoDia = new Map<DataISO, string[]>()
  const primeiroPdf = new Map<number, DataISO>(), restos = new Set<number>()
  const indexarMeta = (id: string) => {
    const [d, h] = plano[id]
    ocupadoDia[d] = (ocupadoDia[d] || 0) + Math.round(h * 60)
    const l = idsDoDia.get(d); if (l) l.push(id); else idsDoDia.set(d, [id])
    if (ehPdf(tipoEstudo(id))) {
      const i = indiceAula(id), p = primeiroPdf.get(i)
      if (p == null || d < p) primeiroPdf.set(i, d)
      if (detalhes[id]?.continuacao || (cfg.paginasLidas?.[i] || 0) > 0 || (cfg.partesLidas?.[i] || 0) > 0) restos.add(i)
    }
  }
  for (const id of Object.keys(plano)) indexarMeta(id)
  const ocupado = (d: DataISO) => ocupadoDia[d] || 0
  if (ocupado(desde) > capacidade(desde)) throw Error('Esse dia já tem metas concluídas além das horas informadas.')
  const pdfsDia = (d: DataISO) => new Set((idsDoDia.get(d) || []).filter((id) => ehPdf(tipoEstudo(id))).map(indiceAula))
  const lpsDia = (d: DataISO) => (idsDoDia.get(d) || []).filter((k) => k.startsWith('lp:'))
  const novosNoDia = (d: DataISO) => { let n = 0; for (const [i, p] of primeiroPdf) if (p === d && !restos.has(i)) n++; return n }
  const anteriores = Object.entries(plano).filter(([id]) => id.startsWith('lp:')).sort((a, b) => a[1][0].localeCompare(b[1][0]))
  const rodizioDomino25 = criarRodizioLP25(cfg.discs, anteriores.length ? (disciplinaMeta(anteriores[anteriores.length - 1][0]) ?? null) : null, c.params.lpJanelaRodizio)
  const ordemRodizio25 = () => rodizioDomino25.ordenar(fila.filter((x) => x.t === 'lp').map((x) => disciplinaMeta(x.id)))
  const rankRodizio25 = (x: It, d: DataISO, ordemRod: string[]) => {
    const ids = lpsDia(d)
    const ultima = ids[ids.length - 1], disc = disciplinaMeta(x.id)
    if (ultima && disciplinaMeta(ultima) === disc && ids.filter((id) => disciplinaMeta(id) === disc).length === 1 && leiMeta(ultima) === leiMeta(x.id)) return -1
    return ordemRod.indexOf(disc as string)
  }
  const prioridade = (x: It, d: DataISO, pdfsHoje: Set<number>) => {
    if (x.detalhe.continuacao || cfg.remanejadas?.[x.id]) return -1
    if (ehPdf(x.t) && ((x.data > d) || (pdfsHoje.size > 0 && !pdfsHoje.has(indiceAula(x.id))))) return 4
    return ({ fl: 0, rf: 0, pf: 1, pp: 1, qu: 2, rq: 2, lp: 3 } as Record<string, number>)[x.t] ?? 4
  }
  // Índices da fila (equivalentes às buscas `fila.some(...)` do modelo, recalculados a cada colocação).
  const ordAula = (i: number) => ordem.get(i) ?? 1e9
  const lpRank = (id: string) => c.lpPos.get(id) ?? -1
  const liberar = (x: It, d: DataISO, ix: { idsNaFila: Set<string>; pdfs: It[]; lpMinDisc: Map<string, number>; ordemRod: string[]; pdfsHoje: Set<number>; pdfAntes: Set<number>; novosHoje: number; ultimo: DataISO | null; lpsHoje: string[] }) => {
    const adiantar = d === desde && ((opcoes.adiantarLP && x.t === 'lp') || (opcoes.adiantarPDF && ehPdf(x.t)))
    if (x.data > d && !adiantar) return false
    const i = indiceAula(x.id)
    if (ehPdf(x.t)) {
      const resto = x.detalhe.continuacao || (cfg.paginasLidas?.[i] || 0) > 0 || (cfg.partesLidas?.[i] || 0) > 0 || ix.pdfAntes.has(i)
      if (!resto && !ix.pdfsHoje.has(i) && ix.novosHoje >= limitePDF27(cfg, c.params.tetoPdfDia)) return false
      const antes = ix.pdfs.some((y) => y !== x && ((!x.detalhe.continuacao && ordAula(indiceAula(y.id)) < ordAula(i)) || (indiceAula(y.id) === i && (y.data < x.data || (y.data === x.data && y.seq < x.seq)))))
      if (antes) return false
    }
    if (x.t === 'fl' || x.t === 'qu') {
      const pai = 'pf:' + i
      if (ix.idsNaFila.has(pai)) return false
      if (plano[pai]) {
        const ideal = idealRev(cfg, c.params, c.fracos, i, plano[pai][0], x.t === 'fl' ? 'fl' : 'qu')
        if (d < ideal) return false
      }
      if (x.t === 'qu' && ix.idsNaFila.has('fl:' + i)) return false
      if (x.t === 'qu' && plano['fl:' + i] && d < plano['fl:' + i][0]) return false
    }
    if (x.t === 'rq') {
      const rev = x.id.replace(/^rq:/, 'rf:')
      if (ix.idsNaFila.has(rev)) return false
      if (plano[rev] && d < plano[rev][0]) return false
    }
    if (x.t === 'lp') {
      if (!permitirLegproc25(x.id, ix.lpsHoje, lpDe, c.params.legproc)) return false
      const disc = disciplinaMeta(x.id) as string
      if (!x.detalhe.continuacao && !ix.ordemRod.includes(disc)) return false
      const rank = lpRank(x.id), min = ix.lpMinDisc.get(disc)
      if (min != null && min < rank) return false // outra meta da mesma disciplina, anterior no catálogo, ainda na fila
    }
    // Continuidade e tarefas que transbordaram têm preferência no próximo dia de estudo.
    if (d === ix.ultimo && (ehPdf(x.t) || x.t === 'fl' || x.t === 'rf') && !x.detalhe.continuacao && x.data >= d) return false
    return true
  }
  let fim = Math.max(1, semDe(cfg.start, desde))
  for (let k = 0, d = desde; k < 1400 && fila.length; k++, d = dAdd(d, 1)) {
    let livre = capacidade(d) - ocupado(d); if (livre <= 0) continue
    const ultimo = perfilSemana(cfg, semDe(cfg.start, d), c.params.concentracaoAteH).concentrado
    while (livre > 0) {
      const idsNaFila = new Set(fila.map((x) => x.id))
      const pdfs = fila.filter((x) => ehPdf(x.t))
      const lpMinDisc = new Map<string, number>()
      for (const y of fila) if (y.t === 'lp') { const ds = disciplinaMeta(y.id) as string, r = lpRank(y.id); if (!lpMinDisc.has(ds) || r < lpMinDisc.get(ds)!) lpMinDisc.set(ds, r) }
      const ordemRod = ordemRodizio25(), pdfsHoje = pdfsDia(d), lpsHoje = lpsDia(d)
      const pdfAntes = new Set<number>() // aulas com alguma parte de PDFull já posta antes de d
      for (const [i, p] of primeiroPdf) if (p < d) pdfAntes.add(i)
      const ix = { idsNaFila, pdfs, lpMinDisc, ordemRod, pdfsHoje, pdfAntes, novosHoje: novosNoDia(d), ultimo, lpsHoje }
      // lpMinDisc inclui a própria meta: só bloqueia se houver OUTRA com rank menor (equivalente ao modelo).
      const disponiveis = fila.filter((x) => liberar(x, d, ix) && (ehPdf(x.t) || x.minutos <= livre))
        .sort((a, b) => prioridade(a, d, pdfsHoje) - prioridade(b, d, pdfsHoje) || (a.t === 'lp' && b.t === 'lp' ? rankRodizio25(a, d, ordemRod) - rankRodizio25(b, d, ordemRod) : 0) || a.data.localeCompare(b.data) || a.seq - b.seq)
      const x = disponiveis[0]; if (!x) break
      const m = Math.min(x.minutos, livre)
      if (x.t === 'lp') rodizioDomino25.avancar(disciplinaMeta(x.id))
      if (ehPdf(x.t) && m < x.minutos) {
        const i = indiceAula(x.id), id = 'pp:' + i + ':' + (contadores[i] = (contadores[i] || 0) + 1)
        const md: Detalhe = { ...x.detalhe, origem: x.detalhe.origem || x.id, pai: x.detalhe.pai || 'pf:' + i }
        const pags = Math.max(0, (md.paginaFim || 0) - (md.paginaInicio || 1) + 1), lidas = Math.floor(pags * m / x.minutos)
        md.paginaFim = (md.paginaInicio || 1) + lidas - 1
        plano[id] = [d, m / 60]; detalhes[id] = md; indexarMeta(id)
        x.detalhe = { ...x.detalhe, paginaInicio: md.paginaFim + 1 }
        x.minutos -= m; x.data = dAdd(d, 1); x.detalhe.deslocada = true
      } else {
        plano[x.id] = [d, m / 60]; detalhes[x.id] = { ...x.detalhe, deslocada: d !== x.data || x.detalhe.deslocada }; indexarMeta(x.id); fila.splice(fila.indexOf(x), 1)
      }
      livre -= m; fim = Math.max(fim, semDe(cfg.start, d))
    }
  }
  if (fila.length) throw Error('Não há disponibilidade suficiente para redistribuir todas as metas.')
  for (const [d] of Object.values(plano)) fim = Math.max(fim, semDe(cfg.start, d))
  return { plano, detalhes, fim }
}

/** Interrupções no formato da plataforma (sobras/paginasLidas) → metas remanejadas do modelo. */
export function remanejadasEfetivas(cfg: Cfg28, AS: AulaAS[], fixos: Plano, base: DataISO, P: ParamsResolvido): Record<string, Remanejada> {
  const out: Record<string, Remanejada> = { ...(cfg.remanejadas || {}) }
  const desde = proximoEstudo(cfg, base) || base
  for (const [id, m] of Object.entries(cfg.sobras || {})) {
    const t = id.split(':')[0]
    if (out[id] || fixos[id] || !(+m > 0) || (t !== 'fl' && t !== 'qu' && t !== 'lp')) continue
    out[id] = { desde, minutos: Math.max(10, Math.round(+m)), detalhe: { continuacao: true, pai: id, origem: id } }
  }
  for (const [k, lida] of Object.entries(cfg.paginasLidas || {})) {
    const i = +k, id = 'pf:' + i, pags = +(AS[i]?.[3] || 0)
    if (out[id] || fixos[id] || !AS[i] || !(+lida > 0) || !(pags > +lida)) continue
    out[id] = { desde, minutos: minPdf(pags - +lida, cfg.vel, P.velPadrao), detalhe: { continuacao: true, pai: id, origem: id, paginaInicio: +lida + 1, paginaFim: pags, totalPaginas: pags } }
  }
  return out
}

/**
 * Gera o plano (gerarPlano → gerarPlanoCatalogo → gerarPlanoBase [→ calcularDomino] do modelo).
 * AS = aulas; LP = metas de LegProc na ordem do catálogo; fixos = metas que não se movem; ancora = início da
 * redistribuição; ctx.ordem = ordem de distribuição das aulas; ctx.feitas = metas concluídas.
 */
function gerarPlanoNucleo(cfg: Cfg28, AS: AulaAS[], LP: ItemLP[], fixos: Plano, ancora: DataISO | null, ctx: Contexto = {}): ResultadoPlano {
  fixos = fixos || {}
  const P = resolverParams(ctx.params)
  const feitas = new Set(ctx.feitas || [])
  const base = ancora && ancora > cfg.start ? ancora : cfg.start
  const remanejadas = remanejadasEfetivas(cfg, AS, fixos, base, P)
  const c: Cfg28 = { ...cfg, remanejadas }
  const lista = (LP || []).filter((x) => x && x.id)
  const ordemCat = ctx.ordem && ctx.ordem.length ? ctx.ordem.filter((i) => AS[i]) : AS.map((_, i) => i)
  const anteriores0 = indicesAnteriores(c, AS, ordemCat)
  const ctxI: CtxInterno = {
    AS, LP: lista, lpMap: new Map(lista.map((x) => [x.id, x])), lpPos: new Map(lista.map((x, k) => [x.id, k])),
    // matérias em paralelo (cfg.paralelo): reequilibra a fila entre as disciplinas selecionadas (mantém a ordem dentro de cada uma)
    ordem: ordemParalela(ordemCat, AS, new Set(c.discs), anteriores0, typeof c.paralelo === 'number' ? c.paralelo : null), feitas, usados: new Set(ctx.usados || []), params: P,
    // inteligência de desempenho: vazio (e ignorado) enquanto a flag estiver desligada → plano idêntico ao 2.8
    fracos: P.desempenho.ativo ? temasFracos(ctx.notas, P.desempenho.acertoMin) : new Set<number>(),
  }
  // gerarPlanoCatalogo: fila de aulas sem o histórico prévio; metas remanejadas ficam presas na data pedida
  const anteriores = anteriores0
  const ehAnterior = (id: string) => !ehHist(id) && !ehReforco(id) && /^(pf|pp|fl|qu|rf|rq):/.test(id) && anteriores.has(indiceAula(id))
  const presos: Plano = Object.fromEntries(Object.entries(fixos).filter(([id]) => !ehAnterior(id) || feitas.has(id)))
  for (const [id, r] of Object.entries(remanejadas)) {
    if (presos[id] || ehAnterior(id)) continue
    const t = id.split(':')[0], i = indiceAula(id)
    const disc = t === 'lp' ? ctxI.lpMap.get(id)?.disc : AS[i]?.[0]
    const tipo = t === 'pp' ? 'pf' : t === 'rf' ? 'fl' : t === 'rq' ? 'qu' : t
    if (!disc || !c.discs.includes(disc) || !(c.metas as Record<string, boolean | undefined>)[tipo]) continue
    presos[id] = [r.desde < base ? base : r.desde, r.minutos / 60]
  }
  const g = gerarPlanoBase(c, AS, ctxI.ordem.filter((i) => !anteriores.has(i)), lista, presos, ancora, P, ctxI.fracos)
  for (const id of Object.keys(remanejadas)) if (g.plano[id]) g.fim = Math.max(g.fim, semDe(c.start, g.plano[id][0]))
  if (!Object.keys(remanejadas).length) return { ...g, detalhes: copiar(ctx.detalhes || {}) }
  const detalhes = copiar(ctx.detalhes || {})
  for (const [id, r] of Object.entries(remanejadas)) if (g.plano[id] && !feitas.has(id)) {
    detalhes[id] = { ...(detalhes[id] || {}), ...(r.detalhe || {}), continuacao: true, pai: id, geracao: r.geracao || null }
  }
  try { return calcularDomino(g.plano, c, base, { detalhes }, ctxI) }
  catch { return { ...g, detalhes } } // sem disponibilidade p/ o dominó: fica a distribuição base
}

// ── Reservas por semana (fora do núcleo): Jurisprudência semanal (2.19) + diagnóstico do histórico (2.13) ─────────
// O plano é gerado com o tempo reservado JÁ descontado da capacidade dos dias escolhidos (horasPontuais) e as reservas
// são reunidas ao plano no fim (como o dominó da 2.19). Ambas desligadas por padrão: sem elas o plano é idêntico.
export const ehJuris219 = (id: string) => id.startsWith('jp:')
type Reserva = { id: string; valor: [DataISO, number] }

function reservarJuris219(cfg: Cfg28, sem: number, desde: DataISO, fonte: Plano, feitas: Set<string>, minPadrao: number, usados: Record<DataISO, number>): Reserva | null {
  const ini = semInicio(cfg.start, sem), fimSem = dAdd(ini, 6)
  const ids = Object.keys(fonte).filter((id) => ehJuris219(id) && fonte[id][0] >= ini && fonte[id][0] <= fimSem)
  const concluida = ids.find((id) => feitas.has(id))
  if (concluida) return { id: concluida, valor: fonte[concluida] }
  const rems = Object.entries(cfg.remanejadas || {}).filter(([id]) => ehJuris219(id))
  const rem = rems.find(([, r]) => semDe(cfg.start, r.desde) === sem)
  // a meta desta semana foi levada para outra semana: não recria a de origem
  if (!ids.length && !rem && rems.some(([id, r]) => +id.split(':')[1] === sem && semDe(cfg.start, r.desde) !== sem)) return null
  const id = rem?.[0] || ids[0] || 'jp:' + sem
  const minutos = Math.min(minPadrao, Math.max(1, Math.round(rem?.[1].minutos || minPadrao)))
  const ocupada = (d: DataISO) => Object.entries(fonte).filter(([k, v]) => !ehJuris219(k) && feitas.has(k) && v[0] === d).reduce((s, [, v]) => s + v[1] * 60, 0)
  const datas = Array.from({ length: 7 }, (_, k) => dAdd(ini, k)).filter((d) => d >= cfg.start && d >= desde)
  if (!datas.some((d) => horasDia(cfg, d) > 0)) return null // semana sem estudo não recebe a reserva
  const livre = (d: DataISO) => horasDia(cfg, d) * 60 - ocupada(d) - (usados[d] || 0)
  const dias = datas.filter((d) => livre(d) >= minutos)
  let escolhido: DataISO | undefined
  if (rem) {
    if (!dias.includes(rem[1].desde)) throw Error('Não há tempo disponível para a meta de Jurisprudência na data escolhida.')
    escolhido = rem[1].desde
  } else {
    const ordenar = (a: DataISO, b: DataISO) => livre(b) - livre(a) || a.localeCompare(b)
    const preferidos = dias.filter((d) => [4, 5].includes(dDow(d))).sort(ordenar) // sexta e sábado
    escolhido = preferidos[0] || [...dias].sort(ordenar)[0]
    // semana já em andamento (dias anteriores a `desde` ficaram para trás): sem dia que caiba, não trava a reorganização
    if (!escolhido && ini < desde) return null
    if (!escolhido) throw Error('A semana ' + sem + ' precisa de um dia com ' + minutos + ' min disponíveis para Jurisprudência. Ajuste a rotina ou as horas dessa semana.')
  }
  usados[escolhido] = (usados[escolhido] || 0) + minutos
  return { id, valor: [escolhido, minutos / 60] }
}

/** Alvo global semanal de diagnósticos do histórico: 2 metas abaixo de 24h na semana, 3 a partir de 24h. */
export function metaSemanalHistorico(cfg: Cfg28, sem: number): number {
  const ini = semInicio(cfg.start, sem)
  return Array.from({ length: 7 }, (_, k) => horasDia(cfg, dAdd(ini, k)) * 60).reduce((a, b) => a + b, 0) >= 24 * 60 ? 3 : 2
}

function reservarDiagnostico(cfg: Cfg28, sem: number, desde: DataISO, fonte: Plano, feitas: Set<string>, fila: number[], usados: Record<DataISO, number>): Reserva[] {
  const out: Reserva[] = []
  if (ehRev(cfg, sem)) return out // semana de revisão não recebe diagnóstico
  const ini = semInicio(cfg.start, sem)
  const datas = Array.from({ length: 7 }, (_, k) => dAdd(ini, k)).filter((d) => d >= cfg.start && d >= desde)
  const existentes = Object.keys(fonte).filter((id) => ehHist(id) && feitas.has(id) && semDe(cfg.start, fonte[id][0]) === sem).length
  const ocupada = (d: DataISO) => Object.entries(fonte).filter(([k, v]) => !ehJuris219(k) && feitas.has(k) && v[0] === d).reduce((s, [, v]) => s + v[1] * 60, 0)
  const livre = (d: DataISO) => horasDia(cfg, d) * 60 - ocupada(d) - (usados[d] || 0)
  const concentrado = perfilSemana(cfg, sem).concentrado
  for (let n = existentes; n < metaSemanalHistorico(cfg, sem) && fila.length; n++) {
    // não tira o tempo do PDFull da semana: precisa sobrar ao menos 30 min além do diagnóstico
    if (datas.reduce((t, d) => t + Math.max(0, livre(d)), 0) < 30 + (cfg.metas.pf ? 30 : 0)) break
    const d = datas.filter((x) => livre(x) >= 30)
      .sort((a, b) => (+(b === concentrado)) - (+(a === concentrado)) || horasDia(cfg, b) - horasDia(cfg, a) || a.localeCompare(b))[0]
    if (!d) break
    const i = fila.shift() as number
    usados[d] = (usados[d] || 0) + 30
    out.push({ id: `qu:${i}:hist:${sem}`, valor: [d, 0.5] })
  }
  return out
}

/**
 * Reforço pelo RESULTADO do diagnóstico (2.13 §7.4), derivado das anotações (res/err) a cada geração — sem estado extra:
 * <50% → PDFull da aula inteira · 50% até <70% → PDFlash · ≥70% nada. Começa na PRÓXIMA semana civil da conclusão
 * e entra como meta remanejada (continuidade primeiro no dia; o dominó divide o PDFull em partes se não couber).
 */
function reforcosDerivados(cfg: Cfg28, AS: AulaAS[], fixos: Plano, feitas: Set<string>, notas: Record<string, NotaTema> | null | undefined, base: DataISO, P: ParamsResolvido): Record<string, Remanejada> {
  const out: Record<string, Remanejada> = {}
  for (const id of feitas) {
    if (!ehHist(id) || !fixos[id]) continue
    const n = notas?.[id], total = +(n?.res || 0), erros = +(n?.err || 0)
    if (!n || !Number.isInteger(total) || !Number.isInteger(erros) || total <= 0 || erros < 0 || erros > total) continue
    const nivel = classificarResultado218((total - erros) / total * 100) // percentual exato
    if (nivel === 'ok') continue
    const i = indiceAula(id), disc = AS[i]?.[0]
    if (!disc) continue
    const tipo: 'pf' | 'fl' = nivel === 'pf' || P.semFlash.has(disc) ? 'pf' : 'fl'
    const rid = `${tipo}:${i}:reforco:${id.split(':')[3]}`
    if (feitas.has(rid) || fixos[rid] && feitas.has(rid)) continue
    const proxima = dAdd(dMon(fixos[id][0]), 7) // próxima semana civil da conclusão
    const desde = proxima < base ? base : proxima
    const pags = +(AS[i]?.[3] || 60)
    out[rid] = tipo === 'pf'
      ? { desde, minutos: minPdf(pags, cfg.vel, P.velPadrao), detalhe: { continuacao: true, pai: rid, origem: id, reforco: true, paginaInicio: 1, paginaFim: pags, totalPaginas: pags } }
      : { desde, minutos: P.dur.fl, detalhe: { continuacao: true, pai: rid, origem: id, reforco: true } }
  }
  return out
}

export function gerarPlano(cfg: Cfg28, AS: AulaAS[], LP: ItemLP[], fixos: Plano, ancora: DataISO | null, ctx: Contexto = {}): ResultadoPlano {
  const P = resolverParams(ctx.params)
  const anteriores = indicesAnteriores(cfg, AS, ctx.ordem)
  const hist = P.historico.ativo && anteriores.size > 0
  if (!P.juris.ativo && !hist) return gerarPlanoNucleo(cfg, AS, LP, fixos, ancora, ctx) // regras desligadas = plano idêntico
  fixos = fixos || {}
  const feitas = new Set(ctx.feitas || [])
  const base = ancora && ancora > cfg.start ? ancora : cfg.start
  const normal: Plano = {}, passadas: Plano = {}
  for (const [id, v] of Object.entries(fixos)) {
    if (ehJuris219(id)) { if (P.juris.ativo && (v[0] < base || feitas.has(id))) passadas[id] = v; continue }
    if (ehHist(id) && !feitas.has(id)) continue // diagnóstico ainda não feito: volta para a fila e é replanejado
    normal[id] = v
  }
  const remanejadas: Record<string, Remanejada> = Object.fromEntries(Object.entries(cfg.remanejadas || {}).filter(([id]) => !ehJuris219(id)))
  if (hist) for (const [id, r] of Object.entries(reforcosDerivados(cfg, AS, fixos, feitas, ctx.notas, base, P))) if (!remanejadas[id] && !normal[id]) remanejadas[id] = r
  const cfgN: Cfg28 = { ...cfg, remanejadas }
  const temasFeitos = new Set([...feitas].filter(ehHist).map(indiceAula))
  const ordemAulas = ctx.ordem && ctx.ordem.length ? ctx.ordem : AS.map((_, i) => i)
  const filaBase = hist ? ordemAulas.filter((i) => AS[i] && anteriores.has(i) && cfg.discs.includes(AS[i][0]) && !temasFeitos.has(i)) : []
  const semIni = Math.max(1, semDe(cfg.start, base))
  let limite = Math.max(semDe(cfg.start, base), gerarPlanoNucleo(cfgN, AS, LP, normal, ancora, ctx).fim)
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    const reservas: Plano = { ...passadas }, usados: Record<DataISO, number> = {}, fila = [...filaBase]
    const detReservas: Record<string, Detalhe> = {}
    // semanas até o fim do plano E, se ainda houver diagnósticos na fila, as semanas seguintes (a fila não some)
    for (let sem = semIni; sem <= limite || (fila.length && sem <= semIni + 520); sem++) {
      if (P.juris.ativo) {
        const r = reservarJuris219(cfg, sem, base, fixos, feitas, P.juris.min, usados)
        if (r) { reservas[r.id] = r.valor; detReservas[r.id] = { jurisprudencia: true } }
      }
      if (fila.length) for (const r of reservarDiagnostico(cfg, sem, base, fixos, feitas, fila, usados)) { reservas[r.id] = r.valor; detReservas[r.id] = { historico: true } }
    }
    const reduzida: Cfg28 = { ...cfgN, horasPontuais: { ...(cfgN.horasPontuais || {}) } }
    for (const [d, m] of Object.entries(usados)) if (d >= base) reduzida.horasPontuais![d] = Math.max(0, horasDia(cfg, d) - m / 60)
    const g = gerarPlanoNucleo(reduzida, AS, LP, normal, ancora, ctx)
    if (g.fim > limite) { limite = g.fim; continue } // o plano avançou: reserva também as novas semanas
    const detalhes = g.detalhes || {}
    for (const [id, d] of Object.entries(detReservas)) detalhes[id] = { ...(detalhes[id] || {}), ...d }
    return { plano: { ...g.plano, ...reservas }, detalhes, fim: Math.max(g.fim, ...Object.values(reservas).map((v) => semDe(cfg.start, v[0]))) }
  }
  throw Error('Não foi possível encaixar as metas extras (Jurisprudência/diagnóstico) e as demais. Ajuste a disponibilidade.')
}

/** Saúde do plano: atraso das revisões e questões em relação ao ideal (7 e 14 dias). */
export function saudePlano(plano: Plano, cfg: Cfg28) {
  const out: Record<string, { n: number; atraso: number; max: number; media?: number }> = { fl: { n: 0, atraso: 0, max: 0 }, qu: { n: 0, atraso: 0, max: 0 } }
  for (const [id, [d]] of Object.entries(plano)) {
    const [t, i] = id.split(':')
    if (t !== 'fl' && t !== 'qu') continue
    const pf = plano['pf:' + i]; if (!pf) continue
    const ideal = proxSemConteudo(cfg, pf[0], t === 'fl' ? 1 : 2)
    if (recessoEm(cfg, ideal)) continue
    const atraso = Math.max(0, Math.round((+dParse(d) - +dParse(ideal)) / 864e5))
    out[t].n++; out[t].atraso += atraso; out[t].max = Math.max(out[t].max, atraso)
  }
  for (const k of Object.keys(out)) out[k].media = out[k].n ? out[k].atraso / out[k].n : 0
  return out
}
