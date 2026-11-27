import { describe, it, expect } from 'vitest'
import { resolverFaixa, sugerirPartes, validarPartes, medirParte, normalizarRotulo, resolverPartes, type TrechoParte } from './partes'

const t = (uid: string, tipo: string, rotulo: string | null, texto: string): TrechoParte => ({ uid, tipo, rotulo, texto })

// Versão 1: dois títulos, 4 artigos com § e inciso.
const v1: TrechoParte[] = [
  t('a0', 'titulo', null, 'TÍTULO I - Disposições'),
  t('a1', 'artigo', 'Art. 1º', 'Art. 1º Fica instituída a lei.'),
  t('a2', 'paragrafo', '§ 1º', '§ 1º Parágrafo do primeiro.'),
  t('a3', 'artigo', 'Art. 2º', 'Art. 2º Segundo artigo aqui.'),
  t('a4', 'inciso', 'I', 'I - inciso do segundo'),
  t('a5', 'titulo', null, 'TÍTULO II - Penas'),
  t('a6', 'artigo', 'Art. 3º', 'Art. 3º Terceiro artigo.'),
  t('a7', 'artigo', 'Art. 4º', 'Art. 4º Quarto artigo.'),
  t('a8', 'paragrafo', '§ 1º', '§ 1º do quarto.'),
]
// Versão 2: uids TODOS trocados (reconciliação não conseguiu carregar), texto igual + um artigo novo no meio.
const v2: TrechoParte[] = v1.map((x) => ({ ...x, uid: 'n' + x.uid }))
v2.splice(4, 0, t('nnovo', 'paragrafo', '§ 2º', '§ 2º acrescentado.'))

describe('resolverFaixa', () => {
  it('resolve por uid direto', () => {
    const r = resolverFaixa(v1, { iniUid: 'a1', fimUid: 'a4' })
    expect(r.ok).toBe(true); expect(r.motivo).toBe('uid'); expect(r.indices).toEqual([1, 4])
  })
  it('sobrevive à troca de versão por rótulo e estende o fim até o fim do artigo', () => {
    const r = resolverFaixa(v2, { iniUid: 'a1', fimUid: 'a3', rotuloIni: 'Art. 1º', rotuloFim: 'Art. 2º' })
    expect(r.ok).toBe(true); expect(r.motivo).toBe('rotulo')
    expect(r.recuperadoPorRotulo).toEqual({ ini: true, fim: true })
    // Art. 1º (idx 1) .. inciso do Art. 2º (idx 5, depois do § 2º acrescentado), parando antes do TÍTULO II.
    expect(r.indices).toEqual([1, 5])
    expect(r.fim?.uid).toBe('na4')
  })
  it('mistura: início por uid, fim por rótulo', () => {
    const base = v2.map((x, i) => (i === 1 ? { ...x, uid: 'a1' } : x))
    const r = resolverFaixa(base, { iniUid: 'a1', fimUid: 'sumiu', rotuloFim: 'Art. 4º' })
    expect(r.ok).toBe(true); expect(r.recuperadoPorRotulo).toEqual({ ini: false, fim: true })
    expect(r.indices).toEqual([1, v2.length - 1])
  })
  it('rótulo ignora º/° e caixa; prefere o artigo ao inciso homônimo', () => {
    const l = [t('x', 'inciso', 'Art. 5', 'citação'), t('y', 'artigo', 'Art. 5º', 'Art. 5º real')]
    const r = resolverFaixa(l, { iniUid: 'z', fimUid: 'w', rotuloIni: 'artigo 5°', rotuloFim: 'ART. 5' })
    expect(r.indices).toEqual([1, 1])
  })
  it('faixa quebrada: início sumiu sem rótulo', () => {
    const r = resolverFaixa(v2, { iniUid: 'a1', fimUid: 'a3' })
    expect(r.ok).toBe(false); expect(r.motivo).toBe('ini_ausente'); expect(r.indices).toBeNull()
  })
  it('faixa quebrada: fim sumiu e rótulo não existe', () => {
    const r = resolverFaixa(v1, { iniUid: 'a1', fimUid: 'zzz', rotuloFim: 'Art. 99' })
    expect(r.ok).toBe(false); expect(r.motivo).toBe('fim_ausente')
  })
  it('faixa invertida e sem trechos', () => {
    expect(resolverFaixa(v1, { iniUid: 'a6', fimUid: 'a1' }).motivo).toBe('faixa_invertida')
    expect(resolverFaixa([], { iniUid: 'a', fimUid: 'b' }).motivo).toBe('sem_trechos')
  })
  it('fim por rótulo não pode ficar antes do início', () => {
    const r = resolverFaixa(v1, { iniUid: 'a6', fimUid: 'sumiu', rotuloFim: 'Art. 1º' })
    expect(r.ok).toBe(false)
  })
})

