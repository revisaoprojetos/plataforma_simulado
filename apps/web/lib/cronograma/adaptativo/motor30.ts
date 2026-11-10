// ============================================================
// Motor do Cronograma Adaptativo — geração DIA A DIA (faixas de horas, rodízio por vagas, semana especial
// dentro do plano, Jurisprudência semanal obrigatória, dominó). PORTE FIEL do modelo enviado pelo usuário
// (modelo HTML de referência): gerarPlano → gerarPlanoCatalogo → gerarPlanoBase(v2), rotina300,
// semanaRevisao216, reservarJuris219, calcularDomino → calcularDomino219Base, construirRodizioPDF.
//
// · Módulo PURO (sem DOM/fetch): roda igual no servidor e no iframe (bundle em public/.../motor28.js → window.Motor28).
// · O modelo usa o estado global `S`; aqui o que ele lê vem em `Contexto30` (feitas, prog, notas, detalhes, hoje…).
// · O motor 2.8.1 (./motor28.ts) permanece SÓ como legado: planos já gravados não são regenerados; o motor antigo
//   só é usado para migrações de planos antigos (cfg.motor !== VERSAO_MOTOR). Plano novo/recalculado usa este.
// · Identificador de motor é técnico/interno (cfg.motor) — nunca exibir ao usuário.
// ============================================================
import * as L from './motor28'
import type { AulaAS, Cfg28, Contexto, Detalhe, ItemLP, NotaTema, ParamsResolvido, Plano, Remanejada, DataISO } from './motor28'

export * from './motor28'
export const VERSAO_MOTOR = '3.0.0'
export const MAX_SEM = 600
/** semanas especiais aceitas em planos NOVOS; 10/12 só são preservadas quando já existiam (legado). */
export const REV_OPCOES_NOVAS = [4, 6, 8]
export const REV_PADRAO = 8
export const ESSENCIAIS = ['Direito Administrativo', 'Direito Constitucional', 'Direito Civil', 'Direito Financeiro', 'Processo Civil', 'Direito Tributário', 'Direito Ambiental', 'Direito do Trabalho', 'Processo do Trabalho']
export const COMPLEMENTARES = ['Direito Agrário', 'Direito do Consumidor', 'Direito Econômico', 'Direito Empresarial', 'Direito Penal', 'Processo Penal', 'Legislação Penal Especial', 'Direito Previdenciário', 'Direito Previdenciário Público', 'Direito Urbanístico']
export const AGU = [['Direito Eleitoral'], ['Direito Internacional', 'Direito Internacional Privado'], ['Legislação de Ensino'], ['Legislação da AGU']]

const { dAdd, dDow, dMon, semDe, semInicio, horasEm, horasDia, minPdf, chaveLei, criarRodizioLP25 } = L

/** Insuficiência de horizonte: o plano não cabe em MAX_SEM semanas. Nada é gravado (sem plano truncado). */
export class ErroInsuficiencia extends Error {
  codigo = 'insuficiencia' as const
  constructor(msg: string) { super(msg); this.name = 'ErroInsuficiencia' }
}

export interface Prog30 { s?: string; em?: string; t?: number; parou?: { v?: unknown } | null }
export interface Contexto30 extends Contexto {
  /** progresso por meta (estado, data de conclusão `em`, tempo `t`, ponto de parada). */
  prog?: Record<string, Prog30>
  /** "hoje" (YYYY-MM-DD) — usado em limites do dia corrente, semana especial em curso e reforço. */
  hoje?: DataISO
  /** aluno aceitou gerar o cronograma complementar de LegProc (leis ainda não iniciadas). */
  complementarLegproc?: boolean
  /** plano gravado (S.plano): usado só como data de fallback de resultados de questões. */
  planoAtual?: Plano
}

// ── tipos/ids ───────────────────────────────────────────────────────────────────────────────────────
// funções puras de id: memoizadas (são chamadas milhões de vezes no dominó) — resultado idêntico ao cálculo direto
const memoId = <T>(f: (id: string) => T) => { const c = new Map<string, T>(); return (id: string): T => { let v = c.get(id); if (v === undefined) { if (c.size > 60000) c.clear(); v = f(id); c.set(id, v) } return v } }
const tipoEstudo = memoId((id: string) => id.split(':')[0])
const ehPdf = (t: string) => t === 'pf' || t === 'pp'
const indiceAula = memoId((id: string) => { const p = id.split(':'); return +p[/^r[fq]$/.test(p[0]) ? 2 : 1] })
const familiaMeta = memoId((id: string) => { const t = tipoEstudo(id); return ehPdf(t) ? 'pf' : t === 'rf' ? 'fl' : t === 'rq' ? 'qu' : t })
export const questoesHistorico = (id: string) => /^qu:\d+:hist:\d+$/.test(id)
/** reforço do diagnóstico OU releitura/PDFlash adaptativos da semana especial (pf|fl:i:revisao:s) — nunca "PDFull/PDFlash regular". */
export const reforcoHistorico = (id: string) => /^(pf|fl):\d+:(?:reforco|revisao):\d+$/.test(id)
export const revisaoAdaptativa = (id: string) => /^(pf|fl):\d+:revisao:\d+$/.test(id)
export const ehJuris219 = (id: string) => id.startsWith('jp:')
export const metaRevisao217 = (id: string, det: Record<string, Detalhe> = {}) => /^r[fq]:/.test(id) || revisaoAdaptativa(id) || !!det[id]?.semanaRevisao
/** PDFull regular de uma aula (pf:i) — exclui pf:i:reforco:s e pf:i:revisao:s. */
export const pdfRegular = (id: string) => /^pf:\d+$/.test(id)
const pfBase = (id: string) => /^p[fp]:\d+(:\d+)?$/.test(id)
const copiar = <T>(x: T): T => JSON.parse(JSON.stringify(x ?? {}))

/** `cada` da semana especial: 4/6/8; 10/12 só se já estavam no plano (legado); senão 8. */
export function normalizarCada(cada: unknown, legado = true): number {
  const n = Number(cada)
  if (REV_OPCOES_NOVAS.includes(n)) return n
  if (legado && (n === 10 || n === 12)) return n
  return REV_PADRAO
}

// ── validação de horas (rotina) ─────────────────────────────────────────────────────────────────────
export function validarHoras300(horas: number[]): string {
  if (horas.some((h) => h > 0 && (h < 2 || !Number.isInteger(h * 2)))) return 'Selecione pelo menos 2h em cada dia de estudo, em intervalos de 30min.'
  return horas.reduce((t, h) => t + h, 0) < 10 ? 'Selecione pelo menos 10h de estudo por semana.' : ''
}

export interface Rotina300 { faixa: 1 | 2 | 3; pdf: Set<DataISO>; revisao: Set<DataISO>; fimDeSemana: Set<DataISO>; ativos: DataISO[] }
/** Faixas de horas (10h–14h30 / 15h–24h / >24h) e dias de leitura/revisão da semana. */
export function rotina300(cfg: Cfg28, sem: number, ancora: DataISO = cfg.start): Rotina300 {
  const inicio = semInicio(cfg.start, sem)
  const datas = Array.from({ length: 7 }, (_, k) => dAdd(inicio, k))
  const horas = datas.reduce((t, d) => t + (+(horasEm(cfg, d)[dDow(d)] || 0)), 0)
  const faixa = (horas < 15 ? 1 : horas <= 24 ? 2 : 3) as 1 | 2 | 3
  const ativos = datas.filter((d) => d >= ancora && d >= cfg.start && horasDia(cfg, d) > 0)
  const uteis = ativos.filter((d) => dDow(d) < 5)
  const weekend = ativos.filter((d) => dDow(d) >= 5)
  const soma = (dias: DataISO[]) => dias.reduce((t, d) => t + horasDia(cfg, d), 0)
  const maior = Math.max(0, ...weekend.map((d) => horasDia(cfg, d)))
  const mediaUtil = uteis.length ? soma(uteis) / uteis.length : 0
  const concentrado = weekend.length > 0 && soma(weekend) >= 0.4 * soma(ativos) && maior >= mediaUtil + 2
  const fimDeSemana = new Set<DataISO>(concentrado ? weekend.filter((d) => horasDia(cfg, d) >= mediaUtil + 2) : [])
  const pdf = new Set<DataISO>(ativos.filter((d) => dDow(d) < 4 || fimDeSemana.has(d)))
  const revisao = new Set<DataISO>(ativos.filter((d) => [4, 5].includes(dDow(d))))
  if (!revisao.size && ativos.length) revisao.add(ativos[ativos.length - 1])
  if (!pdf.size) {
    const candidatos = ativos.filter((d) => !revisao.has(d))
    for (const d of candidatos.length ? candidatos : ativos) pdf.add(d)
  }
  return { faixa, pdf, revisao, fimDeSemana, ativos }
}

// ── ambiente (o "S" do modelo) ──────────────────────────────────────────────────────────────────────
export interface Env {
  AS: AulaAS[]; LP: ItemLP[]; lpMap: Map<string, ItemLP>; lpPos: Map<string, number>; ordem: number[]
  feitas: Set<string>; prog: Record<string, Prog30>; notas: Record<string, NotaTema>
  det: Record<string, Detalhe>; planoAtual: Plano; hoje: DataISO; complementar: boolean; P: ParamsResolvido
}
const feito = (E: Env, id: string) => E.feitas.has(id) || E.prog[id]?.s === 'done'
const hojeLocal = (): DataISO => L.dISO(new Date())

function criarEnv(AS: AulaAS[], LP: ItemLP[], ctx: Contexto30, P: ParamsResolvido): Env {
  const lista = (LP || []).filter((x) => x && x.id)
  return {
    AS, LP: lista, lpMap: new Map(lista.map((x) => [x.id, x])), lpPos: new Map(lista.map((x, k) => [x.id, k])),
    ordem: ctx.ordem && ctx.ordem.length ? ctx.ordem.filter((i) => AS[i]) : AS.map((_, i) => i),
    feitas: new Set(ctx.feitas || []), prog: ctx.prog || {}, notas: (ctx.notas || {}) as Record<string, NotaTema>,
    det: ctx.detalhes || {}, planoAtual: ctx.planoAtual || {}, hoje: ctx.hoje || hojeLocal(), complementar: !!ctx.complementarLegproc, P,
  }
}

function indicesAnteriores(E: Env, cfg: Cfg28): Set<number> { return L.indicesAnteriores(cfg, E.AS, E.ordem) }
export function ehMetaAnterior(E: Env, id: string, cfg: Cfg28): boolean {
  if (metaRevisao217(id, E.det)) return false
  if (questoesHistorico(id) || reforcoHistorico(id)) return false
  if (!/^(pf|pp|fl|qu):/.test(id)) return false
  return indicesAnteriores(E, cfg).has(indiceAula(id))
}

