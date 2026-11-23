import { describe, expect, it } from 'vitest'
import { LIMITES_FOLHA, criarFolhaVazia, estimarBytesFolha, gerarId, podeAdicionarTraco, serializarFolha, tamanhoBytes, type Ponto, type TracoFolha } from './notebook-folha'

const pts = (n: number): Ponto[] => Array.from({ length: n }, (_, i) => [i + 0.123456, i * 2 + 0.987654, 0.5] as Ponto)
const traco = (id: string, n: number): TracoFolha => ({ id, ferramenta: 'caneta', cor: 'tinta', largura: 2, pontos: pts(n) })

describe('podeAdicionarTraco (estimativa incremental)', () => {
  it('estimativa nunca subestima o JSON serializado', () => {
    const f = { ...criarFolhaVazia(), tracos: [traco('a', 50), traco('b', 200)] }
    expect(estimarBytesFolha(f)).toBeGreaterThanOrEqual(tamanhoBytes(serializarFolha(f)))
  })
  it('folha pequena aceita; limites de contagem/pontos continuam valendo', () => {
    const f = criarFolhaVazia()
    expect(podeAdicionarTraco(f, traco('a', 10))).toBe(true)
    expect(podeAdicionarTraco(f, traco('b', LIMITES_FOLHA.pontosPorTraco + 1))).toBe(false)
  })
  it('perto do limite usa a medida exata (mesmo veredito da serialização)', () => {
    let f = criarFolhaVazia()
    const ts: TracoFolha[] = []
    while (tamanhoBytes(serializarFolha({ ...f, tracos: ts })) < LIMITES_FOLHA.bytes * 0.97) ts.push(traco(gerarId(), 4000))
    f = { ...f, tracos: ts }
    const novo = traco('x', 4000)
    const exato = tamanhoBytes(serializarFolha({ ...f, tracos: [...f.tracos, novo] })) <= LIMITES_FOLHA.bytes
    expect(podeAdicionarTraco(f, novo)).toBe(exato)
    expect(podeAdicionarTraco(f, traco('y', 20000))).toBe(false)
  })
  it('gerarId produz uuid v4', () => { expect(gerarId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/) })
})
