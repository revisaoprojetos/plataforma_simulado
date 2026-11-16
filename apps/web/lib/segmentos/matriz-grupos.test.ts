import { describe, it, expect } from 'vitest'
import { gruposForaDaMatriz, regraVencedora } from './matriz-grupos'

const agora = '2026-11-16T12:00:00.000Z'
const meus = (o: Record<string, string | null>) => new Map(Object.entries(o).map(([k, v]) => [k, { expira_em: v }]))

describe('D1/D2 grupo fora da matriz', () => {
  const vinc = ['gAgosto', 'gSetembro', 'gAvulso']
  const dentro = new Set(['gAgosto', 'gSetembro'])
  it('D1: grupo vinculado sem regra (fora da matriz) = liberação total', () => {
    expect(gruposForaDaMatriz(vinc, dentro, meus({ gAvulso: null }), agora)).toEqual(['gAvulso'])
  })
  it('D2(a): grupo na matriz + grupo vinculado fora da matriz → total (puxa o que está fora)', () => {
    expect(gruposForaDaMatriz(vinc, dentro, meus({ gSetembro: null, gAvulso: null }), agora)).toEqual(['gAvulso'])
  })
  it('D2(b): todos os grupos dele na matriz → regras valem (sem liberação total)', () => {
    expect(gruposForaDaMatriz(vinc, dentro, meus({ gAgosto: null, gSetembro: null }), agora)).toEqual([])
  })
  it('participação vencida ou grupo não vinculado ao produto não conta como "fora"', () => {
    expect(gruposForaDaMatriz(vinc, dentro, meus({ gAvulso: '2026-01-01T00:00:00Z' }), agora)).toEqual([])
    expect(gruposForaDaMatriz(vinc, dentro, meus({ gOutroProduto: null }), agora)).toEqual([])
  })
})

describe('D2(b) ordem das regras que casam', () => {
  it('menor prioridade vence; empate = mais antiga', () => {
    const a = { id: 'a', prioridade: 0, criado_em: '2026-08-01T00:00:00Z' }
    const b = { id: 'b', prioridade: 0, criado_em: '2026-09-01T00:00:00Z' }
    const c = { id: 'c', prioridade: 1, criado_em: '2026-01-01T00:00:00Z' }
    expect(regraVencedora([b, a])?.id).toBe('a')
    expect(regraVencedora([b, c])?.id).toBe('b') // prioridade menor da mais NOVA vence a mais antiga com prioridade maior
    expect(regraVencedora([])).toBeNull()
  })
})
