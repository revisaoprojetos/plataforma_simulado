import { describe, expect, it } from 'vitest'
import { facetasEt, filtroLegadoEt, passaEt, type ItemEt } from './etiquetas-filtros'
import { filtrarTax, unirLegadoTax } from './taxonomia-filtros'
import { valoresGrupoU } from './questoes-unificar-tipos'

const et = (id: string, questoes: number, funcao: string | null = null, emSimulados = 0, grupoDup: string | null = null): ItemEt => ({ id, questoes, funcao, emSimulados, grupoDup })

describe('etiquetas: facetas multi', () => {
  const itens = [et('a', 0), et('b', 5, 'anular', 2), et('c', 50, null, 0, 'x'), et('d', 500, 'avisar')]
  const top = new Set(['d'])
  it('E entre dimensões, OU dentro', () => {
    expect(itens.filter((e) => passaEt(e, { funcao: ['anular', 'avisar'] }, top)).map((e) => e.id)).toEqual(['b', 'd'])
    expect(itens.filter((e) => passaEt(e, { funcao: ['anular', 'avisar'], faixa: ['1-10'] }, top)).map((e) => e.id)).toEqual(['b'])
  })
  it('faceta ignora a própria dimensão', () => {
    const f = facetasEt(itens, { funcao: ['anular'], situacao: ['sem_uso'] }, top, () => true)
    expect(f.funcao).toEqual({ nenhuma: 1 })      // só 'a' é sem uso -> nenhuma
    expect(f.situacao).toEqual({ em_uso: 1, em_simulado: 1 }) // com função=anular só 'b'
  })
  it('filtro legado', () => { expect(filtroLegadoEt('sem_uso')).toEqual({ situacao: ['sem_uso'] }); expect(filtroLegadoEt('')).toEqual({}) })
})

describe('taxonomia: filtros multi', () => {
  const it0 = [{ id: '1', nome: 'A', questoes: 0, paiId: 'd1' }, { id: '2', nome: 'B', questoes: 20, paiId: 'd2' }, { id: '3', nome: 'C', questoes: 3, paiId: null }]
  it('filtra e conta', () => {
    const r = filtrarTax(it0, { disciplina: ['d1', 'd2'], uso: ['em_uso'] }, () => true)
    expect(r.lista.map((i) => i.id)).toEqual(['2'])
    expect(r.facetas.disciplina).toEqual({ d2: 1, _sem: 1 })
  })
  it('une legado', () => { expect(unirLegadoTax(undefined, 'd1', true)).toEqual({ disciplina: ['d1'], uso: ['sem_uso'] }) })
})

describe('duplicadas: valores por grupo', () => {
  const g = { nivel: 'identica', emSimulado: false, comRespostas: false, gabDiverge: true, discs: ['d'], bancas: [], anos: ['2020'], statuses: ['publicada'] }
  it('uso livre / gabarito', () => { expect(valoresGrupoU(g, 'uso')).toEqual(['livre']); expect(valoresGrupoU(g, 'gabarito')).toEqual(['divergente']); expect(valoresGrupoU({ ...g, emSimulado: true, comRespostas: true }, 'uso')).toEqual(['simulado', 'respostas']) })
})