// ── helpers de PDF ──────────────────────────────────────────────────────────────────────────────────
function paginasFeitas216(E: Env, i: number, cfg: Cfg28, fixos: Plano): number {
  let p = Math.max(0, Number(cfg.paginasLidas?.[i]) || 0)
  for (const [id, r] of Object.entries(E.prog)) {
    if (ehPdf(tipoEstudo(id)) && indiceAula(id) === i && !reforcoHistorico(E.det[id]?.pai || id) && r.parou?.v !== '' && Number.isInteger(Number(r.parou?.v)) && r.parou?.v != null) p = Math.max(p, Number(r.parou.v))
  }
  for (const [id] of Object.entries(fixos)) {
    if (id.startsWith('pp:' + i + ':')) {
      const md = E.det[id] || detalhesPdf(E, id, E.planoAtual, E.det)
      p = Math.max(p, md.paginaFim || 0)
    }
  }
  return Math.min(E.AS[i]?.[3] || 60, p)
}
export function detalhesPdf(E: Env, id: string, plano: Plano, detalhes: Record<string, Detalhe>): Detalhe {
  if (detalhes[id]?.paginaInicio != null) return { ...detalhes[id] }
  const i = indiceAula(id), total = E.AS[i]?.[3] || 60
  const blocos = Object.entries(plano).filter(([k]) => pfBase(k) && indiceAula(k) === i)
    .sort((a, b) => a[1][0].localeCompare(b[1][0]) || (Number(tipoEstudo(a[0]) === 'pf') - Number(tipoEstudo(b[0]) === 'pf')) || a[0].localeCompare(b[0], 'en', { numeric: true }))
  const minutos = blocos.reduce((s, [, [, h]]) => s + Math.round(h * 60), 0); let antes = 0
  for (const [k, [, h]] of blocos) {
    const ini = minutos ? Math.floor(total * antes / minutos) + 1 : 1
    antes += Math.round(h * 60)
    if (k === id) return { paginaInicio: ini, paginaFim: minutos ? Math.floor(total * antes / minutos) : total, totalPaginas: total }
  }
  return { paginaInicio: 1, paginaFim: total, totalPaginas: total }
}
/** 2º PDFull no dia só na faixa >24h, no dia corrente e após um PDFull regular CONCLUÍDO hoje. */
function limitePDF27(E: Env, cfg: Cfg28, d: DataISO, plano: Plano): number {
  if (rotina300(cfg, semDe(cfg.start, d)).faixa !== 3 || d !== E.hoje) return 1
  return Object.entries(plano || {}).some(([id, [dia]]) => tipoEstudo(id) === 'pf' && dia === d && E.prog[id]?.s === 'done' && E.prog[id]?.em === d && !ehMetaAnterior(E, id, cfg)) ? 2 : 1
}
/** Aulas cujo PDFull COMEÇA no dia (continuações não contam). */
function novosPDFDia27(plano: Plano, cfg: Cfg28, d: DataISO, detalhes: Record<string, Detalhe> = {}): Set<number> {
  const primeiros = new Map<number, DataISO>(), restos = new Set<number>()
  for (const [id, [dia]] of Object.entries(plano)) {
    if (!/^p[fp]:/.test(id)) continue
    const i = +id.split(':')[1]
    if (!primeiros.has(i) || dia < primeiros.get(i)!) primeiros.set(i, dia)
    if (detalhes[id]?.continuacao || (cfg.paginasLidas?.[i] || 0) > 0 || (cfg.partesLidas?.[i] || 0) > 0) restos.add(i)
  }
  return new Set([...primeiros].filter(([i, dia]) => dia === d && !restos.has(i)).map(([i]) => i))
}

// ── rodízio de PDFull por vagas ─────────────────────────────────────────────────────────────────────
export function construirRodizioPDF(E: Env, cfg: Cfg28, fixos: Plano) {
  const escolhidas = new Set(cfg.discs), anteriores = indicesAnteriores(E, cfg), filas = new Map<string, number[]>(), totais = new Map<string, number>()
  const ordem = [...new Set(E.ordem)]
  for (const i of ordem) {
    const a = E.AS[i]; if (!a || !escolhidas.has(a[0])) continue
    totais.set(a[0], (totais.get(a[0]) || 0) + 1)
    if (!anteriores.has(i) && !fixos['pf:' + i]) { if (!filas.has(a[0])) filas.set(a[0], []); filas.get(a[0])!.push(i) }
  }
  const essenciais = ESSENCIAIS.filter((d) => escolhidas.has(d))
  const espera = [...COMPLEMENTARES, ...AGU.flat()].filter((d) => escolhidas.has(d) && filas.get(d)?.length)
  for (const d of escolhidas) if (!ESSENCIAIS.includes(d) && !espera.includes(d) && filas.get(d)?.length) espera.push(d)
  const vagas: Array<{ disc: string | null; pai: number | null }> = essenciais.length ? essenciais.map((d) => ({ disc: d, pai: null })) : espera.splice(0).map((d) => ({ disc: d, pai: null }))
  const fila: number[] = [], dependencias: Record<number, number> = {}, trocas: Array<{ de: string | null; para: string; apos: number | null }> = [], rodadas: Array<Array<{ i: number; disc: string }>> = [], indicesRodada: Record<number, number> = {}
  const pendentes = (d: string | null) => (d && filas.get(d)?.length) || 0
  const progresso = (d: string | null) => 1 - pendentes(d) / ((d && totais.get(d)) || 1)
  const preencher = (v: { disc: string | null; pai: number | null }) => {
    if (pendentes(v.disc)) return
    const anterior = v.disc, nova = espera.shift()
    v.disc = nova || null
    if (nova) trocas.push({ de: anterior, para: nova, apos: v.pai })
  }
  vagas.forEach(preencher)
  let rodada = 0
  while (vagas.some((v) => v.disc)) {
    rodada++
    const itens: Array<{ i: number; disc: string }> = [], ativas = vagas.filter((v) => v.disc), maximo = Math.max(...ativas.map((v) => progresso(v.disc)))
    // Primeiro, todas as vagas têm uma oportunidade. Só depois entram os bônus.
    const atrasadas = new Set(ativas.filter((v) => maximo - progresso(v.disc) >= 0.15).map((v) => v.disc))
    const pegar = (v: { disc: string | null; pai: number | null }) => {
      const disc = v.disc as string, i = filas.get(disc)?.shift()
      if (i == null) return
      fila.push(i); itens.push({ i, disc }); indicesRodada[i] = rodada
      if (v.pai != null) dependencias[i] = v.pai
    }
    for (const v of ativas) pegar(v)
    for (const v of ativas) if (atrasadas.has(v.disc) && pendentes(v.disc)) pegar(v)
    for (const v of ativas) if (!pendentes(v.disc)) {
      const ultimo = itens.filter((x) => x.disc === v.disc).slice(-1)[0]?.i
      if (ultimo != null) v.pai = ultimo
      preencher(v)
    }
    rodadas.push(itens)
  }
  return { fila, dependencias, trocas, rodadas, indicesRodada }
}

// ── diagnóstico histórico ───────────────────────────────────────────────────────────────────────────
export function metaSemanalHistorico(cfg: Cfg28, sem: number): number {
  const ini = semInicio(cfg.start, sem), minutos = Array.from({ length: 7 }, (_, k) => horasDia(cfg, dAdd(ini, k)) * 60).reduce((a, b) => a + b, 0)
  return minutos >= 24 * 60 ? 3 : 2
}
function criarFilaDiagnostico(E: Env, cfg: Cfg28, fixos: Plano) {
  const anteriores = indicesAnteriores(E, cfg), feitos = new Set(Object.keys(fixos).filter(questoesHistorico).map(indiceAula))
  const fila = E.ordem.filter((i) => anteriores.has(i) && cfg.discs.includes(E.AS[i][0]) && !feitos.has(i))
  return { tem: () => fila.length > 0, proxima: () => fila[0], avancar: () => { fila.shift() } }
}
/** resultado do diagnóstico concluído: ok ≥70%, flash 50–<70%, pdf <50% (total e acertos inteiros válidos). */
function dadosResultadoHistorico(E: Env, id: string): { total: number; acertos: number; pct: number; nivel: 'ok' | 'flash' | 'pdf' } | null {
  const n = E.notas[id]; if (!n) return null
  const res = Number(n.res)
  const cert = n.cert != null && (n.cert as unknown) !== '' ? Number(n.cert) : (n.err != null && n.res != null ? res - Number(n.err) : NaN)
  if (n.res == null || (n.res as unknown) === '' || !Number.isInteger(res) || res <= 0 || !Number.isInteger(cert) || cert < 0 || cert > res) return null
  return { total: res, acertos: cert, pct: cert / res * 100, nivel: cert / res >= 0.7 ? 'ok' : cert / res >= 0.5 ? 'flash' : 'pdf' }
}
/** reforço do diagnóstico: <50% PDFull · 50–<70% PDFlash · ≥70% encerra; a partir da próxima semana civil da conclusão. */
function registrarReforcos216(E: Env, cfg: Cfg28 & Record<string, any>) {
  cfg.reforcosHistorico ||= {}; cfg.remanejadas ||= {}
  const rem = cfg.remanejadas as Record<string, Remanejada>
  for (const id of [...E.feitas, ...Object.keys(E.prog).filter((k) => E.prog[k]?.s === 'done')].filter((v, k, a) => a.indexOf(v) === k).filter(questoesHistorico)) {
    const r = dadosResultadoHistorico(E, id); if (!r) continue
    const i = indiceAula(id); if (!cfg.discs.includes(E.AS[i]?.[0])) continue
    const antigo = cfg.reforcosHistorico[id]
    if (r.nivel === 'ok') { cfg.reforcosHistorico[id] = { nivel: 'ok', pct: r.pct }; if (antigo?.id && !feito(E, antigo.id)) delete rem[antigo.id]; continue }
    // disciplinas sem PDFlash (AGU) reforçam por PDFull (a plataforma não gera flash para elas)
    const t = r.nivel === 'pdf' || E.P.semFlash.has(E.AS[i][0]) ? 'pf' : 'fl', alvo = t + ':' + i + ':reforco:' + id.split(':').slice(-1)[0]
    // Ao retirar o histórico, a leitura regular satisfaz a mesma obrigação de PDFull.
    if (t === 'pf' && !indicesAnteriores(E, cfg).has(i)) { if (antigo?.id) delete rem[antigo.id]; cfg.reforcosHistorico[id] = { nivel: r.nivel, pct: r.pct, id: 'pf:' + i, integrado: true }; continue }
    const feitoEm = E.prog[id]?.em || E.planoAtual[id]?.[0] || E.hoje, inicio = dAdd(dMon(feitoEm), 7), desde = L.proximoEstudo(cfg, inicio)
    const pags = E.AS[i][3] || 60
    const md: Detalhe = { reforco: true, origem: id, pai: alvo, geracao: 'reforco:' + id, ...(t === 'pf' ? { paginaInicio: 1, paginaFim: pags, totalPaginas: pags } : {}) }
    cfg.reforcosHistorico[id] = { nivel: r.nivel, pct: r.pct, id: alvo, desde, pendente: !desde }
    if (desde && !feito(E, alvo)) rem[alvo] = { desde, minutos: t === 'pf' ? minPdf(E.AS[i][3], cfg.vel, E.P.velPadrao) : E.P.dur.fl, detalhe: md, geracao: md.geracao }
  }
}

