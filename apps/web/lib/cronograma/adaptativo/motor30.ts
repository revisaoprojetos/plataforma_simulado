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
import { REGRAS_PADRAO, resolverRegras, resolverFaixaCarga, resolverFaixa, resolverTetoPdf, type RegrasMotor } from './regras'
import { textoHoras } from './faixas-carga'
import { aplicarFaixaEmRegras, baseDeRegras, classeDaFaixa, criarRegrasVivas, padraoDaFaixa, opcoesDaFaixa, temOverrides, type FaixaCarga } from './faixas-carga'
import { restricaoBloqueia, restricaoQueBloqueia, descreverRestricao } from './restricoes'
import { rotuloMeta, type ColetorRastro } from './rastro'
import { familiaDoTipo } from './tipos-meta'
import { ehIdGx, type ItemGX, type RegraTipoGx } from './gx-tipos'
import type { FamiliaRestricao } from './regras'
import type { AulaAS, Cfg28, Contexto, Detalhe, ItemLP, NotaTema, ParamsResolvido, Plano, Remanejada, DataISO } from './motor28'

export * from './motor28'
export { REGRAS_PADRAO, resolverRegras, normalizarRegras, resolverFaixa, resolverFaixaCarga, resolverTetoPdf, hashRegras } from './regras'
export type { RegrasMotor } from './regras'
export const VERSAO_MOTOR = '3.2.0' // 3.1 = regraRotina300 15 (revisão obrigatória, teto de PDFulls, faixas 24h30) · 3.2 = regraRotina300 23 (ref. rev. 23)
/** Primeira versão do motor com a regra da referência rev. 23 (teto 3 até 14h30, reta final, conclusão na mesma semana em ≤3 datas, 2 PDFulls distintos/dia…). */
export const VERSAO_REGRA23 = '3.2.0'
const partesVersao = (m: unknown): number[] | null => typeof m === 'string' && /^\d+(\.\d+)*$/.test(m) ? m.split('.').map(Number) : null
/** cfg.motor >= min (comparação numérica por partes). Sem carimbo válido → false (plano legado mantém a regra vigente dele). */
export function motorAtingiu(motor: unknown, min: string): boolean {
  const a = partesVersao(motor), b = partesVersao(min)
  if (!a || !b) return false
  for (let k = 0; k < Math.max(a.length, b.length); k++) { const x = a[k] || 0, y = b[k] || 0; if (x !== y) return x > y }
  return true
}
/** A regra da ref. rev. 23 só vale para planos carimbados com cfg.motor >= 3.2.0. */
export const regra23 = (cfg: object | null | undefined): boolean => motorAtingiu((cfg as { motor?: unknown } | null | undefined)?.motor, VERSAO_REGRA23)
export const MAX_SEM = REGRAS_PADRAO.horizonte.maxSemanas
/** semanas especiais aceitas em planos NOVOS; 10/12 só são preservadas quando já existiam (legado). */
export const REV_OPCOES_NOVAS = REGRAS_PADRAO.revisao.opcoesNovas
export const REV_PADRAO = REGRAS_PADRAO.revisao.padrao
export const ESSENCIAIS = ['Direito Administrativo', 'Direito Constitucional', 'Direito Civil', 'Direito Financeiro', 'Processo Civil', 'Direito Tributário', 'Direito Ambiental', 'Direito do Trabalho', 'Processo do Trabalho']
export const COMPLEMENTARES = ['Direito Agrário', 'Direito do Consumidor', 'Direito Econômico', 'Direito Empresarial', 'Direito Penal', 'Processo Penal', 'Legislação Penal Especial', 'Direito Previdenciário', 'Direito Previdenciário Público', 'Direito Urbanístico']
export const AGU = [['Direito Eleitoral'], ['Direito Internacional', 'Direito Internacional Privado'], ['Legislação de Ensino'], ['Legislação da AGU']]

const { dAdd, dDow, dMon, semDe, semInicio, horasEm, horasDia, minPdf, chaveLei, criarRodizioLP25, revisaoObrigatoria300, cicloRevisao300, capacidadeRevisao300 } = L

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
  /** migração automática: mantém cfg.motor (3.x) do plano gravado em vez de promover à versão atual. */
  manterMotor?: boolean
  /** regras do motor como DADOS (parcial; normalizado UMA vez por chamada). Ausente = REGRAS_PADRAO = comportamento da 3.2.0. */
  regras?: Partial<RegrasMotor> | null
  /** coletor do RASTRO de decisão (só simulação/diagnóstico sob demanda). Ausente = nenhum custo e saída idêntica. */
  rastro?: ColetorRastro | null
  /** metas de tipos personalizados do catálogo ('gx'): itens de lista (como o LegProc). Ausente/[] = saída idêntica à anterior. */
  gx?: ItemGX[]
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

// ── Bloqueio de tipos de material (admin › Cronograma › Regras do cronograma e Disciplinas) ─────────────────────
// Chega por `ctx.params`: `tiposBloqueados` (global do tenant; chaves do motor pf|fl|qu|lp|jp) e `discSemTipo`
// ({ pf: [disciplinas sem PDFull], lp: [disciplinas sem LegProc] }). Precedência: global bloqueado > disciplina desligada > ligado.
// Sem esses campos, nada muda (plano idêntico ao de antes).
export const TIPOS_BLOQUEAVEIS = ['pf', 'fl', 'qu', 'lp', 'jp'] as const
export interface Bloqueios { tipos: Set<string>; discPf: Set<string>; discLp: Set<string> }
export function criarBloqueios(p: unknown): Bloqueios {
  const r = (p && typeof p === 'object' ? p : {}) as { tiposBloqueados?: unknown; discSemTipo?: unknown }
  const tipos = new Set<string>((Array.isArray(r.tiposBloqueados) ? r.tiposBloqueados : []).filter((t): t is string => typeof t === 'string' && (TIPOS_BLOQUEAVEIS as readonly string[]).includes(t)))
  const d = (r.discSemTipo && typeof r.discSemTipo === 'object' ? r.discSemTipo : {}) as Record<string, unknown>
  const lista = (k: string) => new Set<string>(Array.isArray(d[k]) ? (d[k] as unknown[]).filter((x): x is string => typeof x === 'string') : [])
  return { tipos, discPf: lista('pf'), discLp: lista('lp') }
}
export const metaRevisao217 = (id: string, det: Record<string, Detalhe> = {}) => /^r[fq]:/.test(id) || revisaoAdaptativa(id) || !!det[id]?.semanaRevisao
/** PDFull regular de uma aula (pf:i) — exclui pf:i:reforco:s e pf:i:revisao:s. */
export const pdfRegular = (id: string) => /^pf:\d+$/.test(id)
const pfBase = (id: string) => /^p[fp]:\d+(:\d+)?$/.test(id)
const copiar = <T>(x: T): T => JSON.parse(JSON.stringify(x ?? {}))

/** `cada` da semana especial: 4/6/8; 10/12 só se já estavam no plano (legado); senão 8. */
export function normalizarCada(cada: unknown, legado = true, R: RegrasMotor = REGRAS_PADRAO, fx?: FaixaCarga | null): number {
  const n = Number(cada)
  const f = fx ?? { opcoesNovas: null, padrao: null }
  if (opcoesDaFaixa(f, R).includes(n)) return n
  if (legado && R.revisao.opcoesLegado.includes(n)) return n
  return padraoDaFaixa(f, R)
}
/** Faixa da 1ª semana do plano (define as opções/padrão de periodicidade do plano). */
const faixaInicial = (cfg: Cfg28, R: RegrasMotor): FaixaCarga => L.faixaDaSemana(cfg, 0, R)

// ── validação de horas (rotina) ─────────────────────────────────────────────────────────────────────
export function validarHoras300(horas: number[]): string {
  if (horas.some((h) => h > 0 && (h < 2 || !Number.isInteger(h * 2)))) return 'Selecione pelo menos 2h em cada dia de estudo, em intervalos de 30min.'
  return horas.reduce((t, h) => t + h, 0) < 10 ? 'Selecione pelo menos 10h de estudo por semana.' : ''
}

export interface Rotina300 { faixa: 1 | 2 | 3; fx: FaixaCarga; pdf: Set<DataISO>; revisao: Set<DataISO>; fimDeSemana: Set<DataISO>; ativos: DataISO[] }
/** Faixas de horas (10h–14h30 / 15h–24h30 / ≥25h) e dias de leitura/revisão da semana. */
export function rotina300(cfg: Cfg28, sem: number, ancora: DataISO = cfg.start, R: RegrasMotor = REGRAS_PADRAO): Rotina300 {
  const inicio = semInicio(cfg.start, sem)
  const datas = Array.from({ length: 7 }, (_, k) => dAdd(inicio, k))
  const horas = datas.reduce((t, d) => t + (+(horasEm(cfg, d)[dDow(d)] || 0)), 0)
  const fx = resolverFaixaCarga(horas * 60, R), faixa = classeDaFaixa(fx)
  // overrides da faixa na seção `rotina` valem sobre a base (não sobre a seção viva, que pode estar em outra semana)
  const Rb = baseDeRegras(R), RT = fx.overrides.rotina ? { ...Rb.rotina, ...fx.overrides.rotina } : Rb.rotina
  const ativos = datas.filter((d) => d >= ancora && d >= cfg.start && horasDia(cfg, d) > 0)
  const uteis = ativos.filter((d) => dDow(d) < 5)
  const weekend = ativos.filter((d) => dDow(d) >= 5)
  const soma = (dias: DataISO[]) => dias.reduce((t, d) => t + horasDia(cfg, d), 0)
  const maior = Math.max(0, ...weekend.map((d) => horasDia(cfg, d)))
  const mediaUtil = uteis.length ? soma(uteis) / uteis.length : 0
  const concentrado = weekend.length > 0 && soma(weekend) >= RT.fimSemanaFracao * soma(ativos) && maior >= mediaUtil + RT.fimSemanaDiferencaHoras
  const fimDeSemana = new Set<DataISO>(concentrado ? weekend.filter((d) => horasDia(cfg, d) >= mediaUtil + RT.fimSemanaDiferencaHoras) : [])
  const pdf = new Set<DataISO>(ativos.filter((d) => dDow(d) < RT.diasPdfAteDow || fimDeSemana.has(d)))
  const revisao = new Set<DataISO>(ativos.filter((d) => RT.diasRevisao.includes(dDow(d))))
  if (!revisao.size && ativos.length) revisao.add(ativos[ativos.length - 1])
  if (!pdf.size) {
    const candidatos = ativos.filter((d) => !revisao.has(d))
    for (const d of candidatos.length ? candidatos : ativos) pdf.add(d)
  }
  return { faixa, fx, pdf, revisao, fimDeSemana, ativos }
}

