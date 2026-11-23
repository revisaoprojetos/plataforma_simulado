import { describe, it, expect } from 'vitest'
import * as M30 from '../motor30'
import dados from '../catalogo-html.json'
import type { Cfg28, AulaAS, ItemLP, Plano } from '../motor28'

const CAT = dados as unknown as { aulas: Array<string[] | null>; ordem: number[]; ordemLP: number[]; legprocs: Array<{ disc: string; lei?: string; texto?: string }> }
const AS = CAT.aulas.map((a) => (a ? [...a] : ['', '', '', 0, '', ''])) as unknown as AulaAS[]
const LP = CAT.ordemLP.map((i) => ({ id: 'lp:1:' + i, disc: CAT.legprocs[i].disc, lei: CAT.legprocs[i].lei || '', texto: CAT.legprocs[i].texto || '' })) as unknown as ItemLP[]
const ESS9 = ['Direito Administrativo', 'Direito Constitucional', 'Direito Civil', 'Direito Financeiro', 'Processo Civil', 'Direito Tributário', 'Direito Ambiental', 'Direito do Trabalho', 'Processo do Trabalho']
const cfg = (o: Record<string, unknown> = {}): Cfg28 => ({ start: '2026-01-05', horas: [4, 4, 4, 4, 4, 0, 0], discs: ESS9, metas: { pf: true, fl: true, qu: true, lp: true }, arranjo: 'pdf', revisao: { ativa: true, cada: 8 }, ...o }) as unknown as Cfg28
const hoje = '2026-02-16'

// remanejada pendente = caminho que aciona o dominó dentro de gerarPlano (onde as metas com dado eram movidas/removidas)
const comRemanejada = (base: Plano): Record<string, unknown> => {
  const id = Object.keys(base).find((k) => /^qu:\d+$/.test(k) && base[k][0] >= hoje)!
  return { remanejadas: { [id]: { desde: base[id][0], minutos: 30, detalhe: {}, geracao: 1 } } }
}

function rodar(fixos: Plano, ctxExtra: Record<string, unknown>, c = cfg()) {
  return M30.gerarPlano(JSON.parse(JSON.stringify(c)), AS, LP, JSON.parse(JSON.stringify(fixos)), hoje, { ordem: CAT.ordem, hoje, ...ctxExtra })
}

describe('metas com dado registrado nunca somem nem mudam no recálculo', () => {
  it('jp:N legado com tempo (não concluída) fica na grade com a mesma data/horas', () => {
    const fixos: Plano = { 'jp:1': ['2026-02-20', 1], 'jp:2': ['2026-02-27', 1] }
    const prog = { 'jp:1': { t: 788, parou: null }, 'jp:2': { t: 1337, parou: null } }
    const r = rodar(fixos, { prog, usados: Object.keys(fixos) })
    expect(r.plano['jp:1']).toEqual(['2026-02-20', 1])
    expect(r.plano['jp:2']).toEqual(['2026-02-27', 1])
  }, 120000)
  it('com dominó (remanejada pendente): jp:N legado com tempo sobrevive', () => {
    const base = rodar({}, {})
    const c = cfg(comRemanejada(base.plano))
    const fixos: Plano = { 'jp:1': ['2026-02-20', 1], 'jp:2': ['2026-02-27', 1] }
    const r = rodar(fixos, { prog: { 'jp:1': { t: 788, parou: null }, 'jp:2': { t: 1337, parou: null } }, planoAtual: base.plano, detalhes: base.detalhes }, c)
    expect(r.plano['jp:1']).toEqual(['2026-02-20', 1])
    expect(r.plano['jp:2']).toEqual(['2026-02-27', 1])
  }, 120000)
  it('com dominó: pf parcial fixo não muda de data', () => {
    const base = rodar({}, {})
    const id = Object.keys(base.plano).filter((k) => /^pf:\d+$/.test(k) && base.plano[k][0] >= hoje).sort((a, b) => base.plano[a][0].localeCompare(base.plano[b][0]))[0]
    const fixos: Plano = { [id]: [...base.plano[id]] as [string, number] }
    const r = rodar(fixos, { prog: { [id]: { t: 0, parou: { v: 'x' } } }, planoAtual: base.plano, detalhes: base.detalhes }, cfg(comRemanejada(base.plano)))
    expect(r.plano[id]).toEqual(fixos[id])
  }, 120000)
  it('tipo jp bloqueado pelo admin: jp com tempo (não concluída) fica; jp sem dado sai', () => {
    const fixos: Plano = { 'jp:1': ['2026-02-20', 1], 'jp:2': ['2026-02-27', 1] }
    const r = rodar(fixos, { prog: { 'jp:1': { t: 788, parou: null } }, params: { tiposBloqueados: ['jp'] } })
    expect(r.plano['jp:1']).toEqual(['2026-02-20', 1])
    expect(r.plano['jp:2']).toBeUndefined()
  }, 120000)
  it('pf parcial (ponto de parada) fixo mantém a data', () => {
    const base = rodar({}, {})
    const id = Object.keys(base.plano).filter((k) => /^pf:\d+$/.test(k) && base.plano[k][0] >= hoje).sort((a, b) => base.plano[a][0].localeCompare(base.plano[b][0]))[0]
    const fixos: Plano = { [id]: [...base.plano[id]] as [string, number] }
    const r = rodar(fixos, { prog: { [id]: { t: 0, parou: { v: 'x' } } }, planoAtual: base.plano, detalhes: base.detalhes })
    expect(r.plano[id]).toEqual(fixos[id])
  }, 120000)
})