// ── semana especial (dentro do plano) ───────────────────────────────────────────────────────────────
function alternarDisciplinas300<T>(metas: T[], disciplina: (m: T) => string): T[] {
  const fila = [...metas], alternadas: T[] = []
  let anterior: string | null = null
  while (fila.length) {
    const proxima = fila.findIndex((m) => disciplina(m) !== anterior)
    const [meta] = fila.splice(Math.max(0, proxima), 1)
    alternadas.push(meta); anterior = disciplina(meta)
  }
  return alternadas
}
function acertoTema(E: Env, i: number): { res: number; err: number; pct: number } | null {
  let res = 0, err = 0
  for (const [id, n] of Object.entries(E.notas)) {
    if (id === 'qu:' + i || id.startsWith('qu:' + i + ':hist:') || (id.startsWith('rq:') && +id.split(':')[2] === i)) { res += +(n.res || 0); err += +(n.err || 0) }
  }
  return res ? { res, err, pct: Math.max(0, (res - err) / res * 100) } : null
}
function estudadas216(E: Env, cfg: Cfg28, plano: Plano, ate: DataISO, projetar = false): Plano {
  const anteriores = indicesAnteriores(E, cfg), base: Plano = {}
  for (const [id, v] of Object.entries(plano)) if (pdfRegular(id) && v[0] < ate && cfg.discs.includes(E.AS[indiceAula(id)]?.[0]) && (projetar || feito(E, id))) base[id] = v
  for (const i of anteriores) if (cfg.discs.includes(E.AS[i]?.[0])) base['pf:' + i] = [dAdd(cfg.start, -1), 0]
  return base
}
/** ranking dos temas estudados (grau de dificuldade + acerto < 60%; já revisados perdem prioridade). */
function rankingRevisaoBase(E: Env, plano: Plano, ateData: DataISO, jaRevisados: Set<number>) {
  const cand: Array<{ i: number; d: DataISO; grau: number | null; acerto: number | null; prioritario: boolean; pontos: number }> = []
  for (const [id, [d]] of Object.entries(plano)) {
    if (!pdfRegular(id) || d >= ateData) continue
    const i = +id.split(':')[1]
    const grau = (E.notas['pf:' + i]?.grau as number | undefined) ?? null
    const ac = acertoTema(E, i)
    const baixo = !!(ac && ac.pct < 60)
    const prioritario = (grau != null && grau > 0) || baixo
    let pontos = (grau || 0) + (baixo && ac ? 2 + (60 - ac.pct) / 60 * 8 : 0)
    if (jaRevisados.has(i)) pontos -= 4
    cand.push({ i, d, grau, acerto: ac ? ac.pct : null, prioritario, pontos })
  }
  return cand.sort((a, b) => (Number(b.prioritario) - Number(a.prioritario)) || (b.pontos - a.pontos) || (a.d < b.d ? -1 : a.d > b.d ? 1 : a.i - b.i))
}
/** Último resultado válido do tema concluído ANTES de `ate` (segunda da semana especial). <50 pf · 50–70 INCLUSIVE fl · >70 ok. */
export function resultadoTema217(E: Env, i: number, ate: DataISO): { origem: string; total: number; acertos: number; pct: number; tipo: 'pf' | 'fl' | 'ok' } | null {
  const data = (id: string) => E.prog[id]?.em || E.planoAtual[id]?.[0] || ''
  const registros = Object.entries(E.notas).filter(([id, n]) => ['qu', 'rq'].includes(tipoEstudo(id)) && indiceAula(id) === i && feito(E, id) && data(id) < ate && Number(n.res) > 0)
    .sort((a, b) => data(b[0]).localeCompare(data(a[0])) || ((b[1].resultadoAtualizadoEm || 0) - (a[1].resultadoAtualizadoEm || 0)))
  for (const [id, n] of registros) {
    if (n.cert == null && n.err == null) continue
    const total = Number(n.res), acertos = n.cert != null ? Number(n.cert) : total - Number(n.err)
    if (Number.isInteger(total) && Number.isInteger(acertos) && acertos >= 0 && acertos <= total) {
      const pct = 100 * acertos / total
      return { origem: id, total, acertos, pct, tipo: pct < 50 ? 'pf' : pct <= 70 ? 'fl' : 'ok' }
    }
  }
  return null
}

export function semanaRevisao216(E: Env, cfg: Cfg28, plano: Plano, sem: number, projetar = false): { plano: Plano; detalhes: Record<string, Detalhe> } {
  const AS = E.AS, P = E.P, cada = Number(cfg.revisao?.cada) || REV_PADRAO
  const ini = semInicio(cfg.start, sem), base = estudadas216(E, cfg, plano, ini, projetar), ja = new Set<number>()
  const ateResultado = ini
  const estudadas = rankingRevisaoBase(E, base, ini, ja).map((x) => ({ i: x.i, resultado: resultadoTema217(E, x.i, ateResultado) }))
    .filter((x) => cfg.discs.includes(AS[x.i]?.[0]) && x.resultado && x.resultado.tipo !== 'ok') as Array<{ i: number; resultado: NonNullable<ReturnType<typeof resultadoTema217>> }>
  const externas: number[] = []
  const disciplinas = ESSENCIAIS.filter((d) => !cfg.discs.includes(d)), porDisc = disciplinas.map((d) => E.ordem.filter((i) => AS[i] && AS[i][0] === d))
  for (let k = 0; ; k++) { let existe = false; for (const ids of porDisc) if (ids[k] != null) { externas.push(ids[k]); existe = true } if (!existe) break }
  if (externas.length) { const giro = ((Math.floor(sem / cada) - 1) * 3) % externas.length; externas.push(...externas.splice(0, giro)) }
  const minimo = !projetar && ini <= E.hoje && dAdd(ini, 6) >= E.hoje ? E.hoje : cfg.start
  const dias = Array.from({ length: 7 }, (_, k) => dAdd(ini, k)).filter((d) => d >= cfg.start && d >= minimo && horasDia(cfg, d) > 0), livre: Record<string, number> = {}
  for (const d of dias) livre[d] = Math.max(0, horasDia(cfg, d) * 60 - Object.values(plano).filter((v) => v[0] === d).reduce((s, v) => s + v[1] * 60, 0))
  const out: Plano = {}, detalhes: Record<string, Detalhe> = {}, qs: Record<string, number> = Object.fromEntries(dias.map((d) => [d, Object.keys(plano).filter((id) => plano[id][0] === d && familiaMeta(id) === 'qu').length]))
  const anterioresDaSemana = Object.keys(plano).filter((id) => semDe(cfg.start, plano[id][0]) === sem && metaRevisao217(id, E.det))
  const objetivosAnteriores = new Map<string, boolean>()
  let ordem = 0, cursor = dias[0]
  for (const id of anterioresDaSemana) {
    const md = E.det[id]
    // colisão rf:s:i: no legado era o flashcard de um tema JÁ ESTUDADO (disciplina selecionada); aqui é essencial EXTERNA (não selecionada)
    objetivosAnteriores.set(md?.pai || id, md?.essencialNaoSelecionada ?? (id.startsWith('rf:') && !cfg.discs.includes(AS[indiceAula(id)]?.[0])))
    ordem = Math.max(ordem, (md?.ordemAlternancia ?? -1) + 1)
  }
  const contadores: Record<number, number> = {}
  for (const id of [...Object.keys(plano), ...Object.keys(E.prog)]) if (id.startsWith('pp:')) contadores[indiceAula(id)] = Math.max(contadores[indiceAula(id)] || 0, +id.split(':')[2])
  const colocar = (id: string, d: DataISO, m: number, md: Detalhe) => { out[id] = [d, m / 60]; detalhes[id] = { ...md, semanaRevisao: true, semanaOrigemRevisao: sem, ordemAlternancia: ordem++ }; cursor = d; livre[d] -= m; if (familiaMeta(id) === 'qu') qs[d]++ }
  type Item = { i: number; resultado: NonNullable<ReturnType<typeof resultadoTema217>>; tipo: string; id: string; min: number }
  const definir = (x: { i: number; resultado: NonNullable<ReturnType<typeof resultadoTema217>> }): Item => {
    const tipo: string = x.resultado?.tipo || 'rq', id = tipo === 'rq' ? 'rq:' + sem + ':' + x.i : tipo + ':' + x.i + ':revisao:' + sem
    const min = tipo === 'pf' ? minPdf(AS[x.i][3], cfg.vel, P.velPadrao) : tipo === 'fl' ? P.durRevisao.rf : P.durRevisao.rq
    return { ...x, tipo, id, min }
  }
  const colocarEstudada = (x: Item): boolean => {
    if (x.tipo !== 'pf') {
      const d = dias.find((d) => d >= cursor && livre[d] >= x.min && (x.tipo !== 'rq' || !qs[d]))
      if (!d) return false
      colocar(x.id, d, x.min, { essencialNaoSelecionada: false, material: x.tipo === 'rq' ? 'Questões' : 'PDFlash', reforco: x.tipo !== 'rq', pai: x.id, origem: x.resultado?.origem, percentualOrigem: x.resultado?.pct })
      return true
    }
    const melhores = dias.filter((d) => d >= cursor && livre[d] >= 30).sort((a, b) => livre[b] - livre[a] || a.localeCompare(b))
    const blocos: DataISO[] = []
    let soma = 0
    for (const d of melhores.slice(0, 3)) { blocos.push(d); soma += Math.floor(livre[d] / 30) * 30; if (soma >= x.min) break }
    if (soma < x.min) return false
    blocos.sort()
    const total = AS[x.i][3] || 60
    let restante = x.min, pagina = 1
    for (const d of blocos) {
      const m = Math.min(restante, Math.floor(livre[d] / 30) * 30); if (!m) continue
      const final = m === restante, id = final ? x.id : 'pp:' + x.i + ':' + (contadores[x.i] = (contadores[x.i] || 0) + 1), pags = final ? total - pagina + 1 : Math.max(1, Math.floor((total - pagina + 1) * m / restante))
      colocar(id, d, m, { essencialNaoSelecionada: false, material: 'PDFull', reforco: true, pai: x.id, origem: x.resultado.origem, percentualOrigem: x.resultado.pct, paginaInicio: pagina, paginaFim: pagina + pags - 1, totalPaginas: total, continuacao: pagina > 1 })
      pagina += pags; restante -= m
      if (!restante) break
    }
    return true
  }
  const fila = alternarDisciplinas300(estudadas.map(definir).filter((x) => !plano[x.id]), (x) => AS[x.i][0])
  const extras = alternarDisciplinas300(externas.filter((i) => !plano['rf:' + sem + ':' + i]), (i) => AS[i][0])
  if (estudadas.length && externas.length && objetivosAnteriores.size) {
    let saldo = [...objetivosAnteriores.values()].reduce((n, externa) => n + (externa ? 1 : -1), 0)
    while (saldo > 0 && fila.length) { if (!colocarEstudada(fila[0])) return { plano: out, detalhes }; fila.shift(); saldo-- }
    while (saldo < 0 && extras.length) {
      const d = dias.find((d) => d >= cursor && livre[d] >= P.durRevisao.rf)
      if (!d) return { plano: out, detalhes }
      colocar('rf:' + sem + ':' + extras.shift(), d, P.durRevisao.rf, { essencialNaoSelecionada: true, material: 'PDFlash' })
      saldo++
    }
  }
  if (estudadas.length && externas.length && (!fila.length || !extras.length)) return { plano: out, detalhes }
  if (fila.length && extras.length) {
    while (fila.length && extras.length) {
      const foto = { ...livre }, qfoto = { ...qs }, oAntes = { ...out }, mdAntes = { ...detalhes }, nAntes = ordem, cAntes = { ...contadores }, cursorAntes = cursor, i = extras[0], d = dias.find((d) => d >= cursor && livre[d] >= P.durRevisao.rf)
      if (!d) break
      colocar('rf:' + sem + ':' + i, d, P.durRevisao.rf, { essencialNaoSelecionada: true, material: 'PDFlash' })
      if (!colocarEstudada(fila[0])) {
        Object.assign(livre, foto); Object.assign(qs, qfoto)
        for (const k of Object.keys(out)) delete out[k]; Object.assign(out, oAntes)
        for (const k of Object.keys(detalhes)) delete detalhes[k]; Object.assign(detalhes, mdAntes)
        ordem = nAntes; cursor = cursorAntes; Object.assign(contadores, cAntes)
        break
      }
      extras.shift(); fila.shift()
    }
  } else if (fila.length) { for (const x of fila) if (!colocarEstudada(x)) break }
  else for (const i of extras) { const d = dias.find((d) => livre[d] >= P.durRevisao.rf); if (!d) break; colocar('rf:' + sem + ':' + i, d, P.durRevisao.rf, { essencialNaoSelecionada: true, material: 'PDFlash' }) }
  return { plano: out, detalhes }
}

