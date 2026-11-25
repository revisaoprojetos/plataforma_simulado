import { describe, it, expect } from 'vitest'
import { agruparChaves, parseChave, decidirLimpeza, chaveDescartavel, prefixoValido, padraoScan, GRUPOS_DESCARTAVEIS } from '../limpeza-puro'

describe('limpeza-puro', () => {
  it('agrupa pela 1a parte apos relatorio:<tenant>:', () => {
    const r = agruparChaves(['relatorio:t1:resumos:a', 'relatorio:t1:resumos:b', 'relatorio:t1:nps', 'relatorio:t2:nps', 'rl2:x'], 't1')
    expect(r).toEqual([{ grupo: 'resumos', chaves: 2 }, { grupo: 'nps', chaves: 1 }])
  })
  it('parseChave rejeita chaves fora do prefixo', () => {
    expect(parseChave('cron:lock:x')).toBeNull()
    expect(parseChave('relatorio:t1:graficos')).toEqual({ tenant: 't1', grupo: 'graficos' })
  })
  it('so remove grupos descartaveis', () => {
    expect(chaveDescartavel('relatorio:t:resumos:1')).toBe(true)
    expect(chaveDescartavel('relatorio:t:board-tv:1')).toBe(false)
    expect(chaveDescartavel('cron:lock:resumos')).toBe(false)
    expect(GRUPOS_DESCARTAVEIS).not.toContain('ranking')
  })
  it('decide limpeza por memoria ou evicted', () => {
    expect(decidirLimpeza({ usada: 90, max: 100, evicted: 0, evictedAnterior: null }).limpar).toBe(true)
    expect(decidirLimpeza({ usada: 10, max: 100, evicted: 5, evictedAnterior: 3 }).limpar).toBe(true)
    expect(decidirLimpeza({ usada: 10, max: 100, evicted: 5, evictedAnterior: 5 }).limpar).toBe(false)
    expect(decidirLimpeza({ usada: 10, max: 100, evicted: 5, evictedAnterior: null }).limpar).toBe(false)
  })
  it('valida prefixo e monta padrao', () => {
    expect(prefixoValido('resumos')).toBe(true)
    expect(prefixoValido('a*b')).toBe(false)
    expect(padraoScan('t1', 'nps')).toBe('relatorio:t1:nps*')
    expect(padraoScan(null)).toBe('relatorio:*:*')
  })
})

import { agruparMemoria } from '../limpeza-puro'
describe('agruparMemoria', () => {
  it('agrega bytes e ttl medio por grupo e tenant', () => {
    const r = agruparMemoria([
      { chave: 'relatorio:t1:resumos:a', bytes: 100, exp: 11_000 },
      { chave: 'relatorio:t1:resumos:b', bytes: 50, exp: 21_000 },
      { chave: 'relatorio:t2:resumos:c', bytes: 999, exp: 11_000 },
    ], 't1', 1_000)
    expect(r).toEqual([{ grupo: 'resumos', chaves: 2, bytes: 150, ttlMedioSeg: 15 }])
  })
})
