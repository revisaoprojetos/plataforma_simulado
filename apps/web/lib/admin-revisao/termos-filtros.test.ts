import { describe, expect, it } from 'vitest'
import { calcularFacetasTermo, faixaDe, filtrarGruposTermo, opcoesDisciplina, varianteDe } from './termos-filtros'
import type { GrupoTermo } from './questoes-termos-tipos'

const g = (id: string, tipo: GrupoTermo['tipo'], confianca: GrupoTermo['confianca'], questoes: number, vars: { id: string; nome: string; paiId?: string; paiNome?: string }[]): GrupoTermo =>
  ({ id, tipo, confianca, score: 90, motivo: '', variantes: vars.map((v) => ({ ...v, questoes: 1 })), canonicaId: vars[0].id, nomeSugerido: vars[0].nome, questoes })

const G = [
  g('1', 'banca', 'alta', 0, [{ id: 'a', nome: 'CESPE' }, { id: 'b', nome: 'Cespe' }]),
  g('2', 'assunto', 'media', 50, [{ id: 'c', nome: 'x', paiId: 'd1', paiNome: 'Direito' }, { id: 'd', nome: 'X', paiId: 'd1', paiNome: 'Direito' }]),
  g('3', 'assunto', 'baixa', 2000, [{ id: 'e', nome: 'y', paiId: 'd2', paiNome: 'Civil' }, { id: 'f', nome: 'Y', paiId: 'd2', paiNome: 'Civil' }, { id: 'h', nome: 'y.', paiId: 'd2', paiNome: 'Civil' }, { id: 'i', nome: 'y ', paiId: 'd2', paiNome: 'Civil' }]),
]

describe('termos-filtros', () => {
  it('faixas e variantes', () => {
    expect(faixaDe(0)).toBe('0'); expect(faixaDe(10)).toBe('1-10'); expect(faixaDe(11)).toBe('11-100'); expect(faixaDe(5000)).toBe('1001+')
    expect(varianteDe(2)).toBe('2'); expect(varianteDe(7)).toBe('4+')
  })
  it('filtra E entre dimensões e OU dentro', () => {
    expect(filtrarGruposTermo(G, { tipo: ['assunto'] }).map((x) => x.id)).toEqual(['2', '3'])
    expect(filtrarGruposTermo(G, { tipo: ['assunto'], disciplina: ['d2'] }).map((x) => x.id)).toEqual(['3'])
    expect(filtrarGruposTermo(G, { faixa: ['0', '1-10'] }).map((x) => x.id)).toEqual(['1'])
    expect(filtrarGruposTermo(G, {})).toHaveLength(3)
  })
  it('facetas ignoram a própria dimensão', () => {
    const f = calcularFacetasTermo(G, { tipo: ['banca'] })
    expect(f.tipo).toEqual({ banca: 1, assunto: 2 }) // a própria dimensão não se auto-filtra
    expect(f.confianca).toEqual({ alta: 1 })
    expect(f.variantes).toEqual({ '2': 1 })
  })
  it('opções de disciplina', () => {
    expect(opcoesDisciplina(G).map((o) => o.label)).toEqual(['Civil', 'Direito'])
  })
})
