// Estado do aluno + helpers de índice (porte fiel do modelo "Cronograma Adaptativo 2.0").
// Opera sobre um Estado { cfg, plano, prog, notas, revs, pausa }, derivando o índice
// data→metas (IDX), as semanas de revisão (RV) e as metas atrasadas. Módulo PURO.

import {
  type Cfg, type Plano, type Notas, type DataISO,
  gerarPlano, descrever, semInicio, semDe, horasDia, ehRev, dAdd, dISO,
  planoRevisao, rankingRevisao, DUR_REVISAO, ORDEM,
} from './engine'
import type { Conteudo as _C } from './conteudo'

export interface ProgMeta {
  s?: 'done' | 'missed'
  modo?: string
  t?: number // tempo acumulado em segundos
  parou?: { v: string; em: DataISO } | null
}
export interface ExtraSessao { tipo: string; min: number; em: DataISO; disc?: string; nota?: string }

export interface Estado {
  v: 2
  cfg: Cfg
  plano: Plano
  fim: number
  prog: Record<string, ProgMeta>
  notas: Notas
  revs: Record<number, Array<[string, DataISO]>>
  pausa: { desde: DataISO } | null
  exemplo?: boolean
  extras?: ExtraSessao[]
}

export const hojeISO = (): DataISO => dISO(new Date())

/** Gera plano+fim a partir do cfg (engine puro). */
export function gerarEstadoPlano(cfg: Cfg, conteudo: _C, fixos?: Record<string, [DataISO, number]>, ancora?: DataISO | null) {
  const r = gerarPlano(cfg, conteudo.AS, conteudo.WLP, fixos || {}, ancora || null)
  return { plano: r.plano, fim: r.fim }
}

/** Monta uma semana de revisão: por tema, PDFlash/Flashcard (1h) + questões (30min), por dia. */
export function montarRevisao(st: Estado, conteudo: _C, sem: number): Array<[string, DataISO]> {
  const ini = semInicio(st.cfg.start, sem)
  const ja = new Set<number>()
  for (const [k, lista] of Object.entries(st.revs || {})) if (+k < sem) lista.forEach(([id]) => ja.add(+id.split(':')[2]))
  const fila = rankingRevisao(st.plano, st.notas, ini, ja)
  const dias = [0, 1, 2, 3, 4, 5, 6].map((k) => dAdd(ini, k)).filter((d) => d >= st.cfg.start && horasDia(st.cfg, d) > 0)
  const ocupado = (d: DataISO) => Object.entries(st.plano).filter(([, [x]]) => x === d).reduce((s, [, [, h]]) => s + h * 60, 0)
  const plano = planoRevisao(dias.map((d) => horasDia(st.cfg, d) * 60 - ocupado(d)), fila.length)
  const out: Array<[string, DataISO]> = []
  plano.forEach((p, k) => p.itens.forEach(({ t, n }) => out.push([`${t}:${sem}:${fila[n].i}`, dias[k]])))
  return out
}

export interface Indexado {
  IDX: Record<string, string[]>
  RV: Record<string, [DataISO, number]>
  RVORD: Record<string, number>
  revs: Record<number, Array<[string, DataISO]>>
  congelou: boolean
}

/** Índice data→ids + semanas de revisão materializadas. Puro: devolve revs atualizado (p/ o caller persistir). */
export function indexar(st: Estado, conteudo: _C, hoje: DataISO = hojeISO()): Indexado {
  const IDX: Record<string, string[]> = {}
  const RV: Record<string, [DataISO, number]> = {}
  const RVORD: Record<string, number> = {}
  const revs: Record<number, Array<[string, DataISO]>> = { ...(st.revs || {}) }
  let congelou = false
  for (let sem = 1; sem <= (st.fim || 1); sem++) {
    if (!ehRev(st.cfg, sem)) continue
    let lista = revs[sem]
    if (!lista) {
      lista = montarRevisao({ ...st, revs }, conteudo, sem)
      if (semInicio(st.cfg.start, sem) <= hoje && !st.exemplo) { revs[sem] = lista; congelou = true }
    }
    lista.forEach(([id, d], k) => { const t = id.split(':')[0]; if (DUR_REVISAO[t]) { RV[id] = [d, DUR_REVISAO[t] / 60]; RVORD[id] = k } })
  }
  for (const [id, [d]] of [...Object.entries(st.plano), ...Object.entries(RV)]) (IDX[d] ||= []).push(id)
  for (const d in IDX) IDX[d].sort((a, b) => (ORDEM[a.split(':')[0]] - ORDEM[b.split(':')[0]]) || ((a in RVORD && b in RVORD) ? RVORD[a] - RVORD[b] : a.localeCompare(b, 'en', { numeric: true })))
  return { IDX, RV, RVORD, revs, congelou }
}

export const estadoMeta = (st: Estado, id: string) => st.prog[id]?.s || ''
export const feito = (st: Estado, id: string) => estadoMeta(st, id) === 'done'
export const info = (id: string, conteudo: _C) => descrever(id, conteudo.AS, conteudo.WLP)

/** Metas atrasadas: antes de hoje (ou da pausa) e não concluídas. */
export function atrasadas(st: Estado, hoje: DataISO = hojeISO()): string[] {
  let h = hoje
  if (st.pausa && st.pausa.desde < h) h = st.pausa.desde
  return Object.entries(st.plano).filter(([id, [d]]) => d < h && !feito(st, id)).map(([id]) => id)
}

export const semAtual = (st: Estado, hoje: DataISO = hojeISO()) => Math.max(1, semDe(st.cfg.start, hoje))

/** cfg padrão e vazio (porte do modelo). */
export function cfgPadrao(todas: string[]): Cfg {
  return { start: hojeISO(), horas: [6, 6, 6, 6, 6, 4, 0], discs: [...todas], metas: { pf: true, fl: true, qu: true, lp: true } }
}
export function cfgVazia(essenciais: string[]): Cfg {
  return { start: hojeISO(), horas: [0, 0, 0, 0, 0, 0, 0], discs: [...essenciais], metas: { pf: true, fl: true, qu: true, lp: true }, arranjo: 'pdf', revModelo: 'pdflash', revisao: { ativa: true, cada: 12 } }
}
