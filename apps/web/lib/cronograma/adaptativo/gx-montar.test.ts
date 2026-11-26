import { describe, expect, it } from 'vitest'
import { mesclarCatalogo, slugsGeraMeta, validarTipo } from '../tipos-conteudo'
import { montarGX } from './gx-montar'
import { MAX_ITENS_GX, MIN_PADRAO_GX } from './gx-tipos'

const U = (n: number) => `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`
const tipos = (linhas: Parameters<typeof mesclarCatalogo>[0]) => {
  const cat = mesclarCatalogo(linhas); const ok = slugsGeraMeta(cat)
  return new Map(cat.filter((t) => ok.has(t.slug)).map((t) => [t.slug, t]))
}

describe('GX', () => {
  it('sem geraMeta: GX vazio', () => {
    const m = tipos([{ slug: 'mapa', nome: 'Mapa', papel: 'generico' }])
    expect(m.size).toBe(0)
    expect(montarGX([{ id: U(1), titulo: 'a', disc: 'D', slug: 'mapa' }], m)).toEqual([])
  })
  it('geraMeta só vale para generico personalizado e ativo', () => {
    const m = tipos([
      { slug: 'aa', nome: 'A', papel: 'generico', gera_meta: true }, { slug: 'bb', nome: 'B', papel: 'apoio', gera_meta: true },
      { slug: 'cc', nome: 'C', papel: 'generico', gera_meta: true, ativo: false }, { slug: 'pdfull', papel: 'leitura', sistema: true, gera_meta: true },
    ])
    expect([...m.keys()]).toEqual(['aa'])
  })
  it('monta ids gx:<slug>:<d8>, duração padrão e sufixo em colisão', () => {
    const m = tipos([{ slug: 'mapa', nome: 'Mapa', nome_aluno: 'Mapa mental', papel: 'generico', gera_meta: true, prioridade: 7, ordem: 3 }])
    const a = U(0xabcdef12); const b = a.replace('-0000-', '-1111-')
    const out = montarGX([{ id: b, titulo: 'B', disc: 'Civil', slug: 'mapa' }, { id: a, titulo: 'A', disc: 'Civil', slug: 'mapa' }], m)
    expect(out.map((x) => x.id).sort()).toEqual(['gx:mapa:abcdef12', 'gx:mapa:abcdef12-2'])
    expect(out[0]).toMatchObject({ slug: 'mapa', nomeTipo: 'Mapa mental', min: MIN_PADRAO_GX, prioridade: 7, ordem: 3, doc: expect.any(String) })
    expect(out.find((x) => x.id.endsWith('-2'))!.doc).toBe(b) // uuid maior ganha o sufixo (atribuição por ordem de uuid)
  })
  it('respeita o limite', () => {
    const m = tipos([{ slug: 'mapa', nome: 'Mapa', papel: 'generico', gera_meta: true, duracao_padrao_min: 20 }])
    const docs = Array.from({ length: MAX_ITENS_GX + 5 }, (_, i) => ({ id: U(i + 1), titulo: `t${i}`, disc: 'D', slug: 'mapa' }))
    const out = montarGX(docs, m)
    expect(out.length).toBe(MAX_ITENS_GX); expect(out[0].min).toBe(20)
  })
  it('validarTipo: geraMeta exige papel generico e boolean', () => {
    expect(validarTipo({ slug: 'mapa', nome: 'M', papel: 'generico', geraMeta: true }).ok).toBe(true)
    expect(validarTipo({ slug: 'mapa', nome: 'M', papel: 'apoio', geraMeta: true }).ok).toBe(false)
    expect(validarTipo({ slug: 'mapa', nome: 'M', papel: 'generico', geraMeta: 'x' }).ok).toBe(false)
  })
})
