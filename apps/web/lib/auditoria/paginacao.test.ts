import { describe, it, expect } from 'vitest'
import { emChunks, ajustarTotal, mesclarPaginas } from './paginacao'

describe('emChunks', () => {
  it('divide em blocos de 80', () => {
    const r = emChunks(Array.from({ length: 300 }, (_, i) => i))
    expect(r.map((c) => c.length)).toEqual([80, 80, 80, 60])
    expect(emChunks([])).toEqual([])
  })
})

describe('ajustarTotal', () => {
  it('página parcial => total exato', () => expect(ajustarTotal(99999, 24, 12, 5)).toBe(29))
  it('página cheia e estimativa baixa => força próxima', () => expect(ajustarTotal(10, 0, 12, 12)).toBe(13))
  it('página cheia e estimativa alta => mantém estimativa', () => expect(ajustarTotal(5000, 0, 12, 12)).toBe(5000))
  it('vazio na primeira página => 0', () => expect(ajustarTotal(40, 0, 12, 0)).toBe(0))
  it('nulo => 0', () => expect(ajustarTotal(null, 0, 12, 0)).toBe(0))
})

describe('mesclarPaginas', () => {
  const a = [{ criado_em: '2026-01-03' }, { criado_em: '2026-01-01' }]
  const b = [{ criado_em: '2026-01-04' }, { criado_em: '2026-01-02' }, { criado_em: null }]
  it('desc global e fatia', () => {
    expect(mesclarPaginas([a, b], 'criado_em', 'desc', 1, 2).map((x) => x.criado_em)).toEqual(['2026-01-03', '2026-01-02'])
  })
  it('asc, nulos por último', () => {
    expect(mesclarPaginas([a, b], 'criado_em', 'asc', 0, 5).map((x) => x.criado_em)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', null])
  })
})
