import { describe, it, expect } from 'vitest'
import { tipoPadrao } from './tipos'
import { camposDoNoGerador, montarFluxoGerador, type TipoMetaFluxo } from './fluxo-gerador'

const tipos: TipoMetaFluxo[] = [
  { ...tipoPadrao('pdf'), id: 'id-pdf', nome: 'PDFull', ordem: 1, ativo: true },
  { ...tipoPadrao('quest'), id: 'id-q', nome: 'Questões', ordem: 0, ativo: false },
]

describe('fluxo do gerador', () => {
  it('ids únicos e arestas coerentes', () => {
    const ds = montarFluxoGerador(tipos)
    const ids = ds.flatMap((d) => d.nos.map((n) => n.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const d of ds) { const s = new Set(d.nos.map((n) => n.id)); for (const a of d.arestas) { expect(s.has(a.de)).toBe(true); expect(s.has(a.para)).toBe(true) } }
  })
  it('um nó por tipo, na ordem R10; inativo aparece como "aberto"', () => {
    const d = montarFluxoGerador(tipos).find((x) => x.id === 'tipos')!
    expect(d.nos.filter((n) => n.id.startsWith('t.') && n.id !== 't.ini').map((n) => n.id)).toEqual(['t.quest', 't.pdf'])
    expect(d.nos.find((n) => n.id === 't.quest')!.tipo).toBe('aberto')
  })
  it('só nós de tipo são editáveis, com alvo = id do tipo', () => {
    const e = camposDoNoGerador('t.pdf', tipos)!
    expect(e.alvo).toBe('id-pdf')
    expect(e.campos.map((c) => c.chave)).toEqual(expect.arrayContaining(['nome', 'mostra_links', 'sempre_no_docx', 'ativo']))
    expect(camposDoNoGerador('g.comp', tipos)).toBeNull()
    expect(camposDoNoGerador('t.inexistente', tipos)).toBeNull()
  })
})
