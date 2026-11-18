import { describe, expect, it } from 'vitest'
import { celulaCsv, dataValida, filtrosParaParams, lerFiltrosHistorico, montarCsv, normalizarEspecificacao, normalizarIdsLote, periodoBrtParaIso, temEspecificacao, urlSegura } from './atualizacoes-filtros'

const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'

describe('lerFiltrosHistorico', () => {
  it('aceita só valores válidos e troca período invertido', () => {
    const f = lerFiltrosHistorico({ tipo: 'legislacao', de: '2026-11-20', ate: '2026-11-01', reg: U1, sort: 'tipo', dir: 'asc', q: ' lei ' })
    expect(f).toMatchObject({ tipo: 'legislacao', de: '2026-11-01', ate: '2026-11-20', registrador: U1, sort: 'tipo', dir: 'asc', q: 'lei' })
  })
  it('descarta lixo', () => {
    const f = lerFiltrosHistorico({ tipo: 'xx', de: '2026-02-31', reg: 'nao-uuid', sort: 'senha' })
    expect(f).toMatchObject({ tipo: null, de: null, registrador: null, sort: 'quando', dir: 'desc' })
  })
  it('filtrosParaParams só leva os preenchidos', () => {
    const p = filtrosParaParams(lerFiltrosHistorico({ tipo: 'correcao' }), { aba: 'hist' })
    expect(p.tipo).toBe('correcao'); expect(p.sort).toBeUndefined(); expect(p.aba).toBe('hist')
  })
})

describe('periodoBrtParaIso', () => {
  it('fim é exclusivo (00:00 BRT do dia seguinte)', () => {
    expect(periodoBrtParaIso('2026-11-01', '2026-11-30')).toEqual({ ini: '2026-11-01T03:00:00.000Z', fim: '2026-12-01T03:00:00.000Z' })
  })
  it('virada de mês/ano e vazio', () => {
    expect(periodoBrtParaIso(null, '2026-12-31').fim).toBe('2027-01-01T03:00:00.000Z')
    expect(periodoBrtParaIso(null, null)).toEqual({ ini: null, fim: null })
  })
  it('dataValida recusa dia inexistente', () => { expect(dataValida('2026-02-31')).toBeNull(); expect(dataValida('2026-02-28')).toBe('2026-02-28') })
})

describe('especificação', () => {
  it('urlSegura só http/https', () => {
    expect(urlSegura('javascript:alert(1)')).toBeNull()
    expect(urlSegura('https://planalto.gov.br/lei')).toContain('https://planalto.gov.br')
  })
  it('normaliza e valida', () => {
    const r = normalizarEspecificacao({ fonteOrigem: ' Lei 15.000/2026 ', fonteUrl: '', trechoAfetado: '', avisarJaBaixou: true })
    expect(r).toEqual({ ok: true, espec: { fonteOrigem: 'Lei 15.000/2026', fonteUrl: null, trechoAfetado: null, avisarJaBaixou: true } })
    expect(normalizarEspecificacao({ fonteUrl: 'ftp://x' }).ok).toBe(false)
    expect(normalizarEspecificacao({ trechoAfetado: 'x'.repeat(301) }).ok).toBe(false)
  })
  it('temEspecificacao', () => {
    expect(temEspecificacao({ fonteOrigem: null, fonteUrl: null, trechoAfetado: null, avisarJaBaixou: false })).toBe(false)
    expect(temEspecificacao({ fonteOrigem: null, fonteUrl: null, trechoAfetado: null, avisarJaBaixou: true })).toBe(true)
  })
})

describe('normalizarIdsLote', () => {
  it('dedupe, filtra inválidos e limita', () => {
    expect(normalizarIdsLote([U1, U1.toUpperCase(), 'x', U2])).toEqual({ ids: [U1, U2], excedeu: false })
    expect(normalizarIdsLote('nao-array')).toEqual({ ids: [], excedeu: false })
  })
  it('sinaliza excesso', () => {
    const muitos = Array.from({ length: 5 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`)
    expect(normalizarIdsLote(muitos, 3)).toMatchObject({ excedeu: true, ids: muitos.slice(0, 3) })
  })
})

describe('CSV', () => {
  it('escapa aspas, separador e fórmulas', () => {
    expect(celulaCsv('a;b')).toBe('"a;b"')
    expect(celulaCsv('diz "oi"')).toBe('"diz ""oi"""')
    expect(celulaCsv('=SOMA(A1)')).toBe("'=SOMA(A1)")
    expect(celulaCsv(null)).toBe('')
  })
  it('monta com BOM e CRLF', () => {
    const csv = montarCsv(['A', 'B'], [[1, 'x']])
    expect(csv.startsWith('﻿A;B\r\n1;x')).toBe(true)
  })
})
