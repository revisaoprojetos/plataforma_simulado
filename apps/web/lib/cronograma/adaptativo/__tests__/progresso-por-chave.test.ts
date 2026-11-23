import { describe, expect, it } from 'vitest'
import { aulaKeyDoMetaId, corrigirProgressoPorChave, idComIndice } from '../progresso-por-chave'

const AS = ['d:A', 'd:B', 'd:C', 'd:D']

describe('aulaKeyDoMetaId / idComIndice', () => {
  it('resolve pela posição e ignora ids sem aula', () => {
    expect(aulaKeyDoMetaId('pf:2', AS)).toBe('d:C')
    expect(aulaKeyDoMetaId('pp:1:3', AS)).toBe('d:B')
    expect(aulaKeyDoMetaId('rf:4:3', AS)).toBe('d:D')
    expect(aulaKeyDoMetaId('lp:9', AS)).toBeNull()
    expect(aulaKeyDoMetaId('pf:99', AS)).toBeNull()
    expect(aulaKeyDoMetaId('pf:1', null)).toBeNull()
    expect(aulaKeyDoMetaId('pf:0', ['?:0'])).toBeNull()
  })
  it('troca o índice preservando prefixo e sufixo', () => {
    expect(idComIndice('pp:3:2', 7)).toBe('pp:7:2')
    expect(idComIndice('rf:4:3', 1)).toBe('rf:4:1')
    expect(idComIndice('lp:3', 1)).toBeNull()
  })
})

describe('corrigirProgressoPorChave', () => {
  it('segue o documento quando a posição mudou', () => {
    const r = corrigirProgressoPorChave([{ meta_id: 'pf:2', aula_key: 'd:B' }, { meta_id: 'pf:3', aula_key: 'd:C' }], AS)
    expect(r.correcoes.map((c) => [c.de, c.para])).toEqual([['pf:2', 'pf:1'], ['pf:3', 'pf:2']])
  })
  it('é idempotente: linhas já na posição certa não geram correção', () => {
    expect(corrigirProgressoPorChave([{ meta_id: 'pf:1', aula_key: 'd:B' }], AS).correcoes).toEqual([])
  })
  it('sem aula_key ou sem aula (lp/og) não age', () => {
    expect(corrigirProgressoPorChave([{ meta_id: 'pf:2' }, { meta_id: 'lp:1', aula_key: 'd:A' }, { meta_id: 'og:x:pf:#', aula_key: 'd:A' }], AS)).toEqual({ correcoes: [], ignoradas: [] })
  })
  it('chave que não existe mais no AS fica como está (ignorada)', () => {
    const r = corrigirProgressoPorChave([{ meta_id: 'pf:1', aula_key: 'd:Z' }], AS)
    expect(r.correcoes).toEqual([])
    expect(r.ignoradas).toEqual([{ id: 'pf:1', motivo: 'chave_ausente_no_as' }])
  })
  it('chave duplicada no AS é ambígua', () => {
    const r = corrigirProgressoPorChave([{ meta_id: 'pf:0', aula_key: 'd:B' }], ['d:A', 'd:B', 'd:B'])
    expect(r.correcoes).toEqual([])
    expect(r.ignoradas[0].motivo).toBe('chave_duplicada_no_as')
  })
  it('troca de posição (swap) é permitida quando as duas linhas saem juntas', () => {
    const r = corrigirProgressoPorChave([{ meta_id: 'pf:0', aula_key: 'd:B' }, { meta_id: 'pf:1', aula_key: 'd:A' }], AS)
    expect(r.correcoes.map((c) => [c.de, c.para]).sort()).toEqual([['pf:0', 'pf:1'], ['pf:1', 'pf:0']])
  })
  it('destino ocupado por linha que não sai (ou sem chave) bloqueia a correção', () => {
    const r = corrigirProgressoPorChave([{ meta_id: 'pf:0', aula_key: 'd:B' }, { meta_id: 'pf:1', aula_key: null }], AS)
    expect(r.correcoes).toEqual([])
    expect(r.ignoradas[0].motivo).toBe('destino_ocupado')
  })
  it('dois candidatos para o mesmo destino: nenhum é movido', () => {
    const r = corrigirProgressoPorChave([{ meta_id: 'pf:0', aula_key: 'd:C' }, { meta_id: 'pf:3', aula_key: 'd:C' }], AS)
    expect(r.correcoes).toEqual([])
    expect(r.ignoradas.map((i) => i.motivo)).toEqual(['destino_duplicado', 'destino_duplicado'])
  })
  it('cada tipo de meta da mesma aula acompanha', () => {
    const r = corrigirProgressoPorChave([{ meta_id: 'pf:3', aula_key: 'd:B' }, { meta_id: 'fl:3', aula_key: 'd:B' }, { meta_id: 'qu:3:hist:1', aula_key: 'd:B' }, { meta_id: 'rf:2:3', aula_key: 'd:B' }], AS)
    expect(r.correcoes.map((c) => c.para).sort()).toEqual(['fl:1', 'pf:1', 'qu:1:hist:1', 'rf:2:1'])
  })
})
