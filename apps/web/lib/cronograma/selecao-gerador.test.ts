import { describe, expect, it } from 'vitest'
import {
  aplicarSelecoes, chaveAulaGerador, chaveSelecaoGerador, classificacaoSlugDoTipo, indexarSelecoes, lerChaveSelecao, selecaoDaMeta,
  type SelecaoGerador,
} from './selecao-gerador'
import type { ConteudoResolvido } from './conteudo-meta'

const sel = (conj: string, aula: string, tipo: string, extra: Partial<SelecaoGerador> = {}): SelecaoGerador => ({
  metaChave: chaveSelecaoGerador(conj, aula, tipo), documentoId: `doc-${conj}-${aula}-${tipo}`, parteId: null, rotuloAluno: null, visivelAluno: true, ...extra,
})
const conjuntos = [{ id: 'A', disciplina: 'Direito Administrativo', ordem: 0 }, { id: 'B', disciplina: 'Direito Administrativo', ordem: 1 }]
const meta = (id: string, tipo: string, aula: string | null, disc = 'Direito Administrativo') => ({ id, tipo, disciplinas: [disc], aula })

describe('chave estável', () => {
  it('"01" e "1" são a mesma aula; ida e volta', () => {
    expect(chaveAulaGerador('01')).toBe('1')
    expect(chaveAulaGerador(' 1.1 ')).toBe('1.1')
    expect(chaveSelecaoGerador('A', '01', 'pdfull')).toBe(chaveSelecaoGerador('A', '1', 'pdfull'))
    expect(lerChaveSelecao('cj:A|3|pdfull')).toEqual({ conjuntoId: 'A', aula: '3', tipo: 'pdfull' })
    expect(lerChaveSelecao('xx')).toBeNull()
  })
})

describe('aplicarSelecoes', () => {
  const base = new Map<string, ConteudoResolvido>([['m1', { docId: 'auto-1', origem: 'auto', pagina: null }]])
  it('SEM seleção devolve o MESMO resultado (identidade)', () => {
    expect(aplicarSelecoes([meta('m1', 'pdfull', '1')], base, indexarSelecoes([], conjuntos))).toBe(base)
  })
  it('seleção de outra aula/tipo não altera nada', () => {
    const r = aplicarSelecoes([meta('m1', 'pdfull', '1')], base, indexarSelecoes([sel('A', '2', 'pdfull'), sel('A', '1', 'flash')], conjuntos))
    expect(r.get('m1')).toEqual(base.get('m1'))
  })
  it('COM seleção o documento/parte escolhidos prevalecem sobre o automático', () => {
    const idx = indexarSelecoes([sel('A', '01', 'pdfull', { documentoId: 'escolhido', parteId: 'p1', rotuloAluno: 'Parte 1' })], conjuntos)
    const r = aplicarSelecoes([meta('m1', 'pdfull', '1'), meta('m2', 'pdfull', '2')], base, idx)
    expect(r.get('m1')).toMatchObject({ docId: 'escolhido', origem: 'explicito', parteId: 'p1', rotuloAluno: 'Parte 1', viaSelecao: true })
    expect(r.has('m2')).toBe(false)
    expect(base.get('m1')?.docId).toBe('auto-1') // não muta a entrada
  })
  it('seleção oculta tira o documento da meta; meta sem doc ganha o selecionado', () => {
    const idx = indexarSelecoes([sel('A', '1', 'pdfull', { visivelAluno: false }), sel('A', '5', 'legproc')], conjuntos)
    const r = aplicarSelecoes([meta('m1', 'pdfull', '1'), meta('m9', 'legproc', '5')], base, idx)
    expect(r.has('m1')).toBe(false)
    expect(r.get('m9')?.docId).toBe('doc-A-5-legproc')
  })
  it('conjunto de menor ordem vence; conjunto apagado é ignorado; meta sem aula não casa', () => {
    const idx = indexarSelecoes([sel('B', '1', 'pdfull'), sel('A', '1', 'pdfull'), sel('Z', '1', 'flash')], conjuntos)
    expect(selecaoDaMeta(meta('m', 'pdfull', '1', 'Direito Administrativo'), idx)?.metaChave).toBe('cj:A|1|pdfull')
    expect(selecaoDaMeta(meta('m', 'flash', '1'), idx)).toBeNull()
    expect(selecaoDaMeta(meta('m', 'pdfull', null), idx)).toBeNull()
  })
})

describe('classificacaoSlugDoTipo', () => {
  const cat = new Set(['pdfull', 'pdfight', 'pdflash', 'legproc', 'jurisclub', 'questoes'])
  it('mapeia os tipos de meta para as classificações', () => {
    expect(classificacaoSlugDoTipo('pdfull', cat)).toBe('pdfull')
    expect(classificacaoSlugDoTipo('flash', cat)).toBe('pdflash')
    expect(classificacaoSlugDoTipo('quest', cat)).toBe('questoes')
    expect(classificacaoSlugDoTipo('juris', cat)).toBe('jurisclub')
    expect(classificacaoSlugDoTipo('simulado', cat)).toBeNull()
  })
})

import { situacaoDaLinha } from './matriz-gerador-tipos'
describe('situacaoDaLinha', () => {
  it('classifica a aula', () => {
    expect(situacaoDaLinha([{ temSelecao: false, temAuto: true }, { temSelecao: false, temAuto: false }])).toBe('sem_conteudo')
    expect(situacaoDaLinha([{ temSelecao: true, temAuto: false }, { temSelecao: false, temAuto: true }])).toBe('selecionado')
    expect(situacaoDaLinha([{ temSelecao: false, temAuto: true }])).toBe('automatico')
  })
})