// ── Jurisprudência semanal ──────────────────────────────────────────────────────────────────────────
export function reservarJuris219(E: Env, cfg: Cfg28, sem: number, desde: DataISO, fonte: Plano = {}, opcoes: { movida?: { id: string; dia: DataISO } | null } = {}): { id: string; valor: [DataISO, number]; concluida?: boolean } | null {
  const ini = semInicio(cfg.start, sem), fim = dAdd(ini, 6), ids = Object.keys(fonte).filter((id) => ehJuris219(id) && fonte[id][0] >= ini && fonte[id][0] <= fim)
  const concluida = ids.find((id) => feito(E, id))
  const horasSemana = Array.from({ length: 7 }, (_, k) => dAdd(ini, k)).reduce((s, d) => s + (d >= cfg.start ? horasDia(cfg, d) : 0), 0)
  // Limiar: semana com ≥14h30 de disponibilidade efetiva (recesso e datas pontuais já contam em horasDia).
  if (horasSemana < 14.5 && !concluida) {
    if (opcoes.movida && ehJuris219(opcoes.movida.id) && semDe(cfg.start, opcoes.movida.dia) === sem) throw Error('Jurisprudência exige pelo menos 14h30 de estudo na semana.')
    return null
  }
  const movida = opcoes.movida && ehJuris219(opcoes.movida.id) && semDe(cfg.start, opcoes.movida.dia) === sem ? opcoes.movida : null
  if (concluida) { if (movida && movida.id !== concluida) throw Error('Esta semana já tem uma meta de Jurisprudência concluída. Escolha outra semana.'); return { id: concluida, valor: fonte[concluida], concluida: true } }
  const remanejadas = (cfg.remanejadas || {}) as Record<string, Remanejada>
  const rem = Object.entries(remanejadas).find(([id, r]) => ehJuris219(id) && semDe(cfg.start, r.desde) === sem)
  const origemSaiu = Object.entries(remanejadas).some(([id, r]) => ehJuris219(id) && +id.split(':')[1] === sem && semDe(cfg.start, r.desde) !== sem)
  if (origemSaiu && !ids.length && !movida && !rem) return null
  if (movida && ids.some((id) => id !== movida.id && ((E.prog[id]?.t || 0) > 0 || E.prog[id]?.parou))) throw Error('Já existe uma meta de Jurisprudência iniciada nesta semana. Conclua ou reorganize essa meta antes de trazer outra.')
  const id = movida?.id || rem?.[0] || ids.sort((a, b) => (E.prog[b]?.t || 0) - (E.prog[a]?.t || 0))[0] || 'jp:' + sem
  const minutos = Math.min(E.P.juris.min, Math.max(1, remanejadas[id]?.minutos || E.P.juris.min))
  const ocupada = (d: DataISO) => Object.entries(fonte).filter(([k, v]) => !ehJuris219(k) && feito(E, k) && v[0] === d).reduce((s, [, v]) => s + v[1] * 60, 0)
  const datas = Array.from({ length: 7 }, (_, k) => dAdd(ini, k)).filter((d) => d >= cfg.start && d >= desde)
  if (!datas.some((d) => horasDia(cfg, d) > 0)) return null
  const dias = datas.filter((d) => horasDia(cfg, d) * 60 - ocupada(d) >= minutos)
  const forcar = movida?.dia || rem?.[1].desde
  if (forcar) { if (!dias.includes(forcar)) throw Error('Não há tempo disponível para a meta de Jurisprudência na data escolhida.'); return { id, valor: [forcar, minutos / 60] } }
  const ordenar = (a: DataISO, b: DataISO) => (horasDia(cfg, b) * 60 - ocupada(b)) - (horasDia(cfg, a) * 60 - ocupada(a)) || a.localeCompare(b)
  const preferidos = dias.filter((d) => [4, 5].includes(dDow(d))).sort(ordenar), d = preferidos[0] || dias.sort(ordenar)[0]
  if (!d) throw Error('A semana ' + sem + ' precisa de um dia com 1h disponível para Jurisprudência. Ajuste a rotina ou as horas dessa semana.')
  return { id, valor: [d, minutos / 60] }
}

// ── geração dia a dia ───────────────────────────────────────────────────────────────────────────────
interface Devido { id: string; due: DataISO; t: string; minutos: number }
interface Gerado { plano: Plano; detalhes: Record<string, Detalhe>; fim: number; legprocRestantes: string[] }