// ── regraRotina300 = 15: teto de PDFulls novos, encaixe inteiro, cota de PDFlash, antecipação ─────────
/** Teto semanal de PDFulls NOVOS (continuações não contam): ≤24h30 → 4 · 25h–35h → 5 · >35h → 6 (horas da rotina vigente). */
export function tetoInfo300(cfg: Cfg28, sem: number, R: RegrasMotor = REGRAS_PADRAO) {
  const inicio = semInicio(cfg.start, sem)
  let horas = 0
  for (let k = 0; k < 7; k++) horas += +(horasEm(cfg, dAdd(inicio, k))[k] || 0)
  // rev. 23: 10h–14h30 → 3 PDFulls novos por semana (linha soRegra23); demais faixas: 4 / 5 / 6 (padrão)
  return resolverTetoPdf(horas * 60, regra23(cfg), R)
}
export function tetoPDF300(cfg: Cfg28, sem: number, R: RegrasMotor = REGRAS_PADRAO): number { return tetoInfo300(cfg, sem, R).teto }
/** PDFulls que COMEÇAM na semana (1ª parte de cada aula; continuação e reforço/revisão adaptativa não contam). */
function iniciosPDF300(cfg: Cfg28, plano: Plano, detalhes: Record<string, Detalhe>, sem: number): number {
  const primeiros = new Map<number, [DataISO, string]>()
  for (const [id, [data]] of Object.entries(plano)) {
    if (!/^pf:\d+$|^pp:\d+:\d+$/.test(id) || metaRevisao217(id, detalhes) || reforcoHistorico(detalhes[id]?.pai || id)) continue
    const i = indiceAula(id), p = primeiros.get(i)
    if (!p || data < p[0]) primeiros.set(i, [data, id])
  }
  let n = 0
  for (const [data, id] of primeiros.values()) if (semDe(cfg.start, data) === sem && !detalhes[id]?.continuacao) n++
  return n
}
/** Existe, nesta ou nas 3 semanas seguintes, um dia de leitura com capacidade para a aula inteira? (cache por função de capacidade) */
const cacheDiaInteiro300 = new WeakMap<object, Map<DataISO, number>>()
function temDiaInteiro300(cfg: Cfg28, desde: DataISO, minutos: number, capacidade: (d: DataISO) => number, retaFinal = false, R: RegrasMotor = REGRAS_PADRAO): boolean {
  let cache = cacheDiaInteiro300.get(capacidade)
  if (!cache) { cache = new Map(); cacheDiaInteiro300.set(capacidade, cache) }
  const nova = regra23(cfg), chave = desde + (retaFinal ? ':final' : '')
  const c = cache.get(chave)
  if (c !== undefined) return c >= minutos
  const atual = semDe(cfg.start, desde)
  let maior = 0
  // rev. 23: qualquer dia de estudo; na reta final só a própria semana (dias depois de `desde`); fora dela, sem pular semana de revisão.
  for (let sem = atual; sem <= atual + (retaFinal ? 0 : R.divisao.janelaLeituraInteiraSemanas); sem++) {
    if (!retaFinal && L.ehRev(cfg, sem, R)) continue
    const rotina = rotina300(cfg, sem, desde, R)
    const dias = nova || rotina.faixa === 3 ? rotina.ativos : [...rotina.pdf]
    for (const d of dias) if (!retaFinal || d > desde) maior = Math.max(maior, capacidade(d))
  }
  cache.set(chave, maior)
  return maior >= minutos
}
/** rev. 23: até 2 metas distintas por dia de PDFull/Revisão/Questões (parcelas da mesma leitura contam como uma). `idsDia` = ids já no dia. */
function cabeTipoNoDia300(idsDia: string[], detalhes: Record<string, Detalhe>, id: string, pai: string | undefined, R: RegrasMotor): boolean {
  const tipo = familiaMeta(id)
  if (tipo !== 'pf' && tipo !== 'fl' && tipo !== 'qu') return true
  const chave = (k: string) => tipo === 'pf' ? (detalhes[k]?.pai || (k.startsWith('pp:') ? 'pf:' + indiceAula(k) : k)) : k
  const metas = new Set<string>()
  for (const k of idsDia) if (familiaMeta(k) === tipo) metas.add(chave(k))
  return metas.size < (tipo === 'pf' ? R.limitesDia.pdfDistintos : tipo === 'fl' ? R.limitesDia.revisoes : R.limitesDia.questoes) || (tipo === 'pf' && metas.has(pai || chave(id)))
}
/** Texto do limite diário (rastro). */
const textoLimiteDia = (id: string, R: RegrasMotor): string => { const t = familiaMeta(id); const [nome, n] = t === 'pf' ? ['PDFulls distintos', R.limitesDia.pdfDistintos] : t === 'fl' ? ['PDFlashes', R.limitesDia.revisoes] : ['metas de questões', R.limitesDia.questoes]; return `${rotuloMeta(id)} adiado: limite de ${n} ${nome} por dia já atingido.` }
/** rev. 23: o saldo da leitura cabe hoje + nos melhores dias seguintes da MESMA semana (≤3 datas no total)? */
function cabeSaldoNaSemana300(total: number, hoje: number, partes: number, dias: DataISO[], livre: (d: DataISO) => number, R: RegrasMotor): boolean {
  if (partes >= R.divisao.maxDatas) return false
  const BLK = R.constantes.blocoMin
  const minutos = (v: number) => Math.max(0, Math.floor(v / BLK) * BLK)
  const seguintes = dias.map((d) => minutos(livre(d))).sort((a, b) => b - a).slice(0, Math.max(0, R.divisao.maxDatas - 1 - partes))
  return minutos(hoje) >= BLK && minutos(hoje) + seguintes.reduce((a, b) => a + b, 0) >= total
}
/** rev. 23: reta final — fila de leituras vazia, ou (a partir da semana 2) restam ≤2 tetos (≤4 após a semana 4). */
function faseFinal300(cfg: Cfg28, sem: number, leiturasRestantes: number, R: RegrasMotor): boolean {
  return leiturasRestantes === 0 || (sem > R.retaFinal.semanaMinima && leiturasRestantes <= (sem > R.retaFinal.semanaCorteLimiar ? R.retaFinal.limiarTetosApos : R.retaFinal.limiarTetos) * tetoPDF300(cfg, sem, R))
}
/** Retorno (fl/qu) pode ser ANTECIPADO na revisão obrigatória: ≥1 semana (fl) / ≥2 semanas (qu) após a leitura. */
const podeAnteciparRetorno300 = (cfg: Cfg28, leitura: DataISO, data: DataISO, tipo: string, R: RegrasMotor): boolean => R.adaptacao.antecipaRetornoAtivo && semDe(cfg.start, data) - semDe(cfg.start, leitura) >= (tipo === 'fl' ? R.revisao.antecipaMinSemanas.fl : R.revisao.antecipaMinSemanas.qu)
/** Cota de PDFlash do dia na semana de revisão obrigatória (distribui as pendências pelos dias com capacidade). */
export function cotaPDFlash300(dias: DataISO[], livre: (d: DataISO) => number, pendentes: number, duracao: number = REGRAS_PADRAO.constantes.cotaPdflashDuracaoMin): number {
  const capacidades = dias.map((d) => Math.max(0, Math.floor(livre(d) / duracao)))
  const ativos = capacidades.filter((n) => n > 0).length
  const depois = capacidades.slice(1).reduce((a, b) => a + b, 0)
  return Math.min(capacidades[0] || 0, Math.max(Math.ceil(pendentes / Math.max(1, ativos)), pendentes - depois))
}

// ── ambiente (o "S" do modelo) ──────────────────────────────────────────────────────────────────────
export interface Env {
  AS: AulaAS[]; LP: ItemLP[]; lpMap: Map<string, ItemLP>; lpPos: Map<string, number>; ordem: number[]
  /** itens 'gx' normalizados e ordenados (prioridade, ordem, posição de entrada) + índice por id. */
  GX: ItemGX[]; gxMap: Map<string, ItemGX>
  feitas: Set<string>; prog: Record<string, Prog30>; notas: Record<string, NotaTema>
  det: Record<string, Detalhe>; planoAtual: Plano; hoje: DataISO; complementar: boolean; P: ParamsResolvido; bloq: Bloqueios
  /** regras do motor (dados), resolvidas UMA vez por chamada. */
  R: RegrasMotor
  /** regras-base (sem override de faixa) — só existe quando alguma faixa tem override; `R` é então uma cópia viva. */
  Rbase?: RegrasMotor
  /** faixa cujos overrides estão aplicados em `R` agora. */
  fxAtiva?: FaixaCarga | null
  /** rastro de decisão (opcional; ver rastro.ts). */
  rastro?: ColetorRastro | null
}
/** Meta de um tipo/disciplina bloqueado pelo admin (global ou por disciplina)? */
export function metaBloqueada(E: Env, id: string): boolean {
  const f = familiaMeta(id), B = E.bloq
  if (B.tipos.has(f)) return true
  if (f === 'pf' && B.discPf.size) return B.discPf.has(E.AS[indiceAula(id)]?.[0] as string)
  if (f === 'lp' && B.discLp.size) return B.discLp.has(E.lpMap.get(id)?.disc as string)
  return false
}
/** Tira do plano as metas bloqueadas AINDA NÃO concluídas e SEM dado (concluídas e com tempo/ponto de parada ficam: histórico do aluno). */
function semBloqueadas(E: Env, plano: Plano): Plano {
  if (!E.bloq.tipos.size && !E.bloq.discPf.size && !E.bloq.discLp.size) return plano
  return Object.fromEntries(Object.entries(plano).filter(([id]) => comDado(E, id) || !metaBloqueada(E, id)))
}
/** Desliga em `cfg.metas` os tipos bloqueados globalmente (a cópia do cfg já é do motor). */
function aplicarBloqueioCfg(E: Env, cfg: Cfg28 & Record<string, any>) {
  const m = { ...(cfg.metas || {}) } as Record<string, boolean>
  for (const t of ['pf', 'fl', 'qu', 'lp']) if (E.bloq.tipos.has(t)) m[t] = false
  cfg.metas = m
}
const feito = (E: Env, id: string) => E.feitas.has(id) || E.prog[id]?.s === 'done'
const hojeLocal = (): DataISO => L.dISO(new Date())
/** Meta com progresso registrado (tempo ou ponto de parada), concluída ou não. */
const comDado = (E: Env, id: string) => feito(E, id) || (E.prog[id]?.t || 0) > 0 || !!E.prog[id]?.parou

/** Normaliza `ctx.gx`: só ids `gx:` válidos, sem repetição, duração > 0; ordenado por prioridade, ordem e posição de entrada (estável). */
export function normalizarGX(gx: unknown): ItemGX[] {
  if (!Array.isArray(gx) || !gx.length) return []
  const vistos = new Set<string>(), out: Array<{ x: ItemGX; k: number }> = []
  gx.forEach((x: ItemGX, k: number) => {
    if (!x || typeof x.id !== 'string' || !ehIdGx(x.id) || vistos.has(x.id) || typeof x.disc !== 'string' || !x.disc) return
    const min = Math.round(Number(x.min))
    if (!Number.isFinite(min) || min <= 0 || min > 600) return
    vistos.add(x.id)
    out.push({ x: { ...x, min, prioridade: Number.isFinite(Number(x.prioridade)) ? Number(x.prioridade) : 5, ordem: Number.isFinite(Number(x.ordem)) ? Number(x.ordem) : 0 }, k })
  })
  return out.sort((a, b) => a.x.prioridade - b.x.prioridade || a.x.ordem - b.x.ordem || a.k - b.k).map((o) => o.x)
}

function criarEnv(AS: AulaAS[], LP: ItemLP[], ctx: Contexto30, P: ParamsResolvido): Env {
  const lista = (LP || []).filter((x) => x && x.id)
  const GX = normalizarGX(ctx.gx ?? [])
  return {
    GX, gxMap: new Map(GX.map((x) => [x.id, x])),
    AS, LP: lista, lpMap: new Map(lista.map((x) => [x.id, x])), lpPos: new Map(lista.map((x, k) => [x.id, k])),
    ordem: ctx.ordem && ctx.ordem.length ? ctx.ordem.filter((i) => AS[i]) : AS.map((_, i) => i),
    feitas: new Set(ctx.feitas || []), prog: ctx.prog || {}, notas: (ctx.notas || {}) as Record<string, NotaTema>,
    det: ctx.detalhes || {}, planoAtual: ctx.planoAtual || {}, hoje: ctx.hoje || hojeLocal(), complementar: !!ctx.complementarLegproc, P, bloq: criarBloqueios(ctx.params), ...criarRegrasEnv(resolverRegras(ctx)), rastro: ctx.rastro ?? null,
  }
}
/** Com overrides por faixa, o motor usa uma cópia viva das regras e alterna as seções conforme a faixa da semana corrente. */
function criarRegrasEnv(R: RegrasMotor): { R: RegrasMotor; Rbase?: RegrasMotor } {
  return temOverrides(R.faixas) ? { R: criarRegrasVivas(R), Rbase: R } : { R }
}
/** Ativa em `E.R` os overrides da faixa (sem efeito quando nenhuma faixa tem override). */
export function ativarFaixa(E: Env, fx: FaixaCarga | null | undefined): void {
  if (!E.Rbase || E.fxAtiva === fx) return
  aplicarFaixaEmRegras(E.R, E.Rbase, fx)
  E.fxAtiva = fx ?? null
}
/** Ativa os overrides da faixa da semana `sem` (pela rotina vigente de `cfg`). */
export function ativarSemana(E: Env, cfg: Cfg28, sem: number): void { if (E.Rbase) ativarFaixa(E, L.faixaDaSemana(cfg, sem, E.Rbase)) }

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
  if (rotina300(cfg, semDe(cfg.start, d), cfg.start, E.R).faixa !== 3 || d !== E.hoje) return E.R.limitesDia.pdfNovosBase
  return Object.entries(plano || {}).some(([id, [dia]]) => tipoEstudo(id) === 'pf' && dia === d && E.prog[id]?.s === 'done' && E.prog[id]?.em === d && !ehMetaAnterior(E, id, cfg)) ? E.R.limitesDia.pdfNovosAposConclusao : E.R.limitesDia.pdfNovosBase
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
  const escolhidas = new Set(cfg.discs.filter((d) => !E.bloq.discPf.has(d))), anteriores = indicesAnteriores(E, cfg), filas = new Map<string, number[]>(), totais = new Map<string, number>()
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
    const atrasadas = new Set(ativas.filter((v) => maximo - progresso(v.disc) >= E.R.rodizio.atrasoLimiar).map((v) => v.disc))
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
export function metaSemanalHistorico(cfg: Cfg28, sem: number, R: RegrasMotor = REGRAS_PADRAO): number {
  const ini = semInicio(cfg.start, sem), minutos = Array.from({ length: 7 }, (_, k) => horasDia(cfg, dAdd(ini, k)) * 60).reduce((a, b) => a + b, 0)
  return minutos >= R.historico.corteAltaMin ? R.historico.metaSemanalAlta : R.historico.metaSemanalBase
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
  return { total: res, acertos: cert, pct: cert / res * 100, nivel: cert / res >= E.R.desempenho.historicoOkMin / 100 ? 'ok' : cert / res >= E.R.desempenho.historicoFlashMin / 100 ? 'flash' : 'pdf' }
}
/** reforço do diagnóstico: <50% PDFull · 50–<70% PDFlash · ≥70% encerra; a partir da próxima semana civil da conclusão. */
function registrarReforcos216(E: Env, cfg: Cfg28 & Record<string, any>) {
  cfg.reforcosHistorico ||= {}; cfg.remanejadas ||= {}
  if (!E.R.adaptacao.reforcoAtivo) { E.rastro?.reg('adaptacao:reforco', 'adaptacao_off', 'Reforço do diagnóstico desligado: nenhuma meta :reforco: é criada por desempenho.', E.hoje); return }
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
    const baixo = !!(ac && ac.pct < E.R.desempenho.acertoFracoPct)
    const prioritario = (grau != null && grau > 0) || baixo
    let pontos = (grau || 0) + (baixo && ac ? E.R.desempenho.rankingBonusFraco + (E.R.desempenho.acertoFracoPct - ac.pct) / E.R.desempenho.acertoFracoPct * E.R.desempenho.rankingPesoDistancia : 0)
    if (jaRevisados.has(i)) pontos -= E.R.desempenho.rankingPenalidadeRevisado
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
      return { origem: id, total, acertos, pct, tipo: pct < E.R.desempenho.especialPdfAbaixo ? 'pf' : pct <= E.R.desempenho.especialFlashAte ? 'fl' : 'ok' }
    }
  }
  return null
}

