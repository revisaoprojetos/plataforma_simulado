import { describe, it, expect } from 'vitest'
import { diffGrade, mudancaGrande } from '../grade-diff'
import { revisoesAntesDoEstudo, aplicarAjustes, GAP_FLASH_DIAS } from '../revisoes-coerentes'

describe('diffGrade', () => {
  it('conta movidas, novas e removidas e o deslocamento', () => {
    const a = { 'pf:1': ['2026-11-10', 2], 'pf:2': ['2026-11-12', 2], 'pf:3': ['2026-11-14', 2] } as any
    const d = { 'pf:1': ['2026-11-10', 2], 'pf:2': ['2026-11-20', 2], 'pf:4': ['2026-11-22', 2] } as any
    const r = diffGrade(a, d)
    expect(r).toMatchObject({ movidas: 1, novas: 1, removidas: 1, maiorDeslocamentoDias: 8, deslocamentoMedioDias: 8 })
    expect(mudancaGrande(r, 3)).toBe(true); expect(mudancaGrande(r, 4)).toBe(false)
  })
  it('grades iguais ou vazias → tudo zero', () => {
    expect(diffGrade({}, {})).toMatchObject({ movidas: 0, novas: 0, removidas: 0 })
    expect(diffGrade(null, undefined).deslocamentoMedioDias).toBe(0)
  })
})

describe('revisoesAntesDoEstudo (incidente Welber)', () => {
  const plano = { 'pf:72': ['2026-11-20', 3.5], 'fl:72': ['2026-11-18', 1], 'qu:72': ['2026-11-19', 0.5], 'qu:72:hist:1': ['2026-11-10', 0.5], 'pf:10': ['2026-11-15', 2], 'fl:10': ['2026-11-23', 1] } as any
  it('recoloca fl/qu que ficaram ANTES do PDFull quando o PDFull não está feito', () => {
    const aj = revisoesAntesDoEstudo(plano, new Set())
    expect(aj.map((x) => x.id).sort()).toEqual(['fl:72', 'qu:72'])
    const novo = aplicarAjustes(plano, aj)
    expect(novo['fl:72'][0]).toBe('2026-11-28'); expect(novo['fl:72'][1]).toBe(1) // +8 dias, horas preservadas
    expect(novo['qu:72'][0] > novo['fl:72'][0]).toBe(true)
    expect(novo['qu:72:hist:1'][0]).toBe('2026-11-10') // histórico (diagnóstico) nunca é tocado
    expect(novo['fl:10'][0]).toBe('2026-11-23') // já estava depois do estudo
  })
  it('PDFull FEITO → não mexe (a revisão antes é outra história)', () => {
    expect(revisoesAntesDoEstudo(plano, new Set(['pf:72']))).toEqual([])
  })
  it('sem ajustes devolve a MESMA referência', () => {
    expect(aplicarAjustes(plano, [])).toBe(plano)
    expect(GAP_FLASH_DIAS).toBe(8)
  })
})