function gerarPlanoBase30(E: Env, cfg: Cfg28 & Record<string, any>, fixos: Plano, ancora: DataISO | null): Gerado {
  const AS = E.AS, P = E.P, DUR = P.dur, SEM_FLASH = P.semFlash, MAX = P.maxSemanas
  const A = ancora && ancora > cfg.start ? ancora : cfg.start
  const plano: Plano = {}, detalhes: Record<string, Detalhe> = {}, carga: Record<string, number> = {}, ativas = new Set(cfg.discs)
  const metas = (cfg.metas || {}) as Record<string, boolean | undefined>
  let rotina!: Rotina300, ultimoTipoRevisao: string | null = null
  const livre = (d: DataISO) => Math.max(0, Math.round(horasDia(cfg, d) * 60) - (carga[d] || 0))
  const por = (d: DataISO, id: string, m: number, md?: Detalhe | null) => { plano[id] = [d, m / 60]; carga[d] = (carga[d] || 0) + m; if (md) detalhes[id] = md }
  const especial = (id: string) => /^r[fq]:/.test(id), feita = (id: string) => feito(E, id)
  for (const [id, v] of Object.entries(fixos)) {
    if (!feita(id) && especial(id)) continue
    por(v[0], id, Math.round(v[1] * 60), E.det[id])
  }
  const rodizioPDF = construirRodizioPDF(E, cfg, fixos)
  const fila = rodizioPDF.fila.filter((i) => !plano['pf:' + i])
  const devidos: Devido[] = [], incluidos = new Set(Object.keys(plano))
  const adicionar = (id: string, due: DataISO, t: string, minutos: number) => { if (!incluidos.has(id)) { devidos.push({ id, due, t, minutos }); incluidos.add(id) } }
  const proxSem = (d: DataISO, n: number) => L.proxSemConteudo(cfg, d, n)
  const registrar = (i: number, d: DataISO) => {
    if (metas.fl && !SEM_FLASH.has(AS[i][0])) adicionar('fl:' + i, proxSem(d, P.offsetRevisao), 'fl', DUR.fl)
    if (metas.qu) adicionar('qu:' + i, proxSem(d, P.offsetQuestoes), 'qu', DUR.qu)
  }
  for (const [id, v] of Object.entries(fixos)) if (id.startsWith('pf:') && !reforcoHistorico(id) && ativas.has(AS[indiceAula(id)]?.[0])) registrar(indiceAula(id), v[0])
  if (!metas.pf) for (const i of fila) registrar(i, cfg.start)
  const hist = criarFilaDiagnostico(E, cfg, fixos), histPorSem: Record<number, number> = {}
  const ignorar = new Set<string>(cfg.lpIgnorar || [])
  const lp: ItemLP[] = metas.lp ? E.LP.filter((x) => ativas.has(x.disc) && !plano[x.id] && !ignorar.has(x.id)) : []
  const metasLP = E.lpMap
  const rodizio = criarRodizioLP25(cfg.discs, null, P.lpJanelaRodizio)
  const iniciadas = new Set<string>(Object.keys(fixos).filter((id) => id.startsWith('lp:')).map((id) => chaveLei(metasLP.get(id))))
  let fechou = false, leisFinais: Set<string> = new Set(), qi = 0
  type CursoT = { i: number; total: number; p: number; resta: number; k: number; ultima: DataISO | null; partes?: number }
  let curso = null as CursoT | null
  let fim = Math.max(1, semDe(cfg.start, A)), semRevPreparada = 0, herancas = 0, semAtual216 = 0
  const candidatos = (t: string) => devidos.filter((x) => x.t === t).sort((a, b) => a.due.localeCompare(b.due) || indiceAula(a.id) - indiceAula(b.id))
  const elegivel = (x: Devido, d: DataISO) => {
    if (x.due > d) return false
    if (x.t === 'qu' && !questoesHistorico(x.id) && metas.fl && !SEM_FLASH.has(AS[indiceAula(x.id)][0])) {
      const fl = 'fl:' + indiceAula(x.id); if (!plano[fl] || plano[fl][0] > d) return false
    }
    return true
  }
  const alocar = (x: Devido, d: DataISO) => { por(d, x.id, x.minutos); devidos.splice(devidos.indexOf(x), 1) }
  const minutosLeitura = (i: number) => minPdf(Math.max(1, (AS[i][3] || 60) - paginasFeitas216(E, i, cfg, fixos)), cfg.vel, P.velPadrao)
  const selecionarPDF = (d: DataISO) => {
    if (curso || qi >= fila.length) return
    const rodada = rodizioPDF.indicesRodada[fila[qi]], disciplinas = new Set<string>(), cands: Array<{ k: number; minutos: number }> = []
    for (let k = qi; k < fila.length && rodizioPDF.indicesRodada[fila[k]] === rodada; k++) {
      const i = fila[k], disc = AS[i][0], pai = rodizioPDF.dependencias[i]
      if (disciplinas.has(disc)) continue
      disciplinas.add(disc)
      if (pai == null || plano['pf:' + pai]?.[0] <= d) cands.push({ k, minutos: minutosLeitura(i) })
    }
    const inteiro = cands.filter((x) => x.minutos <= livre(d)).sort((a, b) => b.minutos - a.minutos)[0]
    if (inteiro) { const [i] = fila.splice(inteiro.k, 1); fila.splice(qi, 0, i) }
  }
  const ler = (d: DataISO, m: number): boolean => {
    if (!metas.pf) return false
    const i = curso?.i ?? fila[qi]; if (i == null || m < 30) return false
    const restantesNovos = novosPDFDia27(plano, cfg, d, detalhes)
    const continuacao = paginasFeitas216(E, i, cfg, fixos) > 0 || (!!curso?.ultima && curso.ultima < d)
    if (!continuacao && !restantesNovos.has(i) && restantesNovos.size >= limitePDF27(E, cfg, d, plano)) return false
    const partes = curso?.partes ?? new Set(Object.keys(fixos).filter((id) => id.startsWith('pp:' + i + ':') && feita(id)).map((id) => fixos[id][0])).size
    // Parcelamento: no máximo 3 datas — a partir da 3ª só entra o que fecha a leitura.
    if (partes >= 2 && m < (curso?.resta ?? minutosLeitura(i))) return false
    if (!curso) {
      qi++
      const total = AS[i][3] || 60, p = paginasFeitas216(E, i, cfg, fixos)
      curso = { i, total, p, resta: minPdf(Math.max(1, total - p), cfg.vel, P.velPadrao), k: Math.max(0, ...Object.keys(E.prog).filter((k) => k.startsWith('pp:' + i + ':')).map((k) => +k.split(':')[2])), ultima: null }
    }
    const cs = curso
    m = Math.min(cs.resta, Math.floor(m / 30) * 30); if (m < 30) return false
    const final = m === cs.resta, id = final ? 'pf:' + i : 'pp:' + i + ':' + (++cs.k)
    const lidas = final ? cs.total - cs.p : Math.max(1, Math.min(cs.total - cs.p - 1, Math.floor((cs.total - cs.p) * m / cs.resta)))
    por(d, id, m, { paginaInicio: cs.p + 1, paginaFim: cs.p + lidas, totalPaginas: cs.total, continuacao: !!continuacao, pai: 'pf:' + i })
    cs.p += lidas; cs.resta -= m; cs.ultima = d; cs.partes = partes + 1
    if (final) { registrar(i, d); curso = null }
    return true
  }
  const blocoLP = (d: DataISO, extra = false, limite = 2) => {
    if (!metas.lp) return
    const ids = Object.keys(plano).filter((id) => id.startsWith('lp:') && plano[id][0] === d), chaves = new Set(ids.map((id) => chaveLei(metasLP.get(id))))
    if (ids.length >= 4 || (!extra && ids.length >= 2)) return
    const primeiras = new Map<string, string>(); for (const x of lp) if (!primeiras.has(x.disc)) primeiras.set(x.disc, chaveLei(x))
    const permitidas = lp.filter((x) => primeiras.get(x.disc) === chaveLei(x) && (!fechou || leisFinais.has(chaveLei(x))) && (!extra || !chaves.has(chaveLei(x))))
    const ordem = rodizio.ordenar(permitidas.map((x) => x.disc))
    const primeiro = ordem.map((disc) => permitidas.find((x) => x.disc === disc && (!extra || !chaves.has(chaveLei(x))))).find(Boolean)
    if (!primeiro) return
    const lei = chaveLei(primeiro); let n = ids.filter((id) => chaveLei(metasLP.get(id)) === lei).length
    while (n < limite && livre(d) >= DUR.lp) { const m = lp.find((x) => chaveLei(x) === lei); if (!m) break; por(d, m.id, DUR.lp); iniciadas.add(lei); lp.splice(lp.indexOf(m), 1); n++ }
    rodizio.avancar(primeiro.disc)
  }
  let diaAtual = A
  const temAcademico = () => (metas.pf && (qi < fila.length || curso)) || devidos.length > 0 || hist.tem() || Object.keys(fixos).some((id) => !feita(id) && !id.startsWith('lp:') && !ehJuris219(id) && fixos[id][0] > diaAtual)
  const fechar = () => { fechou = true; leisFinais = new Set(lp.map(chaveLei).filter((lei) => E.complementar || iniciadas.has(lei))) }
  const horizonte = MAX * 7
  for (let k = 0, d = A; k < horizonte; k++, d = dAdd(d, 1)) {
    diaAtual = d
    const sem = semDe(cfg.start, d)
    if (sem !== semAtual216) { semAtual216 = sem; rotina = rotina300(cfg, sem, A); histPorSem[sem] = Object.keys(plano).filter((id) => questoesHistorico(id) && semDe(cfg.start, plano[id][0]) === sem).length }
    if (!temAcademico() && !fechou) fechar()
    if (fechou && !lp.some((x) => leisFinais.has(chaveLei(x)))) break
    if (!Object.keys(plano).some((id) => ehJuris219(id) && semDe(cfg.start, plano[id][0]) === sem)) {
      const reservaJ = reservarJuris219(E, cfg, sem, A, plano)
      if (reservaJ) por(reservaJ.valor[0], reservaJ.id, Math.round(reservaJ.valor[1] * 60), { jurisprudencia: true })
    }
    if (!livre(d)) continue
    const rev = L.ehRev(cfg, sem)
    if (rev && !fechou) {
      if (semRevPreparada !== sem) {
        const g = semanaRevisao216(E, cfg, plano, sem, semInicio(cfg.start, sem) > E.hoje)
        for (const [id, v] of Object.entries(g.plano)) if (v[0] >= A) por(v[0], id, Math.round(v[1] * 60), g.detalhes[id])
        semRevPreparada = sem
      }
      // Mantém pendências regulares na sobra, sem abrir PDFull novo durante a revisão.
    } else if (!fechou && hist.tem() && (histPorSem[sem] || 0) < metaSemanalHistorico(cfg, sem)) {
      const i = hist.proxima(); adicionar('qu:' + i + ':hist:' + sem, d, 'qu', DUR.qu); hist.avancar(); histPorSem[sem]++
    }
    if (rotina.faixa < 3 && !rev) {
      const eDiaPDF = rotina.pdf.has(d)
      const eDiaRevisao = rotina.revisao.has(d)
      const aquecimento = sem <= (metas.qu ? 2 : metas.fl ? 1 : 0)
      const questoes = () => candidatos('qu').filter((x) => elegivel(x, d))
      const revisoes = () => candidatos('fl').filter((x) => elegivel(x, d))
      let fezQuestoes = Object.keys(plano).some((id) => familiaMeta(id) === 'qu' && plano[id][0] === d)
      const distribuirRevisao = () => {
        while (livre(d) >= 30) {
          const fl = revisoes().find((x) => x.minutos <= livre(d))
          const qu = !fezQuestoes && questoes().find((x) => x.minutos <= livre(d))
          const meta = ultimoTipoRevisao === 'fl' ? qu || fl : fl || qu
          if (!meta) break
          alocar(meta, d)
          ultimoTipoRevisao = meta.t
          if (meta.t === 'qu') fezQuestoes = true
        }
      }
      const temLeitura = !fechou && metas.pf && (curso || qi < fila.length)
      if (temLeitura && (eDiaPDF || (aquecimento && eDiaRevisao && !questoes().length && !revisoes().length))) {
        selecionarPDF(d)
        const i = (curso as any)?.i ?? fila[qi]
        const restante = (curso as any)?.resta ?? minPdf(Math.max(1, (AS[i][3] || 60) - paginasFeitas216(E, i, cfg, fixos)), cfg.vel, P.velPadrao)
        const reservarRevisao = eDiaRevisao && !aquecimento && (questoes().length || revisoes().length)
        const podeConcluirNoFimDeSemana = rotina.fimDeSemana.has(d) && restante <= livre(d) && rotina.revisao.size > 1
        const reserva = reservarRevisao && !podeConcluirNoFimDeSemana ? (revisoes().length ? 60 : 30) : 0
        const paraLer = livre(d) - reserva
        const outroDiaCompleto = !curso && [...rotina.pdf].some((data) => data > d && livre(data) >= restante)
        if (!outroDiaCompleto || livre(d) >= restante) ler(d, Math.min(livre(d), Math.max(restante, paraLer)))
      }
      if (eDiaRevisao) distribuirRevisao()
      if (!temAcademico() && !fechou) fechar()
      if (eDiaPDF || aquecimento || fechou) blocoLP(d)
      if (rotina.faixa === 2 && eDiaPDF && !fezQuestoes && livre(d) >= 30) {
        const qu = questoes()[0]
        if (qu) { alocar(qu, d); ultimoTipoRevisao = 'qu' }
      }
      if (carga[d]) fim = Math.max(fim, sem)
      continue
    }
    const idsQu = Object.keys(plano).filter((id) => familiaMeta(id) === 'qu' && plano[id][0] === d), limQu = 1 + herancas
    // O primeiro PDFull tem precedência; protege os compromissos vencidos quando há tempo para ambos.
    if (!fechou && !rev && metas.pf && (curso || qi < fila.length)) {
      selecionarPDF(d)
      const candidato = (curso as any)?.i ?? fila[qi], restante = (curso as any)?.resta ?? minPdf(Math.max(1, (AS[candidato][3] || 60) - paginasFeitas216(E, candidato, cfg, fixos)), cfg.vel, P.velPadrao)
      const inteiroDepois = !curso && rotina.ativos.some((data) => data > d && livre(data) >= restante)
      if (!inteiroDepois || livre(d) >= restante) ler(d, livre(d))
    }
    for (const x of candidatos('fl')) if (elegivel(x, d) && livre(d) >= x.minutos) alocar(x, d)
    let feitasQu = idsQu.length, usouHeranca = 0
    for (const x of candidatos('qu')) if (elegivel(x, d) && feitasQu < limQu && livre(d) >= x.minutos) { alocar(x, d); feitasQu++; if (feitasQu > 1) usouHeranca++ }
    herancas = Math.max(0, herancas - usouHeranca)
    // Só cria herança se havia uma meta elegível e a capacidade realmente impediu o encaixe diário.
    if (feitasQu === 0 && candidatos('qu').some((x) => elegivel(x, d)) && livre(d) < 30) herancas++
    if (!temAcademico() && !fechou) fechar()
    blocoLP(d, false)
    if (!fechou && !rev && rotina.faixa === 3 && livre(d) >= 30) {
      const i = (curso as any)?.i ?? fila[qi], restante = i == null ? Infinity : ((curso as any)?.resta ?? minPdf(Math.max(1, (AS[i][3] || 60) - paginasFeitas216(E, i, cfg, fixos)), cfg.vel, P.velPadrao))
      if (restante <= livre(d)) ler(d, livre(d))
    }
    blocoLP(d, true)
    if (carga[d]) fim = Math.max(fim, sem)
  }
  const residuo = temAcademico() || (fechou && lp.some((x) => leisFinais.has(chaveLei(x))))
  if (residuo) throw new ErroInsuficiencia('O plano ultrapassa ' + MAX + ' semanas com a disponibilidade atual. Nenhuma alteração foi aplicada. Aumente as horas ou reduza as matérias; ainda há metas sem data.')
  return { plano, detalhes, fim, legprocRestantes: lp.map((x) => x.id) }
}

