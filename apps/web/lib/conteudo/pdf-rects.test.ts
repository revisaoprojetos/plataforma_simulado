import { describe, it, expect } from 'vitest'
import { rectNormPdf, mesclarRects } from './pdf-rects'

const pg = { left: 100, top: 50, width: 800, height: 1000 }

describe('rectNormPdf', () => {
  it('normaliza pela caixa da folha', () => {
    expect(rectNormPdf({ left: 140, top: 150, right: 340, bottom: 170 }, pg)).toEqual({ x0: 0.05, y0: 0.1, x1: 0.3, y1: 0.12 })
  })
  it('é invariante ao zoom (mesmo texto em 2 escalas)', () => {
    const a = rectNormPdf({ left: 140, top: 150, right: 340, bottom: 170 }, pg)
    const b = rectNormPdf({ left: 100 + 80, top: 50 + 200, right: 100 + 680, bottom: 50 + 240 }, { left: 100, top: 50, width: 1600, height: 2000 })
    expect(b).toEqual(rectNormPdf({ left: 180, top: 250, right: 780, bottom: 290 }, { left: 100, top: 50, width: 1600, height: 2000 }))
    expect(a!.x1 - a!.x0).toBeCloseTo(0.25, 5)
  })
  it('faz clamp 0..1', () => {
    const r = rectNormPdf({ left: 0, top: 0, right: 5000, bottom: 5000 }, pg)!
    expect(r).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 })
  })
  it('descarta folha sem caixa, NaN e rect minúsculo/fora da folha', () => {
    expect(rectNormPdf({ left: 0, top: 0, right: 1, bottom: 1 }, { left: 0, top: 0, width: 0, height: 0 })).toBeNull()
    expect(rectNormPdf({ left: NaN, top: 0, right: 10, bottom: 10 }, pg)).toBeNull()
    expect(rectNormPdf({ left: 200, top: 100, right: 200.5, bottom: 120 }, pg)).toBeNull()
    expect(rectNormPdf({ left: 2000, top: 2000, right: 2100, bottom: 2100 }, pg)).toBeNull()
  })
})

describe('mesclarRects', () => {
  it('une palavras da mesma linha e mantém linhas distintas', () => {
    const out = mesclarRects([
      { x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.12 }, { x0: 0.205, y0: 0.1, x1: 0.3, y1: 0.12 },
      { x0: 0.1, y0: 0.14, x1: 0.25, y1: 0.16 },
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ x0: 0.1, x1: 0.3 })
  })
  it('não ponte colunas distantes', () => {
    expect(mesclarRects([{ x0: 0.05, y0: 0.1, x1: 0.4, y1: 0.12 }, { x0: 0.55, y0: 0.1, x1: 0.9, y1: 0.12 }])).toHaveLength(2)
  })
  it('remove duplicados/contidos', () => {
    const a = { x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.12 }
    expect(mesclarRects([a, { ...a }, { x0: 0.2, y0: 0.1, x1: 0.3, y1: 0.12 }])).toHaveLength(1)
  })
})
