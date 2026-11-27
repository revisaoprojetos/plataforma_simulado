import { describe, it, expect } from 'vitest'
import {
  mapaHerancaPastas, resolverEfetiva, formatoEfetivo, conjuntosPastas, pastasDaDisciplina, montarSqlMatriz,
  sugerirClassificacao, nomesCaminhoPasta, filtroValido, type ItemCat, type PastaMatriz,
} from '../matriz'

const cat: ItemCat[] = [
  { id: 'c-full', slug: 'pdfull', nome: 'PDFull' },
  { id: 'c-flash', slug: 'pdflash', nome: 'PDFlash', formatoLeitura: 'texto' },
  { id: 'c-leg', slug: 'legproc', nome: 'LegProc' },
]
const pastas: PastaMatriz[] = [
  { id: 'raiz', nome: 'Raiz', paiId: null, disciplinaId: null, tipoMaterial: null },
  { id: 'civil', nome: 'PDFlash Civil', paiId: 'raiz', disciplinaId: 'd-civil', tipoMaterial: 'pdflash' },
  { id: 'civil-sub', nome: 'Obrigações', paiId: 'civil', disciplinaId: null, tipoMaterial: null },
  { id: 'solta', nome: 'Solta', paiId: 'raiz', disciplinaId: null, tipoMaterial: 'inexistente' },
]

describe('mapaHerancaPastas', () => {
  const m = mapaHerancaPastas(pastas, cat)
  it('herda classificação e disciplina da pasta mais próxima', () => {
    expect(m.get('civil-sub')).toMatchObject({ classificacaoId: 'c-flash', origemClassificacaoPastaId: 'civil', disciplinaId: 'd-civil' })
  })
  it('sem tipo / slug fora do catálogo = nenhuma', () => {
    expect(m.get('raiz')!.classificacaoId).toBeNull()
    expect(m.get('solta')!.classificacaoId).toBeNull()
  })
  it('conjuntos e disciplina', () => {
    expect(conjuntosPastas(m).comClasse.sort()).toEqual(['civil', 'civil-sub'])
    expect(pastasDaDisciplina(m, 'd-civil').sort()).toEqual(['civil', 'civil-sub'])
    expect(pastasDaDisciplina(m, 'd-civil', ['civil'])).toEqual(['civil'])
  })
})

describe('resolverEfetiva', () => {
  const m = mapaHerancaPastas(pastas, cat)
  const pdfull = cat[0]
  it('definida no documento vence a pasta', () => {
    const r = resolverEfetiva({ docClassId: 'c-leg', pastaId: 'civil', mapa: m, catalogo: cat })
    expect(r).toMatchObject({ origem: 'definida', pendente: false })
    expect(r.classificacao!.slug).toBe('legproc')
  })
  it('herdada indica a pasta de origem', () => {
    const r = resolverEfetiva({ docClassId: null, pastaId: 'civil-sub', mapa: m, catalogo: cat })
    expect(r).toMatchObject({ origem: 'herdada', pastaOrigemId: 'civil', pendente: false })
  })
  it('sem nada = pendência; com fallback = comportamento atual (ainda pendência)', () => {
    expect(resolverEfetiva({ docClassId: null, pastaId: null, mapa: m, catalogo: cat })).toMatchObject({ origem: 'nenhuma', pendente: true, classificacao: null })
    const r = resolverEfetiva({ docClassId: null, pastaId: 'solta', mapa: m, catalogo: cat, fallbackLegado: pdfull })
    expect(r).toMatchObject({ origem: 'legado', comportamentoAtual: true, pendente: true })
    expect(r.classificacao!.slug).toBe('pdfull')
  })
  it('classificacao_id fora do catálogo é ignorada', () => {
    expect(resolverEfetiva({ docClassId: 'x', pastaId: null, mapa: m, catalogo: cat }).origem).toBe('nenhuma')
  })
  it('formato: documento > classificação > nenhum (legado não conta)', () => {
    const h = resolverEfetiva({ docClassId: null, pastaId: 'civil', mapa: m, catalogo: cat })
    expect(formatoEfetivo(null, h)).toEqual({ formato: 'texto', origem: 'classificacao' })
    expect(formatoEfetivo('pdf', h)).toEqual({ formato: 'pdf', origem: 'documento' })
    const l = resolverEfetiva({ docClassId: null, pastaId: null, mapa: m, catalogo: cat, fallbackLegado: { ...pdfull, formatoLeitura: 'x' } })
    expect(formatoEfetivo(null, l).origem).toBe('nenhum')
  })
})