// ── dominó ──────────────────────────────────────────────────────────────────────────────────────────
const reservarLegprocPDF216 = (disponivel: number, reserva: number, restante: number, temLP: boolean) => {
  let lp = temLP && disponivel >= reserva + 90 ? 60 : 0
  if (lp && restante > disponivel - reserva - lp && restante <= disponivel - reserva) lp = Math.max(0, Math.floor((disponivel - reserva - restante) / 30) * 30)
  return lp
}
function continuacaoPDF216(E: Env, cfg: Cfg28, id: string, d: DataISO, plano: Plano, detalhes: Record<string, Detalhe>, pdfPorAula?: Map<number, string[]>): boolean {
  if (!ehPdf(tipoEstudo(id))) return false
  const i = indiceAula(id), md = detalhes[id] || {}, pai = md.pai || (tipoEstudo(id) === 'pp' ? 'pf:' + i : id)
  if (md.continuacao || (md.paginaInicio || 0) > 1) return true
  if (!reforcoHistorico(pai) && ((cfg.paginasLidas?.[i] || 0) > 0 || Number(E.prog[id]?.parou?.v) > 0)) return true
  if (tipoEstudo(id) === 'pp' && +id.split(':')[2] > 1) return true
  return (pdfPorAula ? pdfPorAula.get(i) || [] : Object.keys(plano)).some((k) => k !== id && ehPdf(tipoEstudo(k)) && indiceAula(k) === i && (detalhes[k]?.pai || (tipoEstudo(k) === 'pp' ? 'pf:' + i : k)) === pai && plano[k][0] < d)
}
function unificarPDF216(E: Env, cfg: Cfg28, fonte: Plano, desde: DataISO, opcoes: DominoOpc): Plano {
  const nova = copiar(fonte), detalhes = copiar(opcoes.detalhes || E.det), grupos = new Map<string, string[]>()
  for (const [id, v] of Object.entries(fonte)) if (ehPdf(tipoEstudo(id)) && !feito(E, id) && v[0] >= desde) { const pai = detalhes[id]?.pai || (tipoEstudo(id) === 'pp' ? 'pf:' + indiceAula(id) : id); if (!grupos.has(pai)) grupos.set(pai, []); grupos.get(pai)!.push(id) }
  for (const [pai, ids] of grupos) {
    if (ids.length < 2 || (opcoes.movida && ids.includes(opcoes.movida.id))) continue
    const final = ids.find((id) => tipoEstudo(id) === 'pf'); if (!final) continue
    ids.sort((a, b) => fonte[a][0].localeCompare(fonte[b][0]) || (Number(tipoEstudo(a) === 'pf') - Number(tipoEstudo(b) === 'pf')) || a.localeCompare(b, 'en', { numeric: true }))
    const primeiro = ids[0], md = detalhesPdf(E, primeiro, fonte, detalhes), ultimo = detalhesPdf(E, final, fonte, detalhes), horas = ids.reduce((s, id) => s + fonte[id][1], 0), d = fonte[primeiro][0]
    for (const id of ids) { delete nova[id]; delete detalhes[id] }
    nova[final] = [d, horas]; detalhes[final] = { ...md, pai, paginaFim: ultimo.paginaFim, continuacao: continuacaoPDF216(E, cfg, primeiro, d, fonte, opcoes.detalhes || E.det) }
  }
  opcoes.detalhes = detalhes
  return nova
}
export interface DominoOpc { detalhes?: Record<string, Detalhe>; adiantarLP?: boolean; adiantarPDF?: boolean; movida?: { id: string; dia: DataISO } | null; rotinaOriginal?: Cfg28 }
type FilaD = { id: string; t: string; data: DataISO; minutos: number; detalhe: Detalhe; seq: number }

