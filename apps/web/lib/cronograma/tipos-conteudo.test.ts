import { describe, expect, it } from 'vitest'
import { mesclarCatalogo, papelDoSlug, tipoMaterialCompat, validarTipo } from './tipos-conteudo'

describe('mesclarCatalogo', () => {
  it('sem linhas devolve os 7 de sistema ordenados', () => {
    const c = mesclarCatalogo([])
    expect(c.map((t) => t.slug)).toEqual(['pdfull', 'pdfight', 'pdflash', 'legproc', 'jurisclub', 'questoes', 'videoaula'])
  })
  it('override altera rótulo mas nunca papel/slug de sistema', () => {
    const c = mesclarCatalogo([{ slug: 'pdfull', nome: 'Aula', papel: 'questoes', sistema: true, ativo: false, ordem: 99 }])
    const t = c.find((x) => x.slug === 'pdfull')!
    expect(t.nome).toBe('Aula'); expect(t.papel).toBe('leitura'); expect(t.ativo).toBe(false); expect(t.sistema).toBe(true)
    expect(c[c.length - 1].slug).toBe('pdfull')
  })
  it('personalizado entra com papel e ordem', () => {
    const c = mesclarCatalogo([{ slug: 'mapa', nome: 'Mapa mental', papel: 'apoio', ordem: 0 }])
    expect(c[0].slug).toBe('mapa'); expect(c[0].sistema).toBe(false); expect(c[0].nomeAluno).toBe('Mapa mental')
  })
})

describe('validarTipo', () => {
  const ok = { slug: 'mapa', nome: 'Mapa', papel: 'apoio', duracaoPadraoMin: 30 }
  it('aceita válido', () => expect(validarTipo(ok).ok).toBe(true))
  it('rejeita slug ruim e colisão com sistema', () => {
    expect(validarTipo({ ...ok, slug: 'A b' }).ok).toBe(false)
    expect(validarTipo({ ...ok, slug: 'pdfull' }).ok).toBe(false)
  })
  it('rejeita papel, duração e nome inválidos', () => {
    expect(validarTipo({ ...ok, papel: 'x' }).ok).toBe(false)
    expect(validarTipo({ ...ok, duracaoPadraoMin: 0 }).ok).toBe(false)
    expect(validarTipo({ ...ok, duracaoPadraoMin: 601 }).ok).toBe(false)
    expect(validarTipo({ ...ok, duracaoPadraoMin: null }).ok).toBe(true)
    expect(validarTipo({ ...ok, nome: ' ' }).ok).toBe(false)
    expect(validarTipo({ ...ok, nome: 'x'.repeat(61) }).ok).toBe(false)
  })
  it('edição não exige slug', () => expect(validarTipo({ nome: 'Novo' }, { criando: false }).ok).toBe(true))
})

describe('compat', () => {
  const c = mesclarCatalogo([
    { slug: 'aa', nome: 'A', papel: 'leitura' }, { slug: 'bb', nome: 'B', papel: 'lei_seca' },
    { slug: 'cc', nome: 'C', papel: 'jurisprudencia' }, { slug: 'dd', nome: 'D', papel: 'questoes' },
    { slug: 'ee', nome: 'E', papel: 'apoio' }, { slug: 'ff', nome: 'F', papel: 'generico' },
  ])
  it('mapeia papel para vocabulário antigo', () => {
    expect(['aa', 'bb', 'cc', 'dd', 'ee', 'ff'].map((s) => tipoMaterialCompat(s, c))).toEqual(['pdfull', 'legproc', 'jurisclub', 'questoes', 'pdfight', 'pdfight'])
    expect(tipoMaterialCompat('pdflash', c)).toBe('pdflash')
    expect(tipoMaterialCompat('zzz', c)).toBeNull()
    expect(tipoMaterialCompat('videoaula', c)).toBeNull() // sistema fora do vocabulário antigo
    expect(papelDoSlug('videoaula', c)).toBe('apoio')
    expect(papelDoSlug('bb', c)).toBe('lei_seca')
  })
})