describe('montarSqlMatriz', () => {
  const base = { tenantId: 't1', comClasse: ['a', 'b'], limite: 50, offset: 100 }
  it('todos: só tenant + não deletado, paginado', () => {
    const { text, params } = montarSqlMatriz({ ...base, filtro: 'todos' })
    expect(params).toEqual(['t1'])
    expect(text).toContain('LIMIT 50 OFFSET 100')
    expect(text).toContain('d.deletado = false')
  })
  it('herdando e sem_classificacao usam o conjunto de pastas parametrizado', () => {
    const h = montarSqlMatriz({ ...base, filtro: 'herdando' })
    expect(h.params[1]).toEqual(['a', 'b'])
    expect(h.text).toContain('d.pasta_id = ANY($2::uuid[])')
    const s = montarSqlMatriz({ ...base, filtro: 'sem_classificacao' })
    expect(s.text).toContain('NOT (d.pasta_id = ANY($2::uuid[]))')
  })
  it('busca escapa curingas; pasta restrita vira ANY', () => {
    const { text, params } = montarSqlMatriz({ ...base, filtro: 'sem_pasta', q: '50%_x', pastaIds: ['p1'] })
    expect(params).toEqual(['t1', '%50\\%\\_x%', ['p1']])
    expect(text).toContain('d.pasta_id IS NULL')
  })
  it('sort fora da lista cai em titulo; limite é limitado', () => {
    const { text } = montarSqlMatriz({ ...base, filtro: 'conversao', sort: 'x; DROP' as never, limite: 99999 })
    expect(text).toContain('ORDER BY d.titulo ASC')
    expect(text).toContain('LIMIT 1000')
    expect(text).toContain(`<> 'ok'`)
    expect(montarSqlMatriz({ ...base, filtro: 'sem_paginas', sort: 'paginas', dir: 'desc' }).text).toContain('ORDER BY v.paginas DESC NULLS LAST')
  })
  it('filtroValido', () => {
    expect(filtroValido('herdando')).toBe('herdando')
    expect(filtroValido('lixo')).toBe('todos')
  })
})

describe('sugerirClassificacao', () => {
  it('título tem prioridade, tolera acento/separador', () => {
    expect(sugerirClassificacao({ titulo: 'Direito Civil - PDF Flash 01' })).toMatchObject({ slug: 'pdflash', motivo: 'titulo' })
    expect(sugerirClassificacao({ titulo: 'Aula 2 pdf-fight', nomesPasta: ['PDFull'] })?.slug).toBe('pdfight')
    expect(sugerirClassificacao({ titulo: 'PDFULL Penal' })?.slug).toBe('pdfull')
  })
  it('cai para a pasta (mais próxima primeiro) e respeita slugs disponíveis', () => {
    expect(sugerirClassificacao({ titulo: 'Aula 3', nomesPasta: ['Obrigações', 'LegProc Civil', 'PDFlash'] })).toMatchObject({ slug: 'legproc', motivo: 'pasta' })
    expect(sugerirClassificacao({ titulo: 'Aula 3', nomesPasta: ['PDFlash'], disponiveis: new Set(['pdfull']) })).toBeNull()
  })
  it('sem pista = null', () => {
    expect(sugerirClassificacao({ titulo: 'Código Civil', nomesPasta: ['Leis'] })).toBeNull()
  })
  it('nomesCaminhoPasta sobe por pai e tolera ciclo', () => {
    const m = new Map([['a', { nome: 'A', paiId: 'b' }], ['b', { nome: 'B', paiId: 'a' }]])
    expect(nomesCaminhoPasta('a', m)).toEqual(['A', 'B'])
    expect(nomesCaminhoPasta(null, m)).toEqual([])
  })
})