function calcularDomino219Base(E: Env, fonte0: Plano, cfg: Cfg28 & Record<string, any>, desde: DataISO, opcoes: DominoOpc = {}): { plano: Plano; detalhes: Record<string, Detalhe>; fim: number } {
  const AS = E.AS, P = E.P, MAX = P.maxSemanas
  const fonte = unificarPDF216(E, cfg, fonte0, desde, opcoes)
  const plano: Plano = {}, detalhes: Record<string, Detalhe> = copiar(opcoes.detalhes || E.det), fila: FilaD[] = []
  // índices incrementais do plano em construção (só leitura equivalente a varrer Object.keys/entries(plano)): minutos e ids por dia, PDFs por aula
  const minDia = new Map<DataISO, number>(), idsPorDia = new Map<DataISO, string[]>(), pdfPorAula = new Map<number, string[]>()
  let verPlano = 0
  const colocar = (id: string, v: [DataISO, number]) => {
    const ant = plano[id]
    if (ant) { // reposição de id existente: caminho raro, reconstrói os índices do dia
      plano[id] = v; verPlano++
      const dias = new Set([ant[0], v[0]])
      for (const dia of dias) {
        let soma = 0; const lista: string[] = []
        for (const k of Object.keys(plano)) if (plano[k][0] === dia) { lista.push(k); soma += Math.round(plano[k][1] * 60) }
        minDia.set(dia, soma); idsPorDia.set(dia, lista)
      }
      return
    }
    plano[id] = v; verPlano++
    minDia.set(v[0], (minDia.get(v[0]) || 0) + Math.round(v[1] * 60))
    const l = idsPorDia.get(v[0]); if (l) l.push(id); else idsPorDia.set(v[0], [id])
    if (ehPdf(tipoEstudo(id))) { const i = indiceAula(id), a = pdfPorAula.get(i); if (a) a.push(id); else pdfPorAula.set(i, [id]) }
  }
  const idsDoDia = (d: DataISO): string[] => idsPorDia.get(d) || []
  const memoDia = <T>(f: (d: DataISO) => T) => { const c = new Map<DataISO, T>(); let ver = -1; return (d: DataISO): T => { if (ver !== verPlano) { c.clear(); ver = verPlano } let v = c.get(d); if (v === undefined) { v = f(d); c.set(d, v) } return v } }
  const quAdiados = new Set<string>(); let limiteQuestoes216 = 1
  const fixosRodizio: Plano = Object.fromEntries(Object.entries(fonte).filter(([id]) => feito(E, id)))
  const rodizioPDF = construirRodizioPDF(E, cfg, fixosRodizio)
  const ordem = new Map(rodizioPDF.fila.map((i, k) => [i, k]))
  const contadores: Record<string, number> = {}
  for (const id of new Set([...Object.keys(fonte), ...Object.keys(E.prog), ...Object.keys(detalhes)])) if (id.startsWith('pp:')) { const [, i, k] = id.split(':'); contadores[i] = Math.max(contadores[i] || 0, +k || 0) }
  const disciplinaMeta = (id: string) => tipoEstudo(id) === 'lp' ? E.lpMap.get(id)?.disc : AS[indiceAula(id)]?.[0]
  const leiMeta = (id: string) => { const lp = E.lpMap.get(id); return chaveLei(lp) || (lp?.disc + '|meta:' + id) }
  let sequencia = 0
  for (const [id, [data, h]] of Object.entries(fonte)) {
    const t = tipoEstudo(id), minutos = Math.round(h * 60)
    if (feito(E, id) || data < desde) { colocar(id, [data, h]); continue }
    const disc = disciplinaMeta(id), meta = t === 'pp' ? 'pf' : t === 'rf' ? 'fl' : t === 'rq' ? 'qu' : t
    const esp = metaRevisao217(id, detalhes) && ((disc != null && cfg.discs.includes(disc)) || (disc != null && ESSENCIAIS.includes(disc)))
    if ((!disc || !cfg.discs.includes(disc) || !(cfg.metas as Record<string, boolean | undefined>)[meta]) && !esp && !((questoesHistorico(id) || reforcoHistorico(id)) && disc && cfg.discs.includes(disc))) continue
    if (minutos <= 0) continue
    const detalhe: Detalhe = ehPdf(t) ? detalhesPdf(E, id, fonte, detalhes) : { ...(detalhes[id] || {}) }
    fila.push({ id, t, data, minutos, detalhe, seq: sequencia++ })
  }
  const capacidade = (d: DataISO) => Math.round(horasDia(cfg, d) * 60)
  const ocupado = (d: DataISO) => minDia.get(d) || 0
  if (ocupado(desde) > capacidade(desde)) throw Error('Esse dia já tem ' + (ocupado(desde) / 60) + 'h de metas concluídas. Informe pelo menos esse tempo para preservar o que já foi feito.')
  const pdfsDia = memoDia((d: DataISO) => new Set(idsDoDia(d).filter((id) => ehPdf(tipoEstudo(id))).map(indiceAula)))
  const anteriores = Object.entries(plano).filter(([id]) => id.startsWith('lp:')).sort((a, b) => a[1][0].localeCompare(b[1][0]))
  const rodizioDomino25 = criarRodizioLP25(cfg.discs, anteriores.length ? (disciplinaMeta(anteriores[anteriores.length - 1][0]) ?? null) : null, P.lpJanelaRodizio)
  const ordemRodizio25 = () => rodizioDomino25.ordenar(fila.filter((x) => x.t === 'lp').map((x) => disciplinaMeta(x.id)))
  const rankRodizio25 = (x: FilaD, d: DataISO) => {
    const ids = idsDoDia(d).filter((id) => id.startsWith('lp:'))
    const ultima = ids[ids.length - 1], disc = disciplinaMeta(x.id)
    if (ultima && disciplinaMeta(ultima) === disc && ids.filter((id) => disciplinaMeta(id) === disc).length === 1 && leiMeta(ultima) === leiMeta(x.id)) return -1
    return ordemRodizio25().indexOf(disc as string)
  }
  let inicioMovida: DataISO | null = null, semanaRotina = 0, rotina!: Rotina300, ultimoTipoRevisao: string | null = null
  const temPDF = (d: DataISO) => fila.some((x) => ehPdf(x.t) && !metaRevisao217(x.id, detalhes) && x.data <= d)
  const novosDia = memoDia((d: DataISO) => novosPDFDia27(plano, cfg, d, detalhes).size)
  const limiteDia = memoDia((d: DataISO) => limitePDF27(E, cfg, d, plano))
  const cont = (id: string, d: DataISO) => continuacaoPDF216(E, cfg, id, d, plano, detalhes, pdfPorAula)
  const prioridade = (x: FilaD, d: DataISO): number => {
    if (ehPdf(x.t) && cont(x.id, d)) return -3
    if (opcoes.movida?.id === x.id && opcoes.movida.dia === d) return -2
    if (ehPdf(x.t) && ((x.data > d) || (pdfsDia(d).size > 0 && !pdfsDia(d).has(indiceAula(x.id))))) return 4
    if (x.t === 'lp') { const ids = idsDoDia(d).filter((k) => tipoEstudo(k) === 'lp'), lei = chaveLei(E.lpMap.get(x.id)); return ids.length && (ids.length >= 2 || chaveLei(E.lpMap.get(ids[0])) !== lei) ? 5 : 3 }
    if (rotina.faixa < 3 && !L.ehRev(cfg, semanaRotina)) {
      if (rotina.revisao.has(d) && ['fl', 'qu'].includes(x.t)) return x.t === ultimoTipoRevisao ? 2 : 1
      if (x.t === 'qu' && rotina.pdf.has(d)) return 4
    }
    return ({ pf: 0, pp: 0, fl: 1, rf: 1, qu: 2, rq: 2 } as Record<string, number>)[x.t] ?? 6
  }
  const liberar = (x: FilaD, d: DataISO): boolean => {
    const semana = semDe(cfg.start, d), esp = metaRevisao217(x.id, detalhes)
    if (esp && !L.ehRev(cfg, semana)) return false
    if (esp && opcoes.movida?.id !== x.id && Number.isFinite(x.detalhe.ordemAlternancia)) {
      const origem = x.detalhe.semanaOrigemRevisao || semDe(cfg.start, x.data)
      if (fila.some((y) => y !== x && metaRevisao217(y.id, detalhes) && (y.detalhe.semanaOrigemRevisao || semDe(cfg.start, y.data)) === origem && (y.detalhe.ordemAlternancia as number) < (x.detalhe.ordemAlternancia as number))) return false
    }
    if (rotina.faixa < 3 && !L.ehRev(cfg, semana) && !(opcoes.movida?.id === x.id && opcoes.movida.dia === d)) {
      const aquecimento = semana <= (cfg.metas.qu ? 2 : cfg.metas.fl ? 1 : 0)
      const diaPDF = rotina.pdf.has(d), diaRevisao = rotina.revisao.has(d)
      if (ehPdf(x.t) && !diaPDF && !x.detalhe.continuacao && !(aquecimento && diaRevisao)) return false
      if (x.t === 'fl' && !diaRevisao) return false
      if (x.t === 'qu' && !diaRevisao && !(rotina.faixa === 2 && diaPDF)) return false
      if (x.t === 'lp' && !diaPDF && !aquecimento && temPDF(d)) return false
    }
    if (ehPdf(x.t) && L.ehRev(cfg, semana) && !esp && !x.detalhe.continuacao) return false
    if (ehPdf(x.t) && !esp && !L.ehRev(cfg, semana) && !x.detalhe.continuacao && x.id !== opcoes.movida?.id) {
      const diasMelhores = rotina.faixa === 3 ? rotina.ativos : [...rotina.pdf]
      if (x.minutos > capacidade(d) - ocupado(d) && diasMelhores.some((dia) => dia > d && x.minutos <= capacidade(dia) - ocupado(dia))) return false
    }
    if (ehPdf(x.t) && !cont(x.id, d) && pdfsDia(d).size > 0 && !pdfsDia(d).has(indiceAula(x.id)) && opcoes.movida?.id !== x.id && x.minutos > capacidade(d) - ocupado(d)) return false
    if (x.t === 'qu' || x.t === 'rq') {
      const nQu = idsDoDia(d).filter((k) => familiaMeta(k) === 'qu').length
      if (nQu >= limiteQuestoes216) return false
    }
    const adiantar = d === desde && ((opcoes.adiantarLP && x.t === 'lp') || (opcoes.adiantarPDF && ehPdf(x.t)))
    if (x.data > d && !adiantar) return false
    const i = indiceAula(x.id)
    if (ehPdf(x.t)) {
      const resto = x.detalhe.continuacao || (cfg.paginasLidas?.[i] || 0) > 0 || (cfg.partesLidas?.[i] || 0) > 0 || (pdfPorAula.get(i) || []).some((id) => plano[id][0] < d)
      if (!resto && !pdfsDia(d).has(i) && novosDia(d) >= limiteDia(d)) return false
      const antes = fila.some((y) => y !== x && ehPdf(y.t) && ((!x.detalhe.continuacao && !x.detalhe.reforco && disciplinaMeta(y.id) === disciplinaMeta(x.id) && (ordem.get(indiceAula(y.id)) ?? 1e9) < (ordem.get(i) ?? 1e9)) || (indiceAula(y.id) === i && (y.data < x.data || (y.data === x.data && y.seq < x.seq)))))
      if (antes) return false
      if (!x.detalhe.reforco) {
        const pai = rodizioPDF.dependencias[i]
        if (pai != null && fila.some((y) => ehPdf(y.t) && !y.detalhe.reforco && indiceAula(y.id) === pai)) return false
        if (pai != null && plano['pf:' + pai]?.[0] > d) return false
      }
    }
    if (x.t === 'fl' || x.t === 'qu') {
      const pai = 'pf:' + i
      if (fila.some((y) => y.id === pai)) return false
      if (plano[pai]) { const ideal = L.proxSemConteudo(cfg, plano[pai][0], x.t === 'fl' ? P.offsetRevisao : P.offsetQuestoes); if (d < ideal) return false }
      if (x.t === 'qu' && fila.some((y) => y.id === 'fl:' + i)) return false
      if (x.t === 'qu' && plano['fl:' + i] && d < plano['fl:' + i][0]) return false
    }
    if (x.t === 'rq') {
      const rev = x.id.replace(/^rq:/, 'rf:')
      if (fila.some((y) => y.id === rev)) return false
      if (plano[rev] && d < plano[rev][0]) return false
    }
    if (x.t === 'lp') {
      const ids = idsDoDia(d).filter((k) => k.startsWith('lp:'))
      if (rotina.faixa < 3 && !L.ehRev(cfg, semana) && (ids.length >= 2 || (ids.length && leiMeta(ids[0]) !== leiMeta(x.id)))) return false
      if (!L.permitirLegproc25(x.id, ids, (k) => E.lpMap.get(k))) return false
      if (!x.detalhe.continuacao && !ordemRodizio25().includes(disciplinaMeta(x.id) as string)) return false
      const rank = E.lpPos.get(x.id) ?? -1
      if (fila.some((y) => y !== x && y.t === 'lp' && disciplinaMeta(y.id) === disciplinaMeta(x.id) && (E.lpPos.get(y.id) ?? -1) < rank)) return false
    }
    return true
  }
  let fim = Math.max(1, semDe(cfg.start, desde))
  for (let k = 0, d = desde; k < MAX * 7 && fila.length; k++, d = dAdd(d, 1)) {
    const sem = semDe(cfg.start, d)
    if (sem !== semanaRotina) { semanaRotina = sem; rotina = rotina300(opcoes.rotinaOriginal || cfg, sem, desde) }
    let livre = capacidade(d) - ocupado(d); limiteQuestoes216 = 1 + (rotina.faixa === 3 || L.ehRev(cfg, sem) ? quAdiados.size : 0); if (livre <= 0) continue
    while (livre > 0) {
      const disponiveis = fila.filter((x) => liberar(x, d) && (ehPdf(x.t) || x.minutos <= livre)).sort((a, b) => prioridade(a, d) - prioridade(b, d) || (ehPdf(a.t) && ehPdf(b.t) && !a.detalhe.continuacao && !b.detalhe.continuacao && !a.detalhe.reforco && !b.detalhe.reforco ? (ordem.get(indiceAula(a.id)) ?? 1e9) - (ordem.get(indiceAula(b.id)) ?? 1e9) : 0) || (a.t === 'lp' && b.t === 'lp' ? rankRodizio25(a, d) - rankRodizio25(b, d) : 0) || a.data.localeCompare(b.data) || a.seq - b.seq)
      const x = disponiveis[0]; if (!x) break
      if (opcoes.movida?.id === x.id && !inicioMovida) inicioMovida = d
      let m = Math.min(x.minutos, livre)
      if (ehPdf(x.t)) {
        const outros = fila.filter((y) => y !== x && liberar(y, d) && ['fl', 'rf', 'qu', 'rq'].includes(y.t))
        const rv = outros.find((y) => y.t === 'fl' || y.t === 'rf'), qu = outros.find((y) => y.t === 'qu' || y.t === 'rq')
        let reserva = (rv?.minutos || 0) + (qu?.minutos || 0)
        const temLei = fila.some((y) => y.t === 'lp' && liberar(y, d))
        let lp = reservarLegprocPDF216(livre, reserva, x.minutos, temLei)
        if (rotina.faixa < 3 && !L.ehRev(cfg, sem)) {
          const diaLeitura = rotina.pdf.has(d)
          if (diaLeitura && !rotina.revisao.has(d)) reserva = 0
          lp = rotina.faixa === 1 && temLei && x.minutos > livre - reserva && livre - reserva >= 60 ? 30 : 0
          if (rotina.fimDeSemana.has(d) && rotina.revisao.size > 1 && x.minutos <= livre) reserva = 0
        }
        if (!metaRevisao217(x.id, detalhes)) reserva = 0
        else if (livre - reserva - lp >= 30) reserva += lp
        if (livre - reserva >= 30) m = Math.min(m, Math.floor((livre - reserva) / 30) * 30)
        else m = Math.min(m, Math.floor(livre / 30) * 30)
        const pai = x.detalhe.pai || x.id
        const partes = new Set(Object.keys(plano).filter((id) => ehPdf(tipoEstudo(id)) && (detalhes[id]?.pai || id) === pai).map((id) => plano[id][0]))
        partes.add(d)
        if (partes.size > 3 || (partes.size === 3 && m < x.minutos) || m < 30) break
      }
      if (x.t === 'fl' || x.t === 'qu') ultimoTipoRevisao = x.t
      if ((x.t === 'qu' || x.t === 'rq') && quAdiados.size) quAdiados.delete([...quAdiados][0])
      if (x.t === 'lp') rodizioDomino25.avancar(disciplinaMeta(x.id))
      if (ehPdf(x.t) && m < x.minutos) {
        const i = indiceAula(x.id), id = 'pp:' + i + ':' + (contadores[i] = (contadores[i] || 0) + 1)
        const md: Detalhe = { ...x.detalhe, origem: x.detalhe.origem || x.id, pai: x.detalhe.pai || 'pf:' + i }
        const pags = Math.max(0, (md.paginaFim || 0) - (md.paginaInicio || 1) + 1), lidas = Math.floor(pags * m / x.minutos)
        md.paginaFim = (md.paginaInicio || 1) + lidas - 1
        colocar(id, [d, m / 60]); detalhes[id] = md
        x.detalhe = { ...x.detalhe, paginaInicio: md.paginaFim + 1 }
        x.minutos -= m; x.data = dAdd(d, 1); x.detalhe.deslocada = true
      } else {
        colocar(x.id, [d, m / 60]); detalhes[x.id] = { ...x.detalhe, deslocada: d !== x.data || x.detalhe.deslocada }; fila.splice(fila.indexOf(x), 1)
      }
      livre -= m; fim = Math.max(fim, semDe(cfg.start, d))
    }
    if (capacidade(d) > 0 && !idsDoDia(d).some((id) => familiaMeta(id) === 'qu') && capacidade(d) - ocupado(d) < 30) { const q = fila.find((x) => (x.t === 'qu' || x.t === 'rq') && liberar(x, d)); if (q) quAdiados.add(q.id) }
  }
  if (fila.length) throw Error('Não há disponibilidade suficiente para redistribuir todas as metas. Ajuste a rotina de estudo e tente novamente.')
  for (const [d] of Object.values(plano)) fim = Math.max(fim, semDe(cfg.start, d))
  if (opcoes.movida && inicioMovida !== opcoes.movida.dia) throw Error('A meta não pode começar nesse dia com as horas disponíveis e a ordem de estudo. Escolha outro dia.')
  return { plano, detalhes, fim }
}