export function semanaRevisao216(E: Env, cfg: Cfg28, plano: Plano, sem: number, projetar = false): { plano: Plano; detalhes: Record<string, Detalhe> } {
  if (!E.Rbase) return semanaRevisao216Interno(E, cfg, plano, sem, projetar)
  const ant = E.fxAtiva ?? null; ativarSemana(E, cfg, sem) // overrides da faixa da semana valem só durante esta chamada
  try { return semanaRevisao216Interno(E, cfg, plano, sem, projetar) } finally { ativarFaixa(E, ant) }
}
function semanaRevisao216Interno(E: Env, cfg: Cfg28, plano: Plano, sem: number, projetar = false): { plano: Plano; detalhes: Record<string, Detalhe> } {
  if (!E.R.adaptacao.semanaEspecialAtiva) { E.rastro?.reg('semana:' + sem, 'adaptacao_off', 'Semana especial por desempenho desligada: sem metas de revisão adaptativa nesta semana.', semInicio(cfg.start, sem)); return { plano: {}, detalhes: {} } }
  // Rotina ≤24h30: a semana de revisão é a OBRIGATÓRIA (PDFlashes e questões regulares pendentes, alocados no fluxo diário) — sem metas especiais.
  if (L.motorRevObrigatoria(cfg) && revisaoObrigatoria300(cfg, sem, E.R)) return { plano: {}, detalhes: {} }
  const g = semanaRevisao216Base(E, cfg, plano, sem, projetar)
  if (!E.bloq.tipos.size && !E.bloq.discPf.size) return g
  const p: Plano = {}, d: Record<string, Detalhe> = {}
  for (const [id, v] of Object.entries(g.plano)) if (!metaBloqueada(E, id)) { p[id] = v; if (g.detalhes[id]) d[id] = g.detalhes[id] }
  return { plano: p, detalhes: d }
}
function semanaRevisao216Base(E: Env, cfg: Cfg28, plano: Plano, sem: number, projetar = false): { plano: Plano; detalhes: Record<string, Detalhe> } {
  const AS = E.AS, P = E.P, R = E.R, BLK = R.constantes.blocoMin, cada = Number(cfg.revisao?.cada) || R.revisao.padrao
  const ini = semInicio(cfg.start, sem), base = estudadas216(E, cfg, plano, ini, projetar), ja = new Set<number>()
  const ateResultado = ini
  const estudadas = rankingRevisaoBase(E, base, ini, ja).map((x) => ({ i: x.i, resultado: resultadoTema217(E, x.i, ateResultado) }))
    .filter((x) => cfg.discs.includes(AS[x.i]?.[0]) && x.resultado && x.resultado.tipo !== 'ok') as Array<{ i: number; resultado: NonNullable<ReturnType<typeof resultadoTema217>> }>
  const externas: number[] = []
  const disciplinas = ESSENCIAIS.filter((d) => !cfg.discs.includes(d)), porDisc = disciplinas.map((d) => E.ordem.filter((i) => AS[i] && AS[i][0] === d))
  for (let k = 0; ; k++) { let existe = false; for (const ids of porDisc) if (ids[k] != null) { externas.push(ids[k]); existe = true } if (!existe) break }
  if (externas.length) { const giro = ((Math.floor(sem / cada) - 1) * R.revisao.giroExternas) % externas.length; externas.push(...externas.splice(0, giro)) }
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
  // rev. 23: no máx. 2 PDFlashes (e 2 PDFulls / 2 questões) por data na semana especial
  const R23 = regra23(cfg)
  const metasNoDia = (d: DataISO) => [...Object.entries(plano), ...Object.entries(out)].filter(([, [data]]) => data === d)
  const cabeFlash = (d: DataISO) => !R23 || metasNoDia(d).filter(([id]) => familiaMeta(id) === 'fl').length < R.limitesDia.revisoes
  type Item = { i: number; resultado: NonNullable<ReturnType<typeof resultadoTema217>>; tipo: string; id: string; min: number }
  const definir = (x: { i: number; resultado: NonNullable<ReturnType<typeof resultadoTema217>> }): Item => {
    const tipo: string = x.resultado?.tipo || 'rq', id = tipo === 'rq' ? 'rq:' + sem + ':' + x.i : tipo + ':' + x.i + ':revisao:' + sem
    const min = tipo === 'pf' ? minPdf(AS[x.i][3], cfg.vel, P.velPadrao) : tipo === 'fl' ? P.durRevisao.rf : P.durRevisao.rq
    return { ...x, tipo, id, min }
  }
  const colocarEstudada = (x: Item): boolean => {
    if (x.tipo !== 'pf') {
      const d = dias.find((d) => d >= cursor && livre[d] >= x.min && (x.tipo !== 'rq' || (R23 ? qs[d] < R.limitesDia.questoes : !qs[d])) && (x.tipo !== 'fl' || cabeFlash(d)))
      if (!d) return false
      colocar(x.id, d, x.min, { essencialNaoSelecionada: false, material: x.tipo === 'rq' ? 'Questões' : 'PDFlash', reforco: x.tipo !== 'rq', pai: x.id, origem: x.resultado?.origem, percentualOrigem: x.resultado?.pct })
      return true
    }
    const melhores = dias.filter((d) => d >= cursor && livre[d] >= BLK && (!R23 || metasNoDia(d).filter(([id]) => ehPdf(tipoEstudo(id))).length < R.limitesDia.pdfDistintos)).sort((a, b) => livre[b] - livre[a] || a.localeCompare(b))
    const blocos: DataISO[] = []
    let soma = 0
    for (const d of melhores.slice(0, R.divisao.maxDatas)) { blocos.push(d); soma += Math.floor(livre[d] / BLK) * BLK; if (soma >= x.min) break }
    if (soma < x.min) return false
    blocos.sort()
    const total = AS[x.i][3] || 60
    let restante = x.min, pagina = 1
    for (const d of blocos) {
      const m = Math.min(restante, Math.floor(livre[d] / BLK) * BLK); if (!m) continue
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
      const d = dias.find((d) => d >= cursor && livre[d] >= P.durRevisao.rf && cabeFlash(d))
      if (!d) return { plano: out, detalhes }
      colocar('rf:' + sem + ':' + extras.shift(), d, P.durRevisao.rf, { essencialNaoSelecionada: true, material: 'PDFlash' })
      saldo++
    }
  }
  if (estudadas.length && externas.length && (!fila.length || !extras.length)) return { plano: out, detalhes }
  if (fila.length && extras.length) {
    while (fila.length && extras.length) {
      const foto = { ...livre }, qfoto = { ...qs }, oAntes = { ...out }, mdAntes = { ...detalhes }, nAntes = ordem, cAntes = { ...contadores }, cursorAntes = cursor, i = extras[0], d = dias.find((d) => d >= cursor && livre[d] >= P.durRevisao.rf && cabeFlash(d))
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
  else for (const i of extras) { const d = dias.find((d) => livre[d] >= P.durRevisao.rf && cabeFlash(d)); if (!d) break; colocar('rf:' + sem + ':' + i, d, P.durRevisao.rf, { essencialNaoSelecionada: true, material: 'PDFlash' }) }
  return { plano: out, detalhes }
}

// ── Jurisprudência semanal ──────────────────────────────────────────────────────────────────────────
export function reservarJuris219(E: Env, cfg: Cfg28, sem: number, desde: DataISO, fonte: Plano = {}, opcoes: { movida?: { id: string; dia: DataISO } | null } = {}): { id: string; valor: [DataISO, number]; concluida?: boolean } | null {
  if (!E.Rbase) return reservarJuris219Interno(E, cfg, sem, desde, fonte, opcoes)
  const ant = E.fxAtiva ?? null; ativarSemana(E, cfg, sem)
  try { return reservarJuris219Interno(E, cfg, sem, desde, fonte, opcoes) } finally { ativarFaixa(E, ant) }
}
function reservarJuris219Interno(E: Env, cfg: Cfg28, sem: number, desde: DataISO, fonte: Plano = {}, opcoes: { movida?: { id: string; dia: DataISO } | null } = {}): { id: string; valor: [DataISO, number]; concluida?: boolean } | null {
  if (E.bloq.tipos.has('jp')) return null // Jurisprudência bloqueada pelo admin: nenhuma meta semanal nova
  const ini = semInicio(cfg.start, sem), fim = dAdd(ini, 6), ids = Object.keys(fonte).filter((id) => ehJuris219(id) && fonte[id][0] >= ini && fonte[id][0] <= fim)
  const concluida = ids.find((id) => feito(E, id))
  const horasSemana = Array.from({ length: 7 }, (_, k) => dAdd(ini, k)).reduce((s, d) => s + (d >= cfg.start ? horasDia(cfg, d) : 0), 0)
  // Limiar: semana com ≥14h30 de disponibilidade efetiva (recesso e datas pontuais já contam em horasDia).
  // Só reserva se o aluno MARCOU Jurisprudência em "Metas no cronograma" (cfg.metas.jp === true; padrão desmarcado — ref. 3.0).
  const optInJp = E.R.juris.exigeOptIn ? (cfg.metas as Record<string, boolean | undefined> | undefined)?.jp === true : (cfg.metas as Record<string, boolean | undefined> | undefined)?.jp !== false
  if ((!optInJp || horasSemana < E.R.juris.minSemanalMin / 60) && !concluida) {
    if (opcoes.movida && ehJuris219(opcoes.movida.id) && semDe(cfg.start, opcoes.movida.dia) === sem) throw Error(`Ative Jurisprudência e tenha pelo menos ${textoHoras(E.R.juris.minSemanalMin)} de estudo na semana.`)
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
  const preferidos = dias.filter((d) => E.R.juris.diasPreferidos.includes(dDow(d))).sort(ordenar), d = preferidos[0] || dias.sort(ordenar)[0]
  if (!d) throw Error('A semana ' + sem + ' precisa de um dia com 1h disponível para Jurisprudência. Ajuste a rotina ou as horas dessa semana.')
  return { id, valor: [d, minutos / 60] }
}

// ── geração dia a dia ───────────────────────────────────────────────────────────────────────────────
interface Devido { id: string; due: DataISO; t: string; minutos: number }
interface Gerado { plano: Plano; detalhes: Record<string, Detalhe>; fim: number; legprocRestantes: string[] }

function gerarPlanoBase30(E: Env, cfg: Cfg28 & Record<string, any>, fixos: Plano, ancora: DataISO | null): Gerado {
  const AS = E.AS, P = E.P, R = E.R, BLK = R.constantes.blocoMin, DUR = P.dur, SEM_FLASH = P.semFlash, MAX = P.maxSemanas
  const A = ancora && ancora > cfg.start ? ancora : cfg.start
  const plano: Plano = {}, detalhes: Record<string, Detalhe> = {}, carga: Record<string, number> = {}, ativas = new Set(cfg.discs)
  const metas = (cfg.metas || {}) as Record<string, boolean | undefined>
  let rotina!: Rotina300, ultimoTipoRevisao: string | null = null, retaFinal = false
  const R23 = regra23(cfg) // regra da ref. rev. 23 só vale para planos com cfg.motor >= 3.2.0
  const livre = (d: DataISO) => Math.max(0, Math.round(horasDia(cfg, d) * 60) - (carga[d] || 0))
  const idsPorDia = new Map<DataISO, string[]>() // índice dia → ids (equivale a varrer Object.keys(plano))
  const idsDoDia = (d: DataISO): string[] => idsPorDia.get(d) || []
  const por = (d: DataISO, id: string, m: number, md?: Detalhe | null) => {
    const ant = plano[id]
    if (ant && ant[0] !== d) { const l = idsPorDia.get(ant[0]); if (l) l.splice(l.indexOf(id), 1) }
    if (!ant || ant[0] !== d) { const l = idsPorDia.get(d); if (l) l.push(id); else idsPorDia.set(d, [id]) }
    plano[id] = [d, m / 60]; carga[d] = (carga[d] || 0) + m; if (md) detalhes[id] = md
  }
  const especial = (id: string) => /^r[fq]:/.test(id), feita = (id: string) => feito(E, id)
  for (const [id, v] of Object.entries(fixos)) {
    if (!feita(id) && especial(id)) continue
    por(v[0], id, Math.round(v[1] * 60), E.det[id])
  }
  const rodizioPDF = construirRodizioPDF(E, cfg, fixos)
  const fila = rodizioPDF.fila.filter((i) => !plano['pf:' + i])
  const devidos: Devido[] = [], incluidos = new Set(Object.keys(plano))
  const adicionar = (id: string, due: DataISO, t: string, minutos: number) => { if (!incluidos.has(id)) { devidos.push({ id, due, t, minutos }); incluidos.add(id) } }
  const proxSem = (d: DataISO, n: number) => L.proxSemConteudo(cfg, d, n, R)
  const registrar = (i: number, d: DataISO) => {
    if (metas.fl && !SEM_FLASH.has(AS[i][0])) adicionar('fl:' + i, proxSem(d, P.offsetRevisao), 'fl', DUR.fl)
    if (metas.qu) adicionar('qu:' + i, proxSem(d, P.offsetQuestoes), 'qu', DUR.qu)
  }
  for (const [id, v] of Object.entries(fixos)) if (id.startsWith('pf:') && !reforcoHistorico(id) && ativas.has(AS[indiceAula(id)]?.[0])) registrar(indiceAula(id), v[0])
  if (!metas.pf) for (const i of fila) registrar(i, cfg.start)
  // PDFull desligado numa disciplina pelo admin: sem leitura, mas revisão/questões dela seguem (mesmo critério de quem desmarca PDFull)
  else if (E.bloq.discPf.size) for (const i of E.ordem) if (ativas.has(AS[i]?.[0]) && E.bloq.discPf.has(AS[i][0]) && !plano['pf:' + i]) registrar(i, cfg.start)
  const hist = criarFilaDiagnostico(E, cfg, fixos), histPorSem: Record<number, number> = {}
  const ignorar = new Set<string>(cfg.lpIgnorar || [])
  const gx: ItemGX[] = E.GX.length && metas.gx !== false ? E.GX.filter((x) => ativas.has(x.disc) && !plano[x.id] && !feita(x.id) && !metaBloqueada(E, x.id)) : []
  const lp: ItemLP[] = metas.lp ? E.LP.filter((x) => ativas.has(x.disc) && !plano[x.id] && !ignorar.has(x.id) && !metaBloqueada(E, x.id)) : []
  const metasLP = E.lpMap
  const rodizio = criarRodizioLP25(cfg.discs, null, P.lpJanelaRodizio)
  const iniciadas = new Set<string>(Object.keys(fixos).filter((id) => id.startsWith('lp:')).map((id) => chaveLei(metasLP.get(id))))
  let fechou = false, leisFinais: Set<string> = new Set(), qi = 0
  type CursoT = { i: number; total: number; p: number; resta: number; k: number; ultima: DataISO | null; partes?: number; semana?: number }
  let curso = null as CursoT | null
  let fim = Math.max(1, semDe(cfg.start, A)), semRevPreparada = 0, herancas = 0, semAtual216 = 0
  const candidatos = (t: string) => devidos.filter((x) => x.t === t).sort((a, b) => a.due.localeCompare(b.due) || indiceAula(a.id) - indiceAula(b.id))
  // restrições declarativas por personagem (regras.restricoes; vazio = sem efeito)
  const chavePai = (k: string) => detalhes[k]?.pai || (k.startsWith('pp:') ? 'pf:' + indiceAula(k) : k)
  const restrito = (id: string, d: DataISO): boolean => {
    if (!R.restricoes.length) return false
    const c = {
      idsDoDia, dataDe: (k: string) => plano[k]?.[0], faixa: rotina ? rotina.faixa : 3, pai: chavePai,
      haOutrosPendentes: (fam: FamiliaRestricao) => (fam !== 'pf' && !!metas.pf && (qi < fila.length || !!curso)) || devidos.some((x) => familiaDoTipo(x.t) !== fam && x.t !== 'lp') || (fam !== 'fl' && fam !== 'qu' && hist.tem()),
    }
    if (!E.rastro) return restricaoBloqueia(R.restricoes, id, d, c)
    const r = restricaoQueBloqueia(R.restricoes, id, d, c)
    if (r) E.rastro.reg(id, 'restricao', () => `${rotuloMeta(id)} barrado por restrição: ${r.rotulo || descreverRestricao(r)}`, d)
    return r !== null
  }
  const elegivel = (x: Devido, d: DataISO) => {
    if (restrito(x.id, d)) return false
    if (R23) {
      if (!cabeTipoNoDia300(idsDoDia(d), detalhes, x.id, undefined, R)) { E.rastro?.reg(x.id, 'limite_dia', () => textoLimiteDia(x.id, R), d); return false }
      const semana = semDe(cfg.start, d)
      if (x.t === 'qu' && !retaFinal && revisaoObrigatoria300(cfg, semana, R) && !L.ehRev(cfg, semana, R)) { E.rastro?.reg(x.id, 'revisao_obrigatoria', () => `${rotuloMeta(x.id)} adiado: questões só na semana de revisão obrigatória (semana ${semana}).`, d); return false }
    }
    // Revisão obrigatória: o retorno pode ser ANTECIPADO (≥1 semana do PDFull p/ revisão, ≥2 p/ questões).
    const leitura = plano['pf:' + indiceAula(x.id)]?.[0]
    const adiantar = !questoesHistorico(x.id) && L.motorRevObrigatoria(cfg) && revisaoObrigatoria300(cfg, semDe(cfg.start, d), R) && !!leitura && podeAnteciparRetorno300(cfg, leitura, d, x.t, R)
    if (x.due > d && !adiantar && !(R23 && R.adaptacao.antecipaRetornoAtivo && retaFinal && leitura && leitura <= d && !questoesHistorico(x.id))) return false
    if (x.t === 'qu' && !questoesHistorico(x.id) && metas.fl && !SEM_FLASH.has(AS[indiceAula(x.id)][0])) {
      const fl = 'fl:' + indiceAula(x.id); if (!plano[fl] || plano[fl][0] > d) return false
    }
    return true
  }
  const alocar = (x: Devido, d: DataISO) => { por(d, x.id, x.minutos); devidos.splice(devidos.indexOf(x), 1) }
  const minutosLeitura = (i: number) => minPdf(Math.max(1, (AS[i][3] || 60) - paginasFeitas216(E, i, cfg, fixos)), cfg.vel, P.velPadrao)
  const selecionarPDF = (d: DataISO) => {
    if (curso || qi >= fila.length) return
    const rodada = rodizioPDF.indicesRodada[fila[qi]], disciplinas = new Set<string>(), cands: Array<{ k: number; rodada: number; minutos: number }> = []
    // rev. 23: testa a rodada atual E a seguinte; prefere a atual e, entre as que cabem inteiras, a maior duração.
    for (let k = qi; k < fila.length && (R23 ? rodizioPDF.indicesRodada[fila[k]] <= rodada + 1 : rodizioPDF.indicesRodada[fila[k]] === rodada); k++) {
      const i = fila[k], disc = AS[i][0], pai = rodizioPDF.dependencias[i]
      if (disciplinas.has(disc)) continue
      disciplinas.add(disc)
      if (pai == null || plano['pf:' + pai]?.[0] <= d) cands.push({ k, rodada: rodizioPDF.indicesRodada[i], minutos: minutosLeitura(i) })
    }
    const inteiro = cands.filter((x) => x.minutos <= livre(d)).sort((a, b) => (R23 ? a.rodada - b.rodada : 0) || b.minutos - a.minutos)[0]
    if (inteiro) { const [i] = fila.splice(inteiro.k, 1); fila.splice(qi, 0, i) }
  }
  // capacidade do dia descontada da reserva de Jurisprudência da semana (registrada ou projetada)
  const reservasInteiro = new Map<number, [DataISO, number] | null | undefined>()
  const capacidadeInteiro = (d: DataISO) => {
    const semana = semDe(cfg.start, d)
    if (!reservasInteiro.has(semana)) {
      const registrada = Object.entries(plano).find(([id, [data]]) => ehJuris219(id) && semDe(cfg.start, data) === semana)?.[1]
      const projetada = metas.jp === true ? reservarJuris219(E, cfg, semana, A, plano)?.valor : null
      reservasInteiro.set(semana, registrada || projetada)
    }
    const juris = reservasInteiro.get(semana)
    return Math.round(horasDia(cfg, d) * 60) - (juris?.[0] === d ? Math.round(juris[1] * 60) : 0)
  }
  // rev. 23: sobra ≥60min na reta final / semana de revisão obrigatória pode iniciar um trecho em vez de esperar o dia inteiro
  const repartirParaAvancar = (d: DataISO, m: number) => R23 && m >= R.divisao.sobraMinAvancarMin && (retaFinal || revisaoObrigatoria300(cfg, semDe(cfg.start, d), R))
  const ler = (d: DataISO, m: number, encaixeExtra = false): boolean => {
    if (!metas.pf) return false
    const i = curso?.i ?? fila[qi]; if (i == null || m < BLK) return false
    if (restrito('pf:' + i, d)) return false
    if (R23 && !cabeTipoNoDia300(idsDoDia(d), detalhes, 'pf:' + i, undefined, R)) { E.rastro?.reg('pf:' + i, 'limite_dia', () => textoLimiteDia('pf:' + i, R), d); return false }
    const restantesNovos = novosPDFDia27(plano, cfg, d, detalhes)
    const continuacao = paginasFeitas216(E, i, cfg, fixos) > 0 || (!!curso?.ultima && curso.ultima < d)
    if (!(R23 && (encaixeExtra || retaFinal)) && !continuacao && !restantesNovos.has(i) && restantesNovos.size >= limitePDF27(E, cfg, d, plano)) { E.rastro?.reg('pf:' + i, 'limite_novos_dia', () => `${rotuloMeta('pf:' + i)} adiado: limite de ${limitePDF27(E, cfg, d, plano)} PDFull(s) novo(s) por dia atingido.`, d); return false }
    const partes = curso?.partes ?? new Set(Object.keys(fixos).filter((id) => id.startsWith('pp:' + i + ':') && feita(id)).map((id) => fixos[id][0])).size
    if (R23) {
      // Conclusão na mesma semana, em até 3 datas: o saldo precisa caber hoje + nos melhores dias restantes da semana.
      const restantePDF = curso?.resta ?? minutosLeitura(i)
      if (m < restantePDF && !cabeSaldoNaSemana300(restantePDF, m, partes, rotina.ativos.filter((data) => data > d && cabeTipoNoDia300(idsDoDia(data), detalhes, 'pf:' + i, undefined, R)), livre, R)) return false
      // Prefere a leitura inteira (salvo sobra ≥60min na reta final / revisão obrigatória).
      if (!continuacao && !curso && m < minutosLeitura(i) && !repartirParaAvancar(d, m) && temDiaInteiro300(cfg, d, minutosLeitura(i), capacidadeInteiro, retaFinal, R)) return false
    } else {
      // Parcelamento: no máximo 3 datas — a partir da 3ª só entra o que fecha a leitura.
      if (partes >= R.divisao.maxDatas - 1 && m < (curso?.resta ?? minutosLeitura(i))) return false
      // Prefere a leitura inteira: se há dia (nesta ou nas 3 semanas seguintes) que comporta a aula toda, não divide.
      if (!continuacao && !curso && m < minutosLeitura(i) && temDiaInteiro300(cfg, d, minutosLeitura(i), capacidadeInteiro, false, R)) return false
    }
    // Teto semanal de PDFulls novos (3/4/5/6 pela faixa de horas); continuações pertencem à aula já iniciada.
    const semanaLeitura = semDe(cfg.start, d)
    if (!retaFinal && !(R23 && encaixeExtra && semanaLeitura > R.retaFinal.semanaEncaixeExtra) && !curso && !continuacao && iniciosPDF300(cfg, plano, detalhes, semanaLeitura) >= tetoPDF300(cfg, semanaLeitura, R)) { E.rastro?.reg('pf:' + i, 'teto_semana', () => `${rotuloMeta('pf:' + i)} adiado: teto de ${tetoPDF300(cfg, semanaLeitura, R)} PDFull(s) novo(s) por semana (faixa ${rotina.faixa}) atingido na semana ${semanaLeitura}.`, d); return false }
    // Antes do ciclo de revisão obrigatória: não abrir PDFull novo se o custo (PDFlash+questões) estoura a capacidade da semana de revisão.
    const ciclo = cicloRevisao300(cfg, d, R)
    if (!retaFinal && !curso && ciclo && L.motorRevObrigatoria(cfg)) {
      const custo = (metas.fl && !SEM_FLASH.has(AS[i][0]) ? DUR.fl : 0) + (metas.qu ? DUR.qu : 0)
      const inicioCiclo = semInicio(cfg.start, ciclo)
      const comprometidos = devidos.filter((x) => x.due <= inicioCiclo).reduce((t, x) => t + x.minutos, 0)
      const capacidade = capacidadeRevisao300(cfg, ciclo, R)
      if (R23) {
        // até 24h30 a capacidade de retornos também é medida em VAGAS DIÁRIAS de questões (2 por dia ativo da semana de revisão)
        const vagasQuestoes = rotina300(cfg, ciclo, cfg.start, R).ativos.length * R.limitesDia.questoes
        const questoesPendentes = devidos.filter((x) => x.t === 'qu' && x.due <= inicioCiclo).length
        if (metas.qu && vagasQuestoes > 0 && questoesPendentes >= vagasQuestoes) return false
        if (encaixeExtra && iniciosPDF300(cfg, plano, detalhes, semanaLeitura) >= tetoPDF300(cfg, semanaLeitura, R)) {
          // PDFull extra acima do teto: preserva parte da capacidade de retornos para as semanas comuns restantes do ciclo
          const futuras = Math.max(0, ciclo - semanaLeitura - 1)
          const margem = metas.qu ? Math.max(0, vagasQuestoes - questoesPendentes - 1) : Infinity
          const reservaPorSemana = Math.min(tetoPDF300(cfg, semanaLeitura, R), metas.qu ? Math.floor(vagasQuestoes / R.constantes.reservaCicloDivisor) : tetoPDF300(cfg, semanaLeitura, R))
          const reserva = futuras * reservaPorSemana
          if (margem < reserva || comprometidos + custo + reserva * custo > capacidade) return false
        }
      }
      if (custo > 0 && capacidade >= custo && comprometidos + custo > capacidade) return false
    }
    if (!curso) {
      qi++
      const total = AS[i][3] || 60, p = paginasFeitas216(E, i, cfg, fixos)
      curso = { i, total, p, resta: minPdf(Math.max(1, total - p), cfg.vel, P.velPadrao), k: Math.max(0, ...Object.keys(E.prog).filter((k) => k.startsWith('pp:' + i + ':')).map((k) => +k.split(':')[2])), ultima: null }
    }
    const cs = curso
    m = Math.min(cs.resta, Math.floor(m / BLK) * BLK); if (m < BLK) return false
    const final = m === cs.resta, id = final ? 'pf:' + i : 'pp:' + i + ':' + (++cs.k)
    const lidas = final ? cs.total - cs.p : Math.max(1, Math.min(cs.total - cs.p - 1, Math.floor((cs.total - cs.p) * m / cs.resta)))
    por(d, id, m, { paginaInicio: cs.p + 1, paginaFim: cs.p + lidas, totalPaginas: cs.total, continuacao: !!continuacao, pai: 'pf:' + i })
    cs.p += lidas; cs.resta -= m; cs.ultima = d; cs.partes = partes + 1; cs.semana = semDe(cfg.start, d)
    if (final) { registrar(i, d); curso = null }
    return true
  }
  const blocoLP = (d: DataISO, extra = false, limite = R.legproc.mesmaLei) => {
    if (!metas.lp) return
    const ids = Object.keys(plano).filter((id) => id.startsWith('lp:') && plano[id][0] === d), chaves = new Set(ids.map((id) => chaveLei(metasLP.get(id))))
    if (ids.length >= R.legproc.metasDiaMax || (!extra && ids.length >= R.legproc.metasDiaBase)) return
    const primeiras = new Map<string, string>(); for (const x of lp) if (!primeiras.has(x.disc)) primeiras.set(x.disc, chaveLei(x))
    // 1º bloco: continua a lei do dia (se houver); 2º bloco (extra): outra lei.
    const permitidas = lp.filter((x) => primeiras.get(x.disc) === chaveLei(x) && (!fechou || leisFinais.has(chaveLei(x))) && (extra ? !chaves.has(chaveLei(x)) : !chaves.size || chaves.has(chaveLei(x))))
    const ordem = rodizio.ordenar(permitidas.map((x) => x.disc))
    const candidatas = ordem.map((disc) => permitidas.find((x) => x.disc === disc)).filter(Boolean) as ItemLP[]
    // Com 1h livre para o 2º bloco, prefere uma lei que ainda tenha duas metas consecutivas.
    const par = extra && livre(d) >= 60 && ids.length <= 2 ? candidatas.find((x) => permitidas.filter((y) => chaveLei(y) === chaveLei(x)).length >= 2) : null
    const primeiro = par || candidatas[0]
    if (!primeiro) return
    const lei = chaveLei(primeiro); let n = ids.filter((id) => chaveLei(metasLP.get(id)) === lei).length
    let totalDia = ids.length
    while (n < limite && totalDia < (extra ? R.legproc.metasDiaMax : R.legproc.metasDiaBase) && livre(d) >= DUR.lp) { const m = lp.find((x) => chaveLei(x) === lei); if (!m || restrito(m.id, d)) break; por(d, m.id, DUR.lp); iniciadas.add(lei); lp.splice(lp.indexOf(m), 1); n++; totalDia++ }
    rodizio.avancar(primeiro.disc)
  }
  /** Metas 'gx' na sobra do dia, depois do LegProc (prioridade/ordem do item; sem restrição de lei). Sai na hora se não há gx. */
  const blocoGX = (d: DataISO) => {
    if (!gx.length) return
    const TG = R.tiposGx, comRegras = !!TG && Object.keys(TG).length > 0
    for (let k = 0; k < gx.length; k++) {
      const x = gx[k]
      if (livre(d) < x.min) continue
      if (comRegras && TG[x.slug] && !elegivelGx(x, d, TG[x.slug])) continue
      por(d, x.id, x.min)
      if (comRegras) { const ch = x.slug + '|' + semDe(cfg.start, d); gxPorSemana.set(ch, (gxPorSemana.get(ch) || 0) + 1); gxUltimaSem = semDe(cfg.start, d) }
      gx.splice(k, 1); k--
    }
  }
  // FASE 3a — regras por tipo gx (só elegibilidade). Contagem semanal por slug (inclui metas gx fixas já no plano).
  const gxPorSemana = new Map<string, number>()
  for (const id of Object.keys(plano)) if (ehIdGx(id)) { const ch = id.split(':')[1] + '|' + semDe(cfg.start, plano[id][0]); gxPorSemana.set(ch, (gxPorSemana.get(ch) || 0) + 1) }
  const gxComRegras = !!R.tiposGx && Object.keys(R.tiposGx).length > 0
  const gxMaxAPartir = gxComRegras ? Math.max(0, ...Object.values(R.tiposGx).map((g) => g.aPartirDaSemana || 0)) : 0
  let gxUltimaSem = 0
  const elegivelGx = (x: ItemGX, d: DataISO, g: RegraTipoGx): boolean => {
    const sem = semDe(cfg.start, d)
    if (g.ativo === false) return false
    if (g.aPartirDaSemana > 0 && sem < g.aPartirDaSemana) return false
    if (g.dias.length && !g.dias.includes(dDow(d))) return false
    if (g.faixas.length) { const i = rotina.fx ? R.faixas.indexOf(rotina.fx) : -1; if (!g.faixas.includes(i >= 0 ? i + 1 : rotina.faixa)) return false }
    if (g.maxPorDia != null && idsDoDia(d).filter((id) => ehIdGx(id) && id.split(':')[1] === x.slug).length >= g.maxPorDia) return false
    if (g.maxPorSemana != null && (gxPorSemana.get(x.slug + '|' + sem) || 0) >= g.maxPorSemana) return false
    return true
  }
  let diaAtual = A
  const temAcademico = () => (metas.pf && (qi < fila.length || curso)) || devidos.length > 0 || hist.tem() || Object.keys(fixos).some((id) => !feita(id) && !id.startsWith('lp:') && !ehIdGx(id) && !ehJuris219(id) && fixos[id][0] > diaAtual)
  const fechar = () => { fechou = true; leisFinais = new Set(lp.map(chaveLei).filter((lei) => E.complementar || iniciadas.has(lei))) }
  const horizonte = MAX * 7
  for (let k = 0, d = A; k < horizonte; k++, d = dAdd(d, 1)) {
    diaAtual = d
    const sem = semDe(cfg.start, d)
    ativarSemana(E, cfg, sem) // overrides por faixa: a faixa da semana corrente vale em todo o dia
    if (R23) {
      // rev. 23: um PDFull só começa se couber na semana (≤3 datas); se ficou aberto ao virar a semana, a geração falha (nada é gravado).
      if (curso?.semana != null && curso.semana !== sem) throw Error('Não foi possível concluir o PDFull na semana em que ele começou.')
      retaFinal = retaFinal || faseFinal300(cfg, sem, fila.length - qi + (curso ? 1 : 0), R)
    }
    if (sem !== semAtual216) { semAtual216 = sem; rotina = rotina300(cfg, sem, A, R); histPorSem[sem] = Object.keys(plano).filter((id) => questoesHistorico(id) && semDe(cfg.start, plano[id][0]) === sem).length }
    if (!temAcademico() && !fechou) fechar()
    if (fechou && !lp.some((x) => leisFinais.has(chaveLei(x))) && !gx.length) break
    // com regras por tipo gx, pendentes por elegibilidade não prolongam o plano: sem colocar nenhuma por 8 semanas (após a maior aPartirDaSemana) para
    if (fechou && gxComRegras && !lp.some((x) => leisFinais.has(chaveLei(x))) && sem > gxMaxAPartir + 8 && sem - gxUltimaSem >= 8) break
    if (!Object.keys(plano).some((id) => ehJuris219(id) && semDe(cfg.start, plano[id][0]) === sem)) {
      const reservaJ = reservarJuris219(E, cfg, sem, A, plano)
      if (reservaJ) por(reservaJ.valor[0], reservaJ.id, Math.round(reservaJ.valor[1] * 60), { jurisprudencia: true })
    }
    if (!livre(d)) continue
    if (R23 && curso) ler(d, livre(d)) // continuação da leitura aberta tem prioridade nos próximos dias disponíveis
    const rev = L.ehRev(cfg, sem, R)
    if (rev && !fechou) {
      if (semRevPreparada !== sem) {
        const g = semanaRevisao216(E, cfg, plano, sem, semInicio(cfg.start, sem) > E.hoje)
        for (const [id, v] of Object.entries(g.plano)) if (v[0] >= A) por(v[0], id, Math.round(v[1] * 60), g.detalhes[id])
        semRevPreparada = sem
      }
      // Mantém pendências regulares na sobra, sem abrir PDFull novo durante a revisão.
    } else if (!fechou && hist.tem() && (histPorSem[sem] || 0) < metaSemanalHistorico(cfg, sem, R)) {
      const i = hist.proxima(); adicionar('qu:' + i + ':hist:' + sem, d, 'qu', DUR.qu); hist.avancar(); histPorSem[sem]++
    }
    if (!retaFinal && rotina.faixa < 3 && !rev) {
      const eDiaPDF = rotina.pdf.has(d)
      const eDiaRevisao = rotina.revisao.has(d)
      const aquecimento = sem <= (metas.qu ? R.rotina.aquecimentoComQuestoes : metas.fl ? R.rotina.aquecimentoSoRevisao : 0)
      const questoes = () => candidatos('qu').filter((x) => elegivel(x, d))
      const revisoes = () => candidatos('fl').filter((x) => elegivel(x, d))
      let fezQuestoes = Object.keys(plano).some((id) => familiaMeta(id) === 'qu' && plano[id][0] === d)
      const distribuirRevisao = () => {
        while (livre(d) >= BLK) {
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
      if (temLeitura && (R23 || eDiaPDF || (aquecimento && eDiaRevisao && !questoes().length && !revisoes().length))) {
        selecionarPDF(d)
        const i = (curso as any)?.i ?? fila[qi]
        const restante = (curso as any)?.resta ?? minPdf(Math.max(1, (AS[i][3] || 60) - paginasFeitas216(E, i, cfg, fixos)), cfg.vel, P.velPadrao)
        // rev. 23: qualquer dia de estudo recebe PDFull; "outro dia completo" considera todos os dias ativos da semana
        const outroDiaCompleto = !curso && (R23 ? rotina.ativos : [...rotina.pdf]).some((data) => data > d && livre(data) >= restante)
        if (!outroDiaCompleto || livre(d) >= restante || repartirParaAvancar(d, livre(d))) ler(d, livre(d))
      }
      if (!temAcademico() && !fechou) fechar()
      distribuirRevisao()
      if (rotina.faixa === 2 && eDiaPDF && !fezQuestoes && livre(d) >= BLK) {
        const qu = questoes()[0]
        if (qu) { alocar(qu, d); ultimoTipoRevisao = 'qu' }
      }
      if (R23 && !fechou && metas.pf && !curso && qi < fila.length && livre(d) >= BLK) {
        // PDFull adicional na sobra (antes do LegProc); após a semana 4 pode ultrapassar o teto semanal inicial
        selecionarPDF(d)
        if (minutosLeitura(fila[qi]) <= livre(d) || (sem > R.retaFinal.semanaEncaixeExtra && repartirParaAvancar(d, livre(d)))) ler(d, livre(d), true)
      }
      blocoLP(d)
      blocoGX(d)
      blocoLP(d, true)
      blocoGX(d)
      if (carga[d]) fim = Math.max(fim, sem)
      continue
    }
    // Semana de revisão OBRIGATÓRIA (rotina ≤24h30): só PDFlashes (com cota diária) e questões pendentes; LegProc na sobra.
    if (!retaFinal && rev && revisaoObrigatoria300(cfg, sem, R)) {
      const diasRestantes = rotina.ativos.filter((data) => data >= d)
      const pendentes = candidatos('fl').filter((x) => elegivel(x, d)).length
      const cota = cotaPDFlash300(diasRestantes, livre, pendentes, R.constantes.cotaPdflashDuracaoMin)
      let revisoesHoje = 0, questoesHoje = 0
      // rev. 23: cota diária também para questões (distribuídas pelos dias) e alternância PDFlash ↔ questões
      const fimSemana = rotina.ativos[rotina.ativos.length - 1]
      const cotaQuestoes = R23 ? cotaPDFlash300(diasRestantes, (data) => livre(data) - (data === d ? R.constantes.cotaPdflashDuracaoMin * cota : 0), candidatos('qu').filter((x) => x.due <= fimSemana).length, 30) : Infinity
      let anterior: string | null = ultimoTipoRevisao
      while (livre(d) >= BLK) {
        const fl = revisoesHoje < cota && candidatos('fl').find((x) => elegivel(x, d) && x.minutos <= livre(d))
        const qu = (!R23 || questoesHoje < cotaQuestoes) && candidatos('qu').find((x) => elegivel(x, d) && x.minutos <= livre(d))
        const proxima: Devido | false | undefined = R23 && anterior === 'fl' ? qu || fl : fl || qu
        if (!proxima) break
        alocar(proxima, d)
        if (proxima.t === 'fl') revisoesHoje++; else questoesHoje++
        if (R23) anterior = ultimoTipoRevisao = proxima.t
      }
      blocoLP(d)
      blocoGX(d)
      blocoLP(d, true)
      blocoGX(d)
      if (carga[d]) fim = Math.max(fim, sem)
      continue
    }
    if (!fechou && !rev && curso && curso.resta <= livre(d)) ler(d, livre(d))
    if (rotina.faixa === 3 && !fechou && !rev && metas.pf && !curso && qi < fila.length) {
      // Faixa ≥25h: lê a aula inteira hoje se os retornos (revisão/questões) da semana ainda couberem nos demais dias.
      selecionarPDF(d)
      const restante = minutosLeitura(fila[qi])
      const depois = rotina.ativos.filter((data) => data > d)
      const fimSemana = rotina.ativos[rotina.ativos.length - 1]
      const retornos = devidos.filter((x) => x.due <= fimSemana)
      const questoesRet = retornos.filter((x) => x.t === 'qu').length
      const sobraHoje = livre(d) - restante
      const qpd = R23 && tetoInfo300(cfg, sem, R).equilibra ? R.equilibrio.questoesDia : R.constantes.questoesBaseDia // rev. 23: faixa 25h–35h comporta 2 questões por dia
      const vagasQuestoes = R23
        ? depois.reduce((n, data) => n + Math.min(qpd, Math.floor(livre(data) / BLK)), 0) + Math.min(qpd, Math.floor(sobraHoje / BLK))
        : depois.filter((data) => livre(data) >= BLK).length + (sobraHoje >= BLK ? 1 : 0)
      if (sobraHoje >= 0 && retornos.reduce((t, x) => t + x.minutos, 0) <= sobraHoje + depois.reduce((t, data) => t + livre(data), 0) &&
          questoesRet <= vagasQuestoes) ler(d, restante)
    }
    const idsQu = Object.keys(plano).filter((id) => familiaMeta(id) === 'qu' && plano[id][0] === d)
    // rev. 23: faixa 25h–35h equilibra retornos (≤2 revisões e ≤2 questões por dia, pela cota dos dias restantes); reta final libera questões
    const equilibrar = R23 && tetoInfo300(cfg, sem, R).equilibra
    const diasParaRetorno = rotina.ativos.filter((data) => data >= d)
    const ultData = diasParaRetorno[diasParaRetorno.length - 1]
    const limiteRetorno = (tipo: string, duracao: number) => Math.min(R.equilibrio.retornosDiaMax, Math.max(1, cotaPDFlash300(diasParaRetorno, livre, candidatos(tipo).filter((x) => x.due <= ultData).length, duracao)))
    const limQu = equilibrar ? limiteRetorno('qu', 30) : retaFinal ? Infinity : R.constantes.questoesBaseDia + herancas
    const limFl = equilibrar ? limiteRetorno('fl', 60) : Infinity
    let revisoesDia = idsDoDia(d).filter((id) => familiaMeta(id) === 'fl').length
    // O primeiro PDFull tem precedência; protege os compromissos vencidos quando há tempo para ambos.
    for (const x of candidatos('fl')) if (revisoesDia < limFl && elegivel(x, d) && livre(d) >= x.minutos) { alocar(x, d); revisoesDia++ }
    let feitasQu = idsQu.length, usouHeranca = 0
    for (const x of candidatos('qu')) if (elegivel(x, d) && feitasQu < limQu && livre(d) >= x.minutos) { alocar(x, d); feitasQu++; if (feitasQu > 1) usouHeranca++ }
    const temRetornoPendente = !retaFinal && equilibrar && devidos.some((x) => elegivel(x, d))
    if (!fechou && !rev && metas.pf && (curso || (!temRetornoPendente && qi < fila.length))) {
      selecionarPDF(d)
      const restante = (curso as any)?.resta ?? minutosLeitura(fila[qi])
      const inteiroDepois = !curso && rotina.ativos.some((data) => data > d && livre(data) >= restante && (livre(d) < 60 || rotina.fimDeSemana.has(data)))
      if (!inteiroDepois || livre(d) >= restante) ler(d, livre(d))
    }
    herancas = Math.max(0, herancas - usouHeranca)
    // Só cria herança se havia uma meta elegível e a capacidade realmente impediu o encaixe diário.
    if (feitasQu === 0 && candidatos('qu').some((x) => elegivel(x, d)) && livre(d) < BLK) herancas++
    if (!temAcademico() && !fechou) fechar()
    if (!fechou && !rev && (rotina.faixa === 3 || retaFinal) && !temRetornoPendente && livre(d) >= BLK) {
      const i = (curso as any)?.i ?? fila[qi], restante = i == null ? Infinity : ((curso as any)?.resta ?? minutosLeitura(i))
      if (restante <= livre(d)) ler(d, livre(d))
    }
    if (retaFinal) {
      // rev. 23 — reta final: usa todos os dias; PDFlash/questões entram no mesmo dia da leitura e PDFulls restantes ocupam a sobra
      while (livre(d) >= BLK) {
        const fl = revisoesDia < limFl && candidatos('fl').find((x) => elegivel(x, d) && x.minutos <= livre(d))
        const qu = feitasQu < limQu && candidatos('qu').find((x) => elegivel(x, d) && x.minutos <= livre(d))
        if (fl) { alocar(fl, d); revisoesDia++; continue }
        if (qu) { alocar(qu, d); feitasQu++; continue }
        if (!metas.pf || (!curso && qi >= fila.length)) break
        selecionarPDF(d)
        if (!ler(d, livre(d))) break
      }
    }
    if (R23 && !retaFinal && !rev && sem > R.retaFinal.semanaEncaixeExtra && metas.pf && !curso && qi < fila.length && livre(d) >= BLK) {
      // após a semana 4: PDFull inteiro na sobra pode ultrapassar o teto semanal inicial (se houver capacidade p/ os retornos do ciclo)
      selecionarPDF(d)
      if (minutosLeitura(fila[qi]) <= livre(d)) ler(d, livre(d), true)
    }
    blocoLP(d, false)
    blocoGX(d)
    blocoLP(d, true)
    blocoGX(d)
    if (carga[d]) fim = Math.max(fim, sem)
  }
  const residuo = temAcademico() || (fechou && lp.some((x) => leisFinais.has(chaveLei(x)))) || (gx.length > 0 && (!gxComRegras || gx.some((x) => !R.tiposGx[x.slug])))
  if (residuo) throw new ErroInsuficiencia('O plano ultrapassa ' + MAX + ' semanas com a disponibilidade atual. Nenhuma alteração foi aplicada. Aumente as horas ou reduza as matérias; ainda há metas sem data.')
  return { plano, detalhes, fim, legprocRestantes: lp.map((x) => x.id) }
}

// ── dominó ──────────────────────────────────────────────────────────────────────────────────────────
/** Limite diário de LegProc do modelo 3.0 (a ÚLTIMA definição do HTML vence): até 4 metas, no máx. 2 da mesma lei e 2 leis distintas por dia. */
const permitirLegproc300 = (id: string, idsDia: string[], metaDe: (id: string) => ItemLP | undefined, R: RegrasMotor): boolean => {
  const m = metaDe(id); if (!m || idsDia.length >= R.legproc.metasDiaMax) return false
  const lei = chaveLei(m), leis = new Set(idsDia.map((k) => chaveLei(metaDe(k))))
  return idsDia.filter((k) => chaveLei(metaDe(k)) === lei).length < R.legproc.mesmaLei && (leis.has(lei) || leis.size < R.legproc.leisDistintas)
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
export interface DominoOpc { detalhes?: Record<string, Detalhe>; adiantarLP?: boolean; adiantarPDF?: boolean; movida?: { id: string; dia: DataISO } | null; rotinaOriginal?: Cfg28
  /** recálculo (gerarPlano): meta com tempo/ponto de parada registrado fica onde está (nunca some nem muda de data/horas). Ações do aluno (mover/parcial) NÃO usam. */
  fixarComDado?: boolean }
type FilaD = { id: string; t: string; data: DataISO; minutos: number; detalhe: Detalhe; seq: number }

function calcularDomino219Base(E: Env, fonte0: Plano, cfg: Cfg28 & Record<string, any>, desde: DataISO, opcoes: DominoOpc = {}): { plano: Plano; detalhes: Record<string, Detalhe>; fim: number } {
  const AS = E.AS, P = E.P, R = E.R, BLK = R.constantes.blocoMin, MAX = P.maxSemanas
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
  const disciplinaMeta = (id: string) => tipoEstudo(id) === 'lp' ? E.lpMap.get(id)?.disc : tipoEstudo(id) === 'gx' ? E.gxMap.get(id)?.disc : AS[indiceAula(id)]?.[0]
  const leiMeta = (id: string) => { const lp = E.lpMap.get(id); return chaveLei(lp) || (lp?.disc + '|meta:' + id) }
  let sequencia = 0
  for (const [id, [data, h]] of Object.entries(fonte)) {
    const t = tipoEstudo(id), minutos = Math.round(h * 60)
    if (feito(E, id) || data < desde || (opcoes.fixarComDado && comDado(E, id))) { colocar(id, [data, h]); continue }
    const disc = disciplinaMeta(id), meta = t === 'pp' ? 'pf' : t === 'rf' ? 'fl' : t === 'rq' ? 'qu' : t
    const esp = metaRevisao217(id, detalhes) && ((disc != null && cfg.discs.includes(disc)) || (disc != null && ESSENCIAIS.includes(disc)))
    // Revisão obrigatória: PDFlash de essencial externa (rf) não existe mais — limpa o que sobrou de um plano anterior.
    if (t === 'rf' && !(disc != null && cfg.discs.includes(disc)) && revisaoObrigatoria300(cfg, semDe(cfg.start, data), R)) continue
    const metaLigada = t === 'gx' ? (cfg.metas as Record<string, boolean | undefined>).gx !== false : !!(cfg.metas as Record<string, boolean | undefined>)[meta]
    if ((!disc || !cfg.discs.includes(disc) || !metaLigada) && !esp && !((questoesHistorico(id) || reforcoHistorico(id)) && disc && cfg.discs.includes(disc))) continue
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
  let inicioMovida: DataISO | null = null, semanaRotina = 0, rotina!: Rotina300, ultimoTipoRevisao: string | null = null, cotaFlash = Infinity, flashHoje = 0, retaFinal = false
  const R23 = regra23(cfg) // regra da ref. rev. 23 só vale para planos com cfg.motor >= 3.2.0
  const semanasIniciadas = new Map<string, number>() // pai da leitura → semana em que começou (rev. 23: não pode atravessar semanas)
  const temPDF = (d: DataISO) => fila.some((x) => ehPdf(x.t) && !metaRevisao217(x.id, detalhes) && x.data <= d)
  const novosDia = memoDia((d: DataISO) => novosPDFDia27(plano, cfg, d, detalhes).size)
  const limiteDia = memoDia((d: DataISO) => limitePDF27(E, cfg, d, plano))
  const cont = (id: string, d: DataISO) => continuacaoPDF216(E, cfg, id, d, plano, detalhes, pdfPorAula)
  const prioridade = (x: FilaD, d: DataISO): number => {
    if (ehPdf(x.t) && cont(x.id, d)) return -3
    if (opcoes.movida?.id === x.id && opcoes.movida.dia === d) return -2
    if (ehPdf(x.t) && ((x.data > d) || (pdfsDia(d).size > 0 && !pdfsDia(d).has(indiceAula(x.id))))) return R.constantes.prioridadesDomino.rebaixada
    if (x.t === 'lp') return R.prioridades.porTipo.lp ?? R.prioridades.outros // LegProc: ÚLTIMA prioridade em todas as faixas
    if (x.t === 'gx') return E.gxMap.get(x.id)?.prioridade ?? R.prioridades.outros // tipos personalizados: prioridade do catálogo
    if (rotina.faixa < 3 && !L.ehRev(cfg, semanaRotina, R)) {
      if (R23 && ehPdf(x.t) && !rotina.pdf.has(d)) return R.constantes.prioridadesDomino.rebaixada
      if (rotina.revisao.has(d) && ['fl', 'qu'].includes(x.t)) return x.t === ultimoTipoRevisao ? R.constantes.prioridadesDomino.revisaoRepetida : R.constantes.prioridadesDomino.revisaoDia
      if (x.t === 'qu' && rotina.pdf.has(d)) return R.constantes.prioridadesDomino.rebaixada
    }
    if (rotina.faixa === 3 && !L.ehRev(cfg, semanaRotina, R)) {
      if (x.t === 'fl') return R.prioridades.faixa3.fl
      if (x.t === 'qu') return R.prioridades.faixa3.qu
      if (ehPdf(x.t)) return R.prioridades.faixa3.pdf
    }
    return R.prioridades.porTipo[x.t] ?? R.prioridades.outros
  }
  const liberar = (x: FilaD, d: DataISO): boolean => {
    if (R.restricoes.length) {
      const c = {
        idsDoDia, dataDe: (k: string) => plano[k]?.[0], faixa: rotina.faixa, pai: (k: string) => detalhes[k]?.pai || (k.startsWith('pp:') ? 'pf:' + indiceAula(k) : k),
        haOutrosPendentes: (fam: FamiliaRestricao) => fila.some((y) => y !== x && y.t !== 'lp' && y.t !== 'gx' && familiaDoTipo(y.t) !== fam),
      }
      if (!E.rastro) { if (restricaoBloqueia(R.restricoes, x.id, d, c)) return false }
      else { const r = restricaoQueBloqueia(R.restricoes, x.id, d, c); if (r) { E.rastro.reg(x.id, 'restricao', () => `${rotuloMeta(x.id)} barrado por restrição: ${r.rotulo || descreverRestricao(r)}`, d); return false } }
    }
    const semana = semDe(cfg.start, d), esp = metaRevisao217(x.id, detalhes)
    if (R23) {
      // até 2 PDFulls distintos / 2 revisões / 2 questões por dia
      if (!cabeTipoNoDia300(idsDoDia(d), detalhes, x.id, x.detalhe.pai, R)) { E.rastro?.reg(x.id, 'limite_dia', () => textoLimiteDia(x.id, R), d); return false }
      if (ehPdf(x.t)) {
        const pai = x.detalhe.pai || x.id
        // a leitura não atravessa semanas e só começa se o saldo couber (≤3 datas) hoje + nos melhores dias restantes da semana
        if (semanasIniciadas.has(pai) && semanasIniciadas.get(pai) !== semana) return false
        const partes = new Set((pdfPorAula.get(indiceAula(x.id)) || []).filter((id) => (detalhes[id]?.pai || id) === pai).map((id) => plano[id][0]))
        partes.delete(d)
        const saldo = capacidade(d) - ocupado(d)
        const total = x.minutos + fila.filter((y) => y !== x && ehPdf(y.t) && (y.detalhe.pai || y.id) === pai).reduce((n, y) => n + y.minutos, 0)
        if (!cabeSaldoNaSemana300(total, saldo, partes.size, rotina.ativos.filter((data) => data > d), (data) => capacidade(data) - ocupado(data), R)) return false
      }
    }
    if (esp && !L.ehRev(cfg, semana, R)) return false
    if (R23) {
      if (!retaFinal && (x.t === 'qu' || x.t === 'rq') && revisaoObrigatoria300(cfg, semana, R) && !L.ehRev(cfg, semana, R)) return false
      if (tetoInfo300(cfg, semana, R).equilibra && (x.t === 'fl' || x.t === 'rf') && idsDoDia(d).filter((k) => familiaMeta(k) === 'fl').length >= R.equilibrio.flashesDia) return false
    }
    if (x.t === 'fl' && !esp && flashHoje >= cotaFlash && opcoes.movida?.id !== x.id) return false // cota diária de PDFlash (revisão obrigatória)
    if (x.t === 'rf' && !(disciplinaMeta(x.id) != null && cfg.discs.includes(disciplinaMeta(x.id) as string)) && revisaoObrigatoria300(cfg, semana, R)) return false
    if (esp && opcoes.movida?.id !== x.id && Number.isFinite(x.detalhe.ordemAlternancia)) {
      const origem = x.detalhe.semanaOrigemRevisao || semDe(cfg.start, x.data)
      if (fila.some((y) => y !== x && metaRevisao217(y.id, detalhes) && (y.detalhe.semanaOrigemRevisao || semDe(cfg.start, y.data)) === origem && (y.detalhe.ordemAlternancia as number) < (x.detalhe.ordemAlternancia as number))) return false
    }
    if (!retaFinal && rotina.faixa < 3 && !L.ehRev(cfg, semana, R) && !(opcoes.movida?.id === x.id && opcoes.movida.dia === d)) {
      const aquecimento = semana <= (cfg.metas.qu ? R.rotina.aquecimentoComQuestoes : cfg.metas.fl ? R.rotina.aquecimentoSoRevisao : 0)
      const diaPDF = rotina.pdf.has(d), diaRevisao = rotina.revisao.has(d)
      if (!R23 && ehPdf(x.t) && !diaPDF && !x.detalhe.continuacao && !(aquecimento && diaRevisao)) return false // rev. 23: qualquer dia de estudo recebe PDFull
      if (x.t === 'fl' && !diaRevisao) return false
      if (x.t === 'qu' && !diaRevisao && !(rotina.faixa === 2 && diaPDF)) return false
      if (x.t === 'lp' && !diaPDF && !aquecimento && temPDF(d)) return false
    }
    if (!retaFinal && ehPdf(x.t) && L.ehRev(cfg, semana, R) && !esp && !x.detalhe.continuacao) return false
    // Leitura inteira: não divide se (nesta ou nas 3 semanas seguintes) há dia de leitura com capacidade para a aula toda.
    if (ehPdf(x.t) && !esp && !L.ehRev(cfg, semana, R) && !x.detalhe.continuacao && !cont(x.id, d) && x.id !== opcoes.movida?.id &&
        x.minutos > capacidade(d) - ocupado(d) && !(R23 && (retaFinal || revisaoObrigatoria300(cfg, semana, R)) && capacidade(d) - ocupado(d) >= R.divisao.sobraMinAvancarMin) &&
        temDiaInteiro300(cfg, d, x.minutos, capacidade, retaFinal, R)) return false
    if (ehPdf(x.t) && !cont(x.id, d) && pdfsDia(d).size > 0 && !pdfsDia(d).has(indiceAula(x.id)) && opcoes.movida?.id !== x.id && x.minutos > capacidade(d) - ocupado(d)) return false
    if (x.t === 'qu' || x.t === 'rq') {
      const nQu = idsDoDia(d).filter((k) => familiaMeta(k) === 'qu').length
      if (nQu >= limiteQuestoes216) return false
    }
    const adiantar = d === desde && ((opcoes.adiantarLP && x.t === 'lp') || (opcoes.adiantarPDF && ehPdf(x.t)))
    // LegProc regular (sem continuação/remanejo/movida) pode ser ANTECIPADO para a sobra de um dia anterior.
    const legprocDeSobra = x.t === 'lp' && !x.detalhe.continuacao && !cfg.remanejadas?.[x.id] && (!opcoes.movida || opcoes.movida.id !== x.id)
    // rev. 23 — reta final: PDFull/PDFlash/questões regulares podem ser ANTECIPADOS para a sobra (exceto remanejados e a meta movida)
    const anteciparFinal = retaFinal && !cfg.remanejadas?.[x.id] && opcoes.movida?.id !== x.id && !esp &&
      (ehPdf(x.t) || (R.adaptacao.antecipaRetornoAtivo && (x.t === 'fl' || x.t === 'qu') && !questoesHistorico(x.id) && !reforcoHistorico(x.id)))
    if (x.data > d && !adiantar && !legprocDeSobra && !anteciparFinal) return false
    const i = indiceAula(x.id)
    if (ehPdf(x.t)) {
      const resto = x.detalhe.continuacao || (cfg.paginasLidas?.[i] || 0) > 0 || (cfg.partesLidas?.[i] || 0) > 0 || (pdfPorAula.get(i) || []).some((id) => plano[id][0] < d)
      if (!retaFinal && !resto && !esp && !reforcoHistorico(x.id) && iniciosPDF300(cfg, plano, detalhes, semana) >= tetoPDF300(cfg, semana, R)) { E.rastro?.reg(x.id, 'teto_semana', () => `${rotuloMeta(x.id)} adiado: teto de ${tetoPDF300(cfg, semana, R)} PDFull(s) novo(s) por semana (faixa ${rotina.faixa}) atingido na semana ${semana}.`, d); return false }
      if (!retaFinal && !resto && !pdfsDia(d).has(i) && novosDia(d) >= limiteDia(d)) { E.rastro?.reg(x.id, 'limite_novos_dia', () => `${rotuloMeta(x.id)} adiado: limite de ${limiteDia(d)} PDFull(s) novo(s) por dia atingido.`, d); return false }
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
      if (plano[pai]) { const ideal = retaFinal ? plano[pai][0] : revisaoObrigatoria300(cfg, semana, R) && podeAnteciparRetorno300(cfg, plano[pai][0], d, x.t, R) ? d : L.proxSemConteudo(cfg, plano[pai][0], x.t === 'fl' ? P.offsetRevisao : P.offsetQuestoes, R); if (d < ideal) return false }
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
      if (!permitirLegproc300(x.id, ids, (k) => E.lpMap.get(k), R)) return false
      if (!x.detalhe.continuacao && !ordemRodizio25().includes(disciplinaMeta(x.id) as string)) return false
      const rank = E.lpPos.get(x.id) ?? -1
      if (fila.some((y) => y !== x && y.t === 'lp' && disciplinaMeta(y.id) === disciplinaMeta(x.id) && (E.lpPos.get(y.id) ?? -1) < rank)) return false
    }
    return true
  }
  let fim = Math.max(1, semDe(cfg.start, desde))
  for (let k = 0, d = desde; k < MAX * 7 && fila.length; k++, d = dAdd(d, 1)) {
    const sem = semDe(cfg.start, d)
    ativarSemana(E, opcoes.rotinaOriginal || cfg, sem)
    if (sem !== semanaRotina) { semanaRotina = sem; rotina = rotina300(opcoes.rotinaOriginal || cfg, sem, desde, R) }
    let livre = capacidade(d) - ocupado(d); const revObrig = L.ehRev(cfg, sem, R) && revisaoObrigatoria300(cfg, sem, R)
    limiteQuestoes216 = revObrig ? Infinity : R23 && tetoInfo300(cfg, sem, R).equilibra ? R.equilibrio.questoesDia : R.constantes.questoesBaseDia + (rotina.faixa === 3 || L.ehRev(cfg, sem, R) ? quAdiados.size : 0); if (livre <= 0) continue
    if (R23) {
      // reta final do reagendamento: restam ≤2 (≤4 após a semana 4) tetos de PDFull nas leituras pendentes
      const restantes = new Set(fila.filter((x) => ehPdf(x.t) && !metaRevisao217(x.id, detalhes) && !reforcoHistorico(x.id)).map((x) => indiceAula(x.id)))
      retaFinal = retaFinal || faseFinal300(cfg, sem, restantes.size, R)
    }
    flashHoje = 0
    cotaFlash = !retaFinal && revObrig ? cotaPDFlash300(rotina.ativos.filter((data) => data >= d), (data) => capacidade(data) - ocupado(data), fila.filter((x) => x.t === 'fl' && !metaRevisao217(x.id, detalhes) && semDe(cfg.start, x.data) <= sem).length) : Infinity
    while (livre > 0) {
      const disponiveis = fila.filter((x) => liberar(x, d) && (ehPdf(x.t) || x.minutos <= livre)).sort((a, b) => prioridade(a, d) - prioridade(b, d) || (ehPdf(a.t) && ehPdf(b.t) && !a.detalhe.continuacao && !b.detalhe.continuacao && !a.detalhe.reforco && !b.detalhe.reforco ? (ordem.get(indiceAula(a.id)) ?? 1e9) - (ordem.get(indiceAula(b.id)) ?? 1e9) : 0) || (a.t === 'lp' && b.t === 'lp' ? rankRodizio25(a, d) - rankRodizio25(b, d) : 0) || (a.t === 'gx' && b.t === 'gx' ? (E.gxMap.get(a.id)?.ordem ?? 0) - (E.gxMap.get(b.id)?.ordem ?? 0) : 0) || a.data.localeCompare(b.data) || a.seq - b.seq)
      const x = disponiveis[0]; if (!x) break
      if (opcoes.movida?.id === x.id && !inicioMovida) inicioMovida = d
      let m = Math.min(x.minutos, livre)
      if (ehPdf(x.t)) {
        const outros = fila.filter((y) => y !== x && liberar(y, d) && ['fl', 'rf', 'qu', 'rq'].includes(y.t))
        const rv = outros.find((y) => y.t === 'fl' || y.t === 'rf'), qu = outros.find((y) => y.t === 'qu' || y.t === 'rq')
        let reserva = (rv?.minutos || 0) + (qu?.minutos || 0)
        if (R23 || !metaRevisao217(x.id, detalhes)) reserva = 0
        if (livre - reserva >= BLK) m = Math.min(m, Math.floor((livre - reserva) / BLK) * BLK)
        else m = Math.min(m, Math.floor(livre / BLK) * BLK)
        const pai = x.detalhe.pai || x.id
        const partes = new Set(Object.keys(plano).filter((id) => ehPdf(tipoEstudo(id)) && (detalhes[id]?.pai || id) === pai).map((id) => plano[id][0]))
        partes.add(d)
        if (partes.size > R.divisao.maxDatas || (partes.size === R.divisao.maxDatas && m < x.minutos) || m < BLK) break
      }
      if (x.t === 'fl' && !metaRevisao217(x.id, detalhes)) flashHoje++
      if (x.t === 'fl' || x.t === 'qu') ultimoTipoRevisao = x.t
      if ((x.t === 'qu' || x.t === 'rq') && quAdiados.size) quAdiados.delete([...quAdiados][0])
      if (x.t === 'lp') rodizioDomino25.avancar(disciplinaMeta(x.id))
      if (ehPdf(x.t) && m < x.minutos) {
        const i = indiceAula(x.id), id = 'pp:' + i + ':' + (contadores[i] = (contadores[i] || 0) + 1)
        const md: Detalhe = { ...x.detalhe, origem: x.detalhe.origem || x.id, pai: x.detalhe.pai || 'pf:' + i }
        const pags = Math.max(0, (md.paginaFim || 0) - (md.paginaInicio || 1) + 1), lidas = Math.floor(pags * m / x.minutos)
        md.paginaFim = (md.paginaInicio || 1) + lidas - 1
        colocar(id, [d, m / 60]); detalhes[id] = md
        x.detalhe = { ...x.detalhe, paginaInicio: md.paginaFim + 1, ...(R23 ? { continuacao: true } : {}) }
        x.minutos -= m; x.data = dAdd(d, 1); x.detalhe.deslocada = true
      } else {
        colocar(x.id, [d, m / 60]); detalhes[x.id] = { ...x.detalhe, deslocada: d !== x.data || x.detalhe.deslocada }; fila.splice(fila.indexOf(x), 1)
      }
      if (R23 && ehPdf(x.t)) semanasIniciadas.set(x.detalhe.pai || x.id, sem)
      livre -= m; fim = Math.max(fim, semDe(cfg.start, d))
    }
    if (capacidade(d) > 0 && !idsDoDia(d).some((id) => familiaMeta(id) === 'qu') && capacidade(d) - ocupado(d) < BLK) { const q = fila.find((x) => (x.t === 'qu' || x.t === 'rq') && liberar(x, d)); if (q) quAdiados.add(q.id) }
  }
  if (fila.length) throw Error('Não há disponibilidade suficiente para redistribuir todas as metas. Ajuste a rotina de estudo e tente novamente.')
  for (const [d] of Object.values(plano)) fim = Math.max(fim, semDe(cfg.start, d))
  if (opcoes.movida && inicioMovida !== opcoes.movida.dia) throw Error('A meta não pode começar nesse dia com as horas disponíveis e a ordem de estudo. Escolha outro dia.')
  return { plano, detalhes, fim }
}

/**
 * Dominó DESLIGADO (regras.adaptacao.dominoAtivo = false): NÃO refluxa o plano. Só adia o que o aluno pediu — a meta movida vai para o dia
 * escolhido e as pendentes (não feitas) de dias anteriores a `desde` passam para o próximo dia de estudo; o resto fica onde estava.
 * Consequência assumida: não há reorganização da fila, teto semanal nem limites diários sobre as metas adiadas (podem sobrecarregar um dia).
 */
function adiarSemDomino(E: Env, fonte: Plano, cfg: Cfg28 & Record<string, any>, desde: DataISO, opcoes: DominoOpc) {
  const plano: Plano = {}, detalhes: Record<string, Detalhe> = copiar(opcoes.detalhes || E.det)
  const proximo = L.proximoEstudo(cfg, desde) || desde
  let fim = semDe(cfg.start, desde)
  for (const [id, v] of Object.entries(fonte)) {
    let alvo = v[0]
    if (opcoes.movida?.id === id) alvo = opcoes.movida.dia
    else if (!feito(E, id) && v[0] < desde && !ehJuris219(id)) alvo = proximo
    plano[id] = [alvo, v[1]]
    if (alvo !== v[0]) { detalhes[id] = { ...(detalhes[id] || {}), deslocada: true }; E.rastro?.reg(id, 'adiada_sem_domino', () => `${rotuloMeta(id)} apenas adiado de ${v[0]} para ${alvo} (dominó desligado: sem refluxo das demais metas).`, alvo) }
    fim = Math.max(fim, semDe(cfg.start, alvo))
  }
  return { plano, detalhes, fim }
}

function calcularDominoE(E: Env, fonte: Plano, cfg: Cfg28 & Record<string, any>, desde: DataISO, opcoes: DominoOpc = {}) {
  if (!E.R.adaptacao.dominoAtivo) return adiarSemDomino(E, fonte, cfg, desde, opcoes)
  const normal: Plano = Object.fromEntries(Object.entries(fonte).filter(([id]) => !ehJuris219(id)))
  const passadas: Plano = Object.fromEntries(Object.entries(fonte).filter(([id, v]) => ehJuris219(id) && (v[0] < desde || feito(E, id) || (!!opcoes.fixarComDado && comDado(E, id)))))
  const semanasFixasJp = new Set(Object.values(passadas).map((v) => semDe(cfg.start, v[0])))
  const ultima = Object.values(fonte).reduce((d, v) => (v[0] > d ? v[0] : d), desde)
  let limite = Math.max(semDe(cfg.start, desde), semDe(cfg.start, ultima))
  const opts: DominoOpc = { ...opcoes, rotinaOriginal: cfg }; if (opts.movida && ehJuris219(opts.movida.id)) delete opts.movida
  for (let tentativa = 0; tentativa < 200; tentativa++) {
    const reduzida: Cfg28 & Record<string, any> = copiar(cfg), reservas: Plano = { ...passadas }; reduzida.horasPontuais = { ...(cfg.horasPontuais || {}) }
    for (let sem = Math.max(1, semDe(cfg.start, desde)); sem <= limite; sem++) {
      if (opcoes.fixarComDado && semanasFixasJp.has(sem)) continue // semana já tem jp com dado fixo: não reserva outra
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
  const R = resolverRegras(ctx), HZ = R.horizonte.maxSemanas
  const P = L.resolverParams({ ...(ctx.params || {}), maxSemanas: Math.min(HZ, Math.max(20, (ctx.params?.maxSemanas ?? HZ))) })
  const E = criarEnv(AS, LP, ctx, P)
  const baseData = ancora && ancora > cfg0.start ? ancora : cfg0.start
  const cfg: Cfg28 & Record<string, any> = copiar(cfg0)
  // Plano gerado/recalculado agora segue a regra vigente (VERSAO_MOTOR). Exceção: migração automática do servidor
  // (ctx.manterMotor) preserva o carimbo 3.x do plano gravado — planos antigos mantêm a regra deles até o aluno recalcular.
  cfg.motor = ctx.manterMotor && typeof cfg0.motor === 'string' && /^3\./.test(cfg0.motor) ? cfg0.motor : VERSAO_MOTOR
  aplicarBloqueioCfg(E, cfg); fixos = semBloqueadas(E, fixos)
  if (R.constantes.cargaMinimaMin > 0 && L.cargaSemanaMin(cfg, 0) < R.constantes.cargaMinimaMin) throw Error(`Selecione pelo menos ${textoHoras(R.constantes.cargaMinimaMin)} de estudo por semana.`)
  cfg.revisao ||= { ativa: true, cada: padraoDaFaixa(faixaInicial(cfg, R), R) }
  cfg.revisao.ativa = true // semana de revisão é OBRIGATÓRIA em todas as faixas (o "Não" foi removido)
  cfg.revisao.cada = normalizarCada(cfg.revisao.cada, true, R, faixaInicial(cfg, R))
  cfg.remanejadas = { ...L.remanejadasEfetivas(cfg, AS, fixos, baseData, P), ...(cfg.remanejadas || {}) }
  registrarReforcos216(E, cfg)
  // gerarPlanoCatalogo: metas "anteriores" (histórico declarado) saem dos fixos, exceto as concluídas; remanejadas ficam presas
  const presos: Plano = Object.fromEntries(Object.entries(fixos).filter(([id]) => !ehMetaAnterior(E, id, cfg) || feito(E, id)))
  for (const [id, r] of Object.entries(cfg.remanejadas as Record<string, Remanejada>)) {
    if (presos[id] || (metaBloqueada(E, id) && !feito(E, id)) || ehMetaAnterior(E, id, cfg) || (reforcoHistorico(id) && tipoEstudo(id) === 'pf' && !indicesAnteriores(E, cfg).has(indiceAula(id)))) continue
    const t = tipoEstudo(id), i = indiceAula(id)
    const disc = t === 'lp' ? E.lpMap.get(id)?.disc : t === 'gx' ? E.gxMap.get(id)?.disc : AS[i]?.[0]
    const tipo = t === 'pp' ? 'pf' : t === 'rf' ? 'fl' : t === 'rq' ? 'qu' : t
    const ligada = t === 'gx' ? (cfg.metas as Record<string, boolean | undefined>).gx !== false : !!(cfg.metas as Record<string, boolean | undefined>)[tipo]
    if ((!disc || !cfg.discs.includes(disc) || !ligada) && !((questoesHistorico(id) || reforcoHistorico(id)) && disc && cfg.discs.includes(disc))) continue
    presos[id] = [r.desde < baseData ? baseData : r.desde, r.minutos / 60]
  }
  const g = gerarPlanoBase30(E, cfg, presos, ancora)
  for (const id of Object.keys(cfg.remanejadas)) if (g.plano[id]) g.fim = Math.max(g.fim, semDe(cfg.start, g.plano[id][0]))
  let detalhes: Record<string, Detalhe> = { ...g.detalhes }
  for (const id of Object.keys(fixos)) if (E.det[id]) detalhes[id] = copiar(E.det[id])
  for (const [id, r] of Object.entries(cfg.remanejadas as Record<string, Remanejada>)) if (g.plano[id] && !feito(E, id)) detalhes[id] = { ...(r.detalhe || {}), pai: r.detalhe?.pai || id, geracao: r.geracao || null }
  const cfgAtualizada = { reforcosHistorico: cfg.reforcosHistorico, remanejadas: cfg.remanejadas, revisao: cfg.revisao }
  if (Object.keys(cfg.remanejadas).some((id) => g.plano[id] && !feito(E, id))) {
    const r = calcularDominoE(E, g.plano, cfg, baseData, { detalhes, fixarComDado: true })
    return { plano: r.plano, fim: r.fim, detalhes: r.detalhes, legprocRestantes: g.legprocRestantes, cfgAtualizada }
  }
  return { plano: g.plano, fim: g.fim, detalhes, legprocRestantes: g.legprocRestantes, cfgAtualizada }
}

/** Dominó público: re-fluxa um plano existente a partir de `desde` (não realizada, parcial, organizar atrasadas, ajustar horas, pausa). */
export function calcularDomino(fonte: Plano, cfg0: Cfg28, desde: DataISO, opcoes: DominoOpc, AS: AulaAS[], LP: ItemLP[], ctx: Contexto30 = {}) {
  const R = resolverRegras(ctx)
  const P = L.resolverParams({ ...(ctx.params || {}), maxSemanas: R.horizonte.maxSemanas })
  const E = criarEnv(AS, LP, ctx, P)
  const cfg: Cfg28 & Record<string, any> = copiar(cfg0)
  // O reagendamento (dominó) segue a regra do CARIMBO do plano: plano 3.1.x mantém a regra 3.1; só 3.2+ usa a ref. rev. 23.
  // Sem carimbo 3.x (cfg legado/sem motor) → regra 3.1 (comportamento anterior à rev. 23).
  cfg.motor = typeof cfg0.motor === 'string' && /^3\./.test(cfg0.motor) ? cfg0.motor : '3.1.0'
  aplicarBloqueioCfg(E, cfg); fonte = semBloqueadas(E, fonte)
  cfg.revisao ||= { ativa: true, cada: padraoDaFaixa(faixaInicial(cfg, R), R) }; cfg.revisao.ativa = true; cfg.revisao.cada = normalizarCada(cfg.revisao.cada, true, R, faixaInicial(cfg, R))
  return calcularDominoE(E, fonte, cfg, desde, opcoes)
}

/** Metas de LegProc ainda sem data nas disciplinas selecionadas (oferta de cronograma complementar ao fim da fila). */
export function pendenciasLegproc(cfg: Cfg28, LP: ItemLP[], plano: Plano, feitas: Iterable<string>): string[] {
  if (!cfg.metas.lp) return []
  const f = new Set(feitas), agendadas = new Set(Object.keys(plano).filter((id) => id.startsWith('lp:')))
  return (LP || []).filter((x) => cfg.discs.includes(x.disc) && !agendadas.has(x.id) && !f.has(x.id)).map((x) => x.id)
}

/** Metas 'gx' ainda sem data nas disciplinas selecionadas (análogo a pendenciasLegproc). */
export function pendenciasGx(cfg: Cfg28, GX: ItemGX[], plano: Plano, feitas: Iterable<string>): string[] {
  if ((cfg.metas as Record<string, boolean | undefined>).gx === false) return []
  const f = new Set(feitas)
  return normalizarGX(GX).filter((x) => cfg.discs.includes(x.disc) && !plano[x.id] && !f.has(x.id)).map((x) => x.id)
}

/** Expostos p/ testes/diagnóstico. */
export const _interno = { rankingRevisaoBase, criarEnv, gerarPlanoBase30, calcularDominoE, estudadas216, acertoTema }
