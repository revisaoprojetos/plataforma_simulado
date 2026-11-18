import { describe, it, expect } from 'vitest'
import { recuperarTrecho, normalizarComMapa, interseccionar, rectsDeTrechos, type TrechoMedir, type AncoraTexto } from '../anotacoes-engine'

const anc = (S: string, exact: string, extra: Partial<AncoraTexto> = {}): AncoraTexto => {
  const inicio = S.indexOf(exact)
  return { inicio, fim: inicio + exact.length, exact, prefix: S.slice(Math.max(0, inicio - 32), inicio), suffix: S.slice(inicio + exact.length, inicio + exact.length + 32), ...extra }
}

describe('recuperarTrecho (ancoragem)', () => {
  it('acha o exato e desempata por prefixo/sufixo e proximidade', () => {
    const S = 'Art. 1o A pena. Art. 2o A pena. Art. 3o A pena.'
    const a: AncoraTexto = { inicio: 20, fim: 26, exact: 'A pena', prefix: 'Art. 2o ', suffix: '. Art. 3o' }
    const r = recuperarTrecho(S, a)!
    expect(S.slice(r.inicio, r.fim)).toBe('A pena')
    expect(r.inicio).toBe(S.indexOf('A pena', 16))
  })

  it('fallback normalizado: NBSP, espaços duplos e aspas tipográficas', () => {
    const antigo = 'o réu “não” poderá  recorrer em liberdade'
    const novo = 'Texto: o réu "não" poderá recorrer em liberdade, salvo.'
    const a = anc(antigo, 'o réu “não” poderá  recorrer em liberdade')
    const r = recuperarTrecho(novo, a)!
    expect(r).not.toBeNull()
    expect(novo.slice(r.inicio, r.fim)).toBe('o réu "não" poderá recorrer em liberdade')
  })

  it('sem match nenhum devolve null (órfão — nunca apaga)', () => {
    expect(recuperarTrecho('texto totalmente diferente', anc('algo que sumiu do documento', 'algo que sumiu'))).toBeNull()
    expect(recuperarTrecho('qualquer', { inicio: 0, fim: 0, exact: '   ', prefix: '', suffix: '' })).toBeNull()
  })

  it('normalização mapeia índices de volta ao texto original', () => {
    const { N, ini, fim } = normalizarComMapa('a   b​c')
    expect(N).toBe('a bc')
    expect(ini[2]).toBe(4); expect(fim[3]).toBe(7)
  })
})

describe('rectsDeTrechos (por text node)', () => {
  const box = (l: number, t: number, r: number, b: number) => ({ left: l, top: t, right: r, bottom: b })
  const trecho = (o: Partial<TrechoMedir> & { texto: string }): TrechoMedir => ({ fechado: () => false, clip: () => null, medir: () => [box(10, 10, 110, 30)], ...o })

  it('ignora nós só-espaço (sem retângulo bege em vão)', () => {
    const r = rectsDeTrechos([trecho({ texto: ' \n  ' }), trecho({ texto: 'abc' })], { left: 0, top: 0 })
    expect(r).toHaveLength(1)
  })

  it('descarta texto em caixa recolhida', () => {
    expect(rectsDeTrechos([trecho({ texto: 'oculto', fechado: () => true })], { left: 0, top: 0 })).toHaveLength(0)
  })

  it('recorta pelo overflow:hidden do ancestral e descarta o que fica fora', () => {
    const clip = box(0, 0, 200, 20)
    const r = rectsDeTrechos([trecho({ texto: 'x', clip: () => clip, medir: () => [box(10, 10, 110, 40), box(10, 50, 110, 70)] })], { left: 5, top: 5 })
    expect(r).toEqual([{ left: 5, top: 5, width: 100, height: 10 }])
  })

  it('interseccionar: vazia vira null; sem clip mantém', () => {
    expect(interseccionar(box(0, 0, 10, 10), box(20, 20, 30, 30))).toBeNull()
    expect(interseccionar(box(0, 0, 10, 10), null)).toEqual(box(0, 0, 10, 10))
  })
})
