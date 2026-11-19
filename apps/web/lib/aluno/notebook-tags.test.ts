import { describe, expect, it } from 'vitest'
import {
  LIMITES_TAGS, agruparPorPagina, buscaTagsSchema, chaveNomeTag, diffTags, emChunks, normalizarNomeTag, paginaTagsSchema, parsePaginaIds,
  tagCriarSchema, tagEditarSchema,
} from './notebook-tags'

const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'

describe('tags: nome e schemas', () => {
  it('normaliza espaços e chave case-insensitive', () => {
    expect(normalizarNomeTag('  Direito   Penal ')).toBe('Direito Penal')
    expect(chaveNomeTag(' DIREITO  penal')).toBe('direito penal')
  })
  it('criar: valida nome e cor da paleta', () => {
    expect(tagCriarSchema.safeParse({ nome: ' Revisar ' }).data).toEqual({ nome: 'Revisar' })
    expect(tagCriarSchema.safeParse({ nome: '' }).success).toBe(false)
    expect(tagCriarSchema.safeParse({ nome: 'x'.repeat(LIMITES_TAGS.nomeMax + 1) }).success).toBe(false)
    expect(tagCriarSchema.safeParse({ nome: 'a', cor: '#ff0000' }).success).toBe(false)
    expect(tagCriarSchema.safeParse({ nome: 'a', cor: 'roxo' }).success).toBe(true)
  })
  it('editar exige ao menos um campo', () => {
    expect(tagEditarSchema.safeParse({}).success).toBe(false)
    expect(tagEditarSchema.safeParse({ cor: 'azul' }).success).toBe(true)
  })
})

describe('tags: vínculo página', () => {
  it('deduplica ids e respeita o máximo', () => {
    const r = paginaTagsSchema.safeParse({ pagina_id: U1, tag_ids: [U2, U2.toUpperCase()] })
    expect(r.success && r.data.tag_ids).toEqual([U2])
    expect(paginaTagsSchema.safeParse({ pagina_id: U1, tag_ids: Array.from({ length: 21 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) }).success).toBe(false)
    expect(paginaTagsSchema.safeParse({ pagina_id: 'x', tag_ids: [] }).success).toBe(false)
  })
  it('diffTags', () => {
    expect(diffTags(['a', 'b'], ['b', 'c'])).toEqual({ adicionar: ['c'], remover: ['a'] })
    expect(diffTags([], [])).toEqual({ adicionar: [], remover: [] })
  })
  it('parsePaginaIds: valida, deduplica, limita a 80', () => {
    expect(parsePaginaIds(null)).toBeNull()
    expect(parsePaginaIds(`${U1},${U2},${U1}`)).toEqual([U1, U2])
    expect(parsePaginaIds('abc')).toBeNull()
    const muitos = Array.from({ length: 81 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`).join(',')
    expect(parsePaginaIds(muitos)).toBeNull()
  })
  it('agruparPorPagina inclui páginas sem tag', () => {
    expect(agruparPorPagina([U1, U2], [{ pagina_id: U1, tag_id: 't1' }, { pagina_id: U1, tag_id: 't2' }])).toEqual({ [U1]: ['t1', 't2'], [U2]: [] })
  })
  it('emChunks', () => {
    expect(emChunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})

describe('busca por tag', () => {
  it('exige tag_id; q opcional >= 2; limit <= 30', () => {
    expect(buscaTagsSchema.safeParse({ tag_id: U1 }).success).toBe(true)
    expect(buscaTagsSchema.safeParse({ tag_id: 'x' }).success).toBe(false)
    expect(buscaTagsSchema.safeParse({ tag_id: U1, q: 'a' }).success).toBe(false)
    expect(buscaTagsSchema.safeParse({ tag_id: U1, limit: '31' }).success).toBe(false)
    const r = buscaTagsSchema.safeParse({ tag_id: U1, offset: '5' })
    expect(r.success && r.data.offset).toBe(5)
  })
})