describe('sugerirPartes', () => {
  it('por título: preâmbulo vai na 1ª parte e nomes vêm do título', () => {
    const s = sugerirPartes(v1, { modo: 'titulo' })
    expect(s.map((p) => p.nome)).toEqual(['TÍTULO I - Disposições', 'TÍTULO II - Penas'])
    expect(s[0].indices).toEqual([0, 4]); expect(s[1].indices).toEqual([5, 8])
    expect(s[0].rotuloIni).toBe('Art. 1º'); expect(s[1].rotuloFim).toBe('Art. 4º')
    expect(s[1].medida.artigos).toBe(2)
  })
  it('por capítulo sem capítulos nem títulos → vazio', () => {
    expect(sugerirPartes([t('1', 'artigo', 'Art. 1º', 'Art. 1º x')], { modo: 'capitulo' })).toEqual([])
  })
  it('a cada N artigos', () => {
    const s = sugerirPartes(v1, { modo: 'cada_n_artigos', n: 2 })
    expect(s.map((p) => p.nome)).toEqual(['Art. 1º a Art. 2º', 'Art. 3º a Art. 4º'])
    expect(s[0].indices[0]).toBe(0) // preâmbulo anexado
    expect(s[0].indices).toEqual([0, 5]); expect(s[1].indices).toEqual([6, 8])
  })
  it('N maior que o total gera 1 parte; nomes repetidos ganham sufixo', () => {
    expect(sugerirPartes(v1, { modo: 'cada_n_artigos', n: 100 })).toHaveLength(1)
    const dup = [t('1', 'titulo', null, 'Disposições'), t('2', 'artigo', 'Art. 1º', 'Art. 1º'), t('3', 'titulo', null, 'Disposições'), t('4', 'artigo', 'Art. 2º', 'Art. 2º')]
    expect(sugerirPartes(dup, { modo: 'titulo' }).map((p) => p.nome)).toEqual(['Disposições', 'Disposições (2)'])
  })
})

describe('validarPartes', () => {
  const p = (nome: string, ini: number, fim: number, extra: object = {}) => ({ nome, ini, fim, ...extra })
  it('ok quando adjacentes sem sobrepor', () => {
    expect(validarPartes([p('A', 0, 4), p('B', 5, 8)]).ok).toBe(true)
  })
  it('detecta sobreposição', () => {
    const r = validarPartes([p('A', 0, 5), p('B', 5, 8)])
    expect(r.erros.map((e) => e.codigo)).toContain('sobreposicao')
  })
  it('detecta ini>fim, nome vazio e duplicado (sem acento/caixa) só entre ativas', () => {
    expect(validarPartes([p('A', 5, 2)]).erros[0].codigo).toBe('faixa_invertida')
    expect(validarPartes([p('  ', 0, 1)]).erros[0].codigo).toBe('nome_vazio')
    expect(validarPartes([p('Título I', 0, 1), p('TITULO i', 2, 3)]).erros.map((e) => e.codigo)).toEqual(['nome_duplicado'])
    expect(validarPartes([p('Título I', 0, 1), p('TITULO i', 2, 3, { arquivada: true })]).ok).toBe(true)
  })
  it('arquivada pode sobrepor', () => {
    expect(validarPartes([p('A', 0, 5), p('B', 3, 8, { arquivada: true })]).ok).toBe(true)
  })
})

describe('medirParte / normalizarRotulo / resolverPartes', () => {
  it('mede artigos, palavras e caracteres', () => {
    expect(medirParte([t('1', 'artigo', 'Art. 1º', 'Art. 1º um dois'), t('2', 'paragrafo', null, 'três quatro'), t('3', 'texto', null, '  ')]))
      .toEqual({ artigos: 1, palavras: 6, caracteres: 26 })
    expect(medirParte([])).toEqual({ artigos: 0, palavras: 0, caracteres: 0 })
  })
  it('normaliza rótulos', () => {
    expect(normalizarRotulo('Art. 5º-A')).toBe('art 5-a')
    expect(normalizarRotulo('Artigo 5° - A')).toBe('art 5-a')
    expect(normalizarRotulo(null)).toBe('')
  })
  it('resolverPartes devolve medida só das resolvidas', () => {
    const r = resolverPartes(v1, [{ iniUid: 'a1', fimUid: 'a4' }, { iniUid: 'zz', fimUid: 'yy' }])
    expect(r[0].medida?.artigos).toBe(2); expect(r[1].medida).toBeNull()
  })
})
