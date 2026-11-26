import { describe, it, expect } from 'vitest'
import { calcularHeranca, descendentes, type PastaHeranca } from './metas-pasta-heranca'

const p = (id: string, paiId: string | null, tipo: string | null = null, disc: string | null = null): PastaHeranca =>
  ({ id, paiId, tipoMaterial: tipo, disciplinaId: disc })

describe('calcularHeranca', () => {
  it('sem marcação = pdfull e sem disciplina', () => {
    const h = calcularHeranca([p('a', null)])
    expect(h.get('a')).toEqual({ tipoEfetivo: 'pdfull', origemTipoId: null, disciplinaId: null, origemDisciplinaId: null })
  })
  it('herda do ancestral tipado mais próximo e da disciplina ancestral', () => {
    const h = calcularHeranca([p('d', null, null, 'D1'), p('s', 'd', 'legproc'), p('x', 's'), p('y', 'x', 'questoes'), p('z', 'y')])
    expect(h.get('x')).toMatchObject({ tipoEfetivo: 'legproc', origemTipoId: 's', disciplinaId: 'D1', origemDisciplinaId: 'd' })
    expect(h.get('z')).toMatchObject({ tipoEfetivo: 'questoes', origemTipoId: 'y' })
    expect(h.get('d')?.tipoEfetivo).toBe('pdfull')
  })
  it('disciplina própria sobrescreve a do ancestral', () => {
    const h = calcularHeranca([p('a', null, null, 'D1'), p('b', 'a', null, 'D2'), p('c', 'b')])
    expect(h.get('c')?.disciplinaId).toBe('D2')
  })
  it('ignora tipo inválido', () => {
    expect(calcularHeranca([p('a', null, 'xpto')]).get('a')?.tipoEfetivo).toBe('pdfull')
  })
  it('pai inexistente não quebra', () => {
    expect(calcularHeranca([p('a', 'fantasma', 'pdflash')]).get('a')?.tipoEfetivo).toBe('pdflash')
  })
  it('ciclo termina', () => {
    const h = calcularHeranca([p('a', 'b', 'legproc'), p('b', 'a')])
    expect(h.get('a')?.tipoEfetivo).toBe('legproc')
    expect(h.get('b')).toBeDefined()
  })
  it('profundidade grande não estoura', () => {
    const ps: PastaHeranca[] = [p('n0', null, 'jurisclub')]
    for (let i = 1; i < 500; i++) ps.push(p(`n${i}`, `n${i - 1}`))
    const h = calcularHeranca(ps)
    expect(h.get('n499')).toBeDefined()
    expect(h.get('n10')?.tipoEfetivo).toBe('jurisclub')
  })
})

describe('descendentes', () => {
  it('lista subárvore sem a raiz e tolera ciclo', () => {
    const ps = [{ id: 'a', paiId: null }, { id: 'b', paiId: 'a' }, { id: 'c', paiId: 'b' }, { id: 'o', paiId: null }]
    expect(descendentes(ps, 'a').sort()).toEqual(['b', 'c'])
    expect(descendentes([{ id: 'a', paiId: 'b' }, { id: 'b', paiId: 'a' }], 'a')).toEqual(['b'])
  })
})