function calcularDominoE(E: Env, fonte: Plano, cfg: Cfg28 & Record<string, any>, desde: DataISO, opcoes: DominoOpc = {}) {
  const normal: Plano = Object.fromEntries(Object.entries(fonte).filter(([id]) => !ehJuris219(id)))
  const passadas: Plano = Object.fromEntries(Object.entries(fonte).filter(([id, v]) => ehJuris219(id) && (v[0] < desde || feito(E, id))))
  const ultima = Object.values(fonte).reduce((d, v) => (v[0] > d ? v[0] : d), desde)
  let limite = Math.max(semDe(cfg.start, desde), semDe(cfg.start, ultima))
  const opts: DominoOpc = { ...opcoes, rotinaOriginal: cfg }; if (opts.movida && ehJuris219(opts.movida.id)) delete opts.movida
  for (let tentativa = 0; tentativa < 200; tentativa++) {
    const reduzida: Cfg28 & Record<string, any> = copiar(cfg), reservas: Plano = { ...passadas }; reduzida.horasPontuais = { ...(cfg.horasPontuais || {}) }
    for (let sem = Math.max(1, semDe(cfg.start, desde)); sem <= limite; sem++) {
      const r = reservarJuris219(E, cfg, sem, desde, fonte, opcoes); if (!r) continue
      reservas[r.id] = r.valor
      const [d, h] = r.valor; if (d >= desde) reduzida.horasPontuais![d] = Math.max(0, horasDia(cfg, d) - h)
    }
    const g = calcularDomino219Base(E, normal, reduzida, desde, { ...opts })
    const ultimoNormal = Object.values(g.plano).reduce((d, v) => (v[0] > d ? v[0] : d), desde), fim = semDe(cfg.start, ultimoNormal)
    if (fim > limite) { limite = fim; continue }
    Object.assign(g.plano, reservas); g.detalhes ||= {}
    for (const id of Object.keys(reservas)) g.detalhes[id] = { ...(E.det[id] || {}), jurisprudencia: true }
    g.fim = Math.max(g.fim, ...Object.values(reservas).map((v) => semDe(cfg.start, v[0])))
    return g
  }
  throw Error('Não foi possível encaixar a Jurisprudência semanal e as demais metas. Ajuste a disponibilidade.')
}

// ── API pública ─────────────────────────────────────────────────────────────────────────────────────
export interface ResultadoPlano30 { plano: Plano; fim: number; detalhes: Record<string, Detalhe>; legprocRestantes?: string[]; cfgAtualizada?: Record<string, unknown> }

/**
 * gerarPlano → gerarPlanoCatalogo → gerarPlanoBase (+ dominó quando há metas remanejadas pendentes).
 * Lança ErroInsuficiencia se o plano não couber em MAX_SEM semanas.
 */
export function gerarPlano(cfg0: Cfg28, AS: AulaAS[], LP: ItemLP[], fixos: Plano, ancora: DataISO | null, ctx: Contexto30 = {}): ResultadoPlano30 {
  fixos = fixos || {}
  const P = L.resolverParams({ ...(ctx.params || {}), maxSemanas: Math.min(MAX_SEM, Math.max(20, (ctx.params?.maxSemanas ?? MAX_SEM))) })
  const E = criarEnv(AS, LP, ctx, P)
  const baseData = ancora && ancora > cfg0.start ? ancora : cfg0.start
  const cfg: Cfg28 & Record<string, any> = copiar(cfg0)
  cfg.revisao ||= { ativa: true, cada: REV_PADRAO }
  cfg.revisao.cada = normalizarCada(cfg.revisao.cada, true)
  cfg.remanejadas = { ...L.remanejadasEfetivas(cfg, AS, fixos, baseData, P), ...(cfg.remanejadas || {}) }
  registrarReforcos216(E, cfg)
  // gerarPlanoCatalogo: metas "anteriores" (histórico declarado) saem dos fixos, exceto as concluídas; remanejadas ficam presas
  const presos: Plano = Object.fromEntries(Object.entries(fixos).filter(([id]) => !ehMetaAnterior(E, id, cfg) || feito(E, id)))
  for (const [id, r] of Object.entries(cfg.remanejadas as Record<string, Remanejada>)) {
    if (presos[id] || ehMetaAnterior(E, id, cfg) || (reforcoHistorico(id) && tipoEstudo(id) === 'pf' && !indicesAnteriores(E, cfg).has(indiceAula(id)))) continue
    const t = tipoEstudo(id), i = indiceAula(id)
    const disc = t === 'lp' ? E.lpMap.get(id)?.disc : AS[i]?.[0]
    const tipo = t === 'pp' ? 'pf' : t === 'rf' ? 'fl' : t === 'rq' ? 'qu' : t
    if ((!disc || !cfg.discs.includes(disc) || !(cfg.metas as Record<string, boolean | undefined>)[tipo]) && !((questoesHistorico(id) || reforcoHistorico(id)) && disc && cfg.discs.includes(disc))) continue
    presos[id] = [r.desde < baseData ? baseData : r.desde, r.minutos / 60]
  }
  const g = gerarPlanoBase30(E, cfg, presos, ancora)
  for (const id of Object.keys(cfg.remanejadas)) if (g.plano[id]) g.fim = Math.max(g.fim, semDe(cfg.start, g.plano[id][0]))
  let detalhes: Record<string, Detalhe> = { ...g.detalhes }
  for (const id of Object.keys(fixos)) if (E.det[id]) detalhes[id] = copiar(E.det[id])
  for (const [id, r] of Object.entries(cfg.remanejadas as Record<string, Remanejada>)) if (g.plano[id] && !feito(E, id)) detalhes[id] = { ...(r.detalhe || {}), pai: r.detalhe?.pai || id, geracao: r.geracao || null }
  const cfgAtualizada = { reforcosHistorico: cfg.reforcosHistorico, remanejadas: cfg.remanejadas, revisao: cfg.revisao }
  if (Object.keys(cfg.remanejadas).some((id) => g.plano[id] && !feito(E, id))) {
    const r = calcularDominoE(E, g.plano, cfg, baseData, { detalhes })
    return { plano: r.plano, fim: r.fim, detalhes: r.detalhes, legprocRestantes: g.legprocRestantes, cfgAtualizada }
  }
  return { plano: g.plano, fim: g.fim, detalhes, legprocRestantes: g.legprocRestantes, cfgAtualizada }
}

/** Dominó público: re-fluxa um plano existente a partir de `desde` (não realizada, parcial, organizar atrasadas, ajustar horas, pausa). */
export function calcularDomino(fonte: Plano, cfg0: Cfg28, desde: DataISO, opcoes: DominoOpc, AS: AulaAS[], LP: ItemLP[], ctx: Contexto30 = {}) {
  const P = L.resolverParams({ ...(ctx.params || {}), maxSemanas: MAX_SEM })
  const E = criarEnv(AS, LP, ctx, P)
  const cfg: Cfg28 & Record<string, any> = copiar(cfg0)
  cfg.revisao ||= { ativa: true, cada: REV_PADRAO }; cfg.revisao.cada = normalizarCada(cfg.revisao.cada, true)
  return calcularDominoE(E, fonte, cfg, desde, opcoes)
}

/** Metas de LegProc ainda sem data nas disciplinas selecionadas (oferta de cronograma complementar ao fim da fila). */
export function pendenciasLegproc(cfg: Cfg28, LP: ItemLP[], plano: Plano, feitas: Iterable<string>): string[] {
  if (!cfg.metas.lp) return []
  const f = new Set(feitas), agendadas = new Set(Object.keys(plano).filter((id) => id.startsWith('lp:')))
  return (LP || []).filter((x) => cfg.discs.includes(x.disc) && !agendadas.has(x.id) && !f.has(x.id)).map((x) => x.id)
}

/** Expostos p/ testes/diagnóstico. */
export const _interno = { rankingRevisaoBase, criarEnv, gerarPlanoBase30, calcularDominoE, estudadas216, acertoTema }
