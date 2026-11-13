import { describe, expect, it } from 'vitest'
import { chaveCelula, LIMITE_ALVOS, lerChaveCelula, nomeCurtoPublico, nomesCurtos, resolverPares, resumirPares, retangulo, selecaoVazia } from './matriz-util'
import { normalizarDisponibilidade } from './disp-normalizar'
import { grupoUnicoDaRegra, regraDoGrupo } from '../segmentos/grupo-unico'
import { hrefLiberacaoAulas, hrefMapaRegras, hrefProduto, type PublicoCol } from './mapa-regras-tipos'

describe('nome curto do público', () => {
  it('usa a parte mais específica depois do "|" e capitaliza CAIXA ALTA', () => {
    expect(nomeCurtoPublico('ASSINATURA PASSAPORTE + 1 ANO | TURMA MAIO 2026')).toBe('Turma Maio 2026')
  })
  it('corta nomes longos com reticências', () => {
    const n = nomeCurtoPublico('Grupo Extensivo Procuradoria Estadual Completo', 18)
    expect(n.length).toBeLessThanOrEqual(18); expect(n.endsWith('…')).toBe(true)
  })
  it('nomes duplicados ficam distintos', () => {
    const ps: PublicoCol[] = [
      { chave: 'todos', tipo: 'todos', id: null, nome: 'Todos (regra base)' },
      { chave: 'grupo:1', tipo: 'grupo', id: '1', nome: 'AAA | TURMA MAIO 2026' },
      { chave: 'grupo:2', tipo: 'grupo', id: '2', nome: 'BBB | TURMA MAIO 2026' },
    ]
    const n = nomesCurtos(ps)
    expect(n.todos).toBe('Todos'); expect(n['grupo:1']).not.toBe(n['grupo:2'])
  })
})

describe('seleção -> pares', () => {
  const alvos = ['a1', 'a2', 'a3']
  it('linhas × colunas visíveis + colunas inteiras + células soltas, sem repetir', () => {
    const s = selecaoVazia()
    s.linhas.add('a1'); s.colunas.add('grupo:x'); s.celulas.add(chaveCelula('a2', 'todos')); s.celulas.add(chaveCelula('a1', 'todos'))
    const m = resolverPares(s, ['todos', 'grupo:x'], alvos)
    expect([...m.get('todos')!].sort()).toEqual(['a1', 'a2'])
    expect([...m.get('grupo:x')!].sort()).toEqual(['a1', 'a2', 'a3'])
    expect(resumirPares(m)).toMatchObject({ alvos: 3, publicos: 2, pares: 5, erro: null })
  })
  it('chave de célula com ":" no público faz round-trip', () => {
    expect(lerChaveCelula(chaveCelula('id', 'grupo:abc'))).toEqual({ alvoId: 'id', publico: 'grupo:abc' })
  })
  it('limite de alvos por chamada', () => {
    const s = selecaoVazia(); const muitos = Array.from({ length: LIMITE_ALVOS + 1 }, (_, i) => `a${i}`)
    s.colunas.add('todos')
    expect(resumirPares(resolverPares(s, ['todos'], muitos)).erro).toMatch(/máx/)
  })
  it('retângulo (arrastar / shift)', () => {
    const r = retangulo(['l0', 'l1', 'l2'], ['c0', 'c1'], { l: 2, c: 1 }, { l: 1, c: 0 })
    expect(r.sort()).toEqual(['l1|c0', 'l1|c1', 'l2|c0', 'l2|c1'])
  })
})

describe('disponibilidade normalizada', () => {
  it('rejeita data sem data e aceita cronograma válido', () => {
    expect(normalizarDisponibilidade({ tipo: 'data' })).toBeNull()
    expect(normalizarDisponibilidade({ tipo: 'foo' })).toBeNull()
    expect(normalizarDisponibilidade({ tipo: 'cronograma', sem_plano: 'planilha', com_plano: 'plano', dias_antes: 3 })).toMatchObject({ tipo: 'cronograma', dias_antes: 3 })
    expect(normalizarDisponibilidade({ tipo: 'cronograma', sem_plano: 'x', com_plano: 'plano' })).toBeNull()
    expect(normalizarDisponibilidade({ tipo: 'intervalo', dias: -4, antes: 'oculto' })).toMatchObject({ dias: 0, antes: 'oculto' })
  })
})

describe('segmento de um grupo só', () => {
  it('regraDoGrupo <-> grupoUnicoDaRegra', () => {
    expect(grupoUnicoDaRegra(regraDoGrupo('g-123'))).toBe('g-123')
    expect(grupoUnicoDaRegra({ op: 'e', grupos: [] })).toBeNull()
  })
})

describe('hrefs gerados para as telas donas (rotas reais)', () => {
  const ABAS = ['informacoes', 'conteudos', 'vitrine', 'grupos', 'visibilidade', 'regras', 'atualizacoes']
  it('abas do produto existem no editor', () => {
    for (const a of ['conteudos', 'grupos', 'visibilidade', 'informacoes']) expect(ABAS).toContain(new URL(hrefProduto('p1', a), 'http://x').searchParams.get('aba'))
    expect(new URL(hrefMapaRegras('p1'), 'http://x').searchParams.get('aba')).toBe('regras')
  })
  it('liberação de aulas aponta para Gerador > liberacao-aulas > ?vis=', () => {
    const u = new URL(hrefLiberacaoAulas('p1', 'excecoes'), 'http://x')
    expect(u.pathname).toBe('/admin/revisao/cronograma'); expect(u.searchParams.get('aba')).toBe('gerador')
    expect(u.searchParams.get('sub')).toBe('liberacao-aulas'); expect(u.searchParams.get('vis')).toBe('excecoes'); expect(u.searchParams.get('produto')).toBe('p1')
  })
})
