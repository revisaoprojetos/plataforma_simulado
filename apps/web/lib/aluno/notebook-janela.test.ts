import { describe, expect, it } from 'vitest'
import { ALTURA_LINHA_VIRTUAL as H, janelaVirtual } from './notebook-janela'

describe('janelaVirtual', () => {
  it('vazia', () => { expect(janelaVirtual(0, 0, 500)).toEqual({ ini: 0, fim: 0 }) })
  it('topo: começa em 0 e cobre a altura + folga', () => {
    const j = janelaVirtual(1000, 0, 380)
    expect(j.ini).toBe(0)
    expect(j.fim).toBe(Math.ceil(380 / H) + 8)
  })
  it('meio: folga antes e depois', () => {
    const j = janelaVirtual(1000, 100 * H, 380)
    expect(j.ini).toBe(92)
    expect(j.fim).toBe(100 + Math.ceil(380 / H) + 8)
  })
  it('fim: nunca passa do total; ini <= fim', () => {
    const j = janelaVirtual(300, 100_000, 380)
    expect(j.fim).toBe(300); expect(j.ini).toBeLessThanOrEqual(j.fim)
  })
  it('altura 0 (ainda sem medir) renderiza ao menos 1 linha + folga', () => {
    expect(janelaVirtual(500, 0, 0).fim).toBeGreaterThan(0)
  })
})
