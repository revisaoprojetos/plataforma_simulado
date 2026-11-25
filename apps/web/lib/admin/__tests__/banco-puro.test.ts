import { describe, it, expect } from 'vitest'
import { extrairRef, seloBloat, funcaoPurgaValida } from '../banco-puro'

const MB = 1024 * 1024
describe('banco-puro', () => {
  it('extrai o ref do usuario do pooler', () => {
    expect(extrairRef('postgres.abcdefghijklmnop')).toBe('abcdefghijklmnop')
    expect(extrairRef('postgres')).toBeNull()
    expect(extrairRef(null)).toBeNull()
  })
  it('sela bloat: TOAST desproporcional ou muitas mortas', () => {
    expect(seloBloat({ totalBytes: 3300 * MB, dadosBytes: 20 * MB, toastBytes: 3200 * MB, pctMortas: 1 })).toBe(true)
    expect(seloBloat({ totalBytes: 500 * MB, dadosBytes: 400 * MB, toastBytes: 50 * MB, pctMortas: 40 })).toBe(true)
    expect(seloBloat({ totalBytes: 500 * MB, dadosBytes: 400 * MB, toastBytes: 50 * MB, pctMortas: 5 })).toBe(false)
    expect(seloBloat({ totalBytes: 10 * MB, dadosBytes: 1, toastBytes: 9 * MB, pctMortas: 90 })).toBe(false)
  })
  it('so aceita funcoes de purga conhecidas', () => {
    expect(funcaoPurgaValida('purgar_audit_logs_antigos')).toBe(true)
    expect(funcaoPurgaValida('drop_all')).toBe(false)
  })
})
