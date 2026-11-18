import { describe, it, expect } from 'vitest'
import { compatibilidadeGrifo, separarGrifosPorVersao, reancorarPorTexto, type VersaoInfo } from './grifos-versao'

const atual: VersaoInfo = { id: 'v6', hash: 'abc', paginas: 10 }
const mapa = (...v: VersaoInfo[]) => new Map(v.map((x) => [x.id, x]))

describe('compatibilidadeGrifo', () => {
  it('legado sem versao_id e mesma versão → atual', () => {
    expect(compatibilidadeGrifo(null, atual, mapa())).toBe('atual')
    expect(compatibilidadeGrifo('v6', atual, mapa())).toBe('atual')
  })
  it('versão diferente com mesmo hash e mesmas páginas → compatível', () => {
    expect(compatibilidadeGrifo('v7', atual, mapa({ id: 'v7', hash: 'abc', paginas: 10 }))).toBe('compativel')
    expect(compatibilidadeGrifo('v7', atual, mapa({ id: 'v7', hash: 'abc', paginas: null }))).toBe('compativel')
  })
  it('hash diferente, vazio, páginas diferentes ou versão desconhecida → desatualizado', () => {
    expect(compatibilidadeGrifo('v5', atual, mapa({ id: 'v5', hash: 'zzz', paginas: 10 }))).toBe('desatualizado')
    expect(compatibilidadeGrifo('v5', { ...atual, hash: '' }, mapa({ id: 'v5', hash: '', paginas: 10 }))).toBe('desatualizado')
    expect(compatibilidadeGrifo('v5', atual, mapa({ id: 'v5', hash: 'abc', paginas: 9 }))).toBe('desatualizado')
    expect(compatibilidadeGrifo('vX', atual, mapa())).toBe('desatualizado')
  })
})

describe('separarGrifosPorVersao', () => {
  const r = { x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 }
  it('separa e nunca perde grifo', () => {
    const rows = [
      { id: 'a', versao_id: 'v6', pagina: 1, rects: [r], texto: 'um texto' },
      { id: 'b', versao_id: 'v5', pagina: 2, rects: [r], texto: 'outro texto' },
      { id: 'c', versao_id: null, pagina: 3, rects: [r], texto: null },
    ]
    const s = separarGrifosPorVersao(rows, atual, mapa({ id: 'v5', hash: 'old', paginas: 10 }))
    expect(s.pintar.map((g) => g.id)).toEqual(['a', 'c'])
    expect(s.desatualizados.map((g) => g.id)).toEqual(['b'])
    expect(s.pintar.length + s.desatualizados.length).toBe(rows.length)
  })
  it('desatualizado já reaplicado (mesmo texto/tool/cor na atual) some da lista', () => {
    const rows = [
      { id: 'old', versao_id: 'v5', pagina: 2, rects: [r], texto: 'Texto  Grifado', tool: 'hl', cor: 'y' },
      { id: 'new', versao_id: 'v6', pagina: 4, rects: [r], texto: 'texto grifado', tool: 'hl', cor: 'y' },
    ]
    const s = separarGrifosPorVersao(rows, atual, mapa({ id: 'v5', hash: 'old', paginas: 10 }))
    expect(s.desatualizados).toHaveLength(0)
  })
})

describe('reancorarPorTexto', () => {
  const it1 = (str: string, x0: number, x1: number, y = 0.1) => ({ str, x0, x1, y0: y, y1: y + 0.02 })
  const paginas = [
    { pagina: 1, itens: [it1('O prazo para', 0.1, 0.4), it1('contestar é de quinze dias.', 0.4, 0.9)] },
    { pagina: 2, itens: [it1('Outro assunto qualquer', 0.1, 0.5)] },
  ]
  it('acha trecho idêntico atravessando itens e devolve rects', () => {
    const a = reancorarPorTexto('prazo para contestar', paginas, 3)
    expect(a?.pagina).toBe(1)
    expect(a!.rects).toHaveLength(2)
    expect(a!.rects[0].x0).toBeGreaterThan(0.1)
  })
  it('texto inexistente ou curto → null', () => {
    expect(reancorarPorTexto('prazo para recorrer', paginas)).toBeNull()
    expect(reancorarPorTexto('prazo', paginas)).toBeNull()
  })
  it('ambíguo (2 ocorrências) só aceita se uma estiver na página original', () => {
    const dup = [...paginas, { pagina: 3, itens: [it1('O prazo para contestar', 0.1, 0.6)] }]
    expect(reancorarPorTexto('prazo para contestar', dup)).toBeNull()
    expect(reancorarPorTexto('prazo para contestar', dup, 3)?.pagina).toBe(3)
  })
})
