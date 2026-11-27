import { describe, expect, it } from 'vitest'
import {
  FILTROS_VAZIOS, baseBancoSql, contarAplicados, filtrosDeParams, ordemBanco, paramsDeFiltros, whereBancoSql,
} from './questoes-estudio-filtros'

const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const T = '33333333-3333-4333-8333-333333333333'
const B = '44444444-4444-4444-8444-444444444444'
const de = (o: Record<string, string>) => (k: string) => o[k]

describe('filtrosDeParams / paramsDeFiltros', () => {
  it('lê multi-seleção e descarta lixo', () => {
    const f = filtrosDeParams(de({ disc: `${U1}|${U2}|lixo`, ano: '2020|abc|2021', dif: 'facil|xx', status: 'publicada', tipo: 'discursiva', com: 'com', q: '  lei  ' }))
    expect(f.sel.disciplina).toEqual([U1, U2])
    expect(f.sel.ano).toEqual(['2020', '2021'])
    expect(f.sel.dificuldade).toEqual(['facil'])
    expect(f.sel.status).toEqual(['publicada'])
    expect(f.sel.tipo).toEqual(['discursiva'])
    expect(f.com).toBe('com')
    expect(f.q).toBe('lei')
  })
  it('com inválido vira vazio e params só trazem o preenchido', () => {
    const f = filtrosDeParams(de({ com: 'xx', banca: U1 }))
    expect(f.com).toBe('')
    expect(paramsDeFiltros(f).toString()).toBe(`banca=${U1}`)
    expect(paramsDeFiltros({ ...f, q: 'abc' }, true).get('q')).toBe('abc')
    expect(paramsDeFiltros({ ...f, q: 'abc' }).has('q')).toBe(false)
  })
  it('ida e volta preserva a seleção', () => {
    const f = filtrosDeParams(de({ disc: U1, etq: `${U1}|${U2}`, cargo: 'Procurador', com: 'sem' }))
    const p = paramsDeFiltros(f)
    expect(filtrosDeParams((k) => p.get(k))).toEqual(f)
  })
  it('contarAplicados soma valores e o com/sem comentário', () => {
    expect(contarAplicados(FILTROS_VAZIOS)).toBe(0)
    expect(contarAplicados(filtrosDeParams(de({ disc: `${U1}|${U2}`, dif: 'facil', com: 'com' })))).toBe(4)
  })
})

describe('SQL do escopo do banco', () => {
  it('tenant em $1, banco em $2, sempre filtra deletado', () => {
    const b = baseBancoSql(T, B, { q: '', com: '' })
    expect(b.params.slice(0, 2)).toEqual([T, B])
    expect(b.sql).toContain('q.tenant_id = $1')
    expect(b.sql).toContain('q.deletado = false')
    expect(b.sql).toContain('simulado_questao_pasta')
    expect(b.sql).toContain('qp.pasta_id = $2::uuid')
  })
  it('busca escapa curingas e com/sem comentário não gera parâmetro', () => {
    const b = baseBancoSql(T, B, { q: '50%_a', com: 'sem' })
    expect(b.params[2]).toBe('%50\\%\\_a%')
    expect(b.sql).toContain('is null')
    const c = baseBancoSql(T, B, { q: '', com: 'com' })
    expect(c.params).toHaveLength(2)
    expect(c.sql).toContain('is not null')
  })
  it('lista aplica filtros multi com parâmetros em sequência', () => {
    const f = filtrosDeParams(de({ banca: `${U1}|${U2}`, dif: 'medio' }))
    const w = whereBancoSql(T, B, f)
    expect(w.sql).toContain('q.banca_id = any(')
    expect(w.sql).toContain('q.nivel_dificuldade = any(')
    expect(w.params).toContainEqual([U1, U2])
    expect(w.params).toContainEqual(['medio'])
  })
  it('somenteId restringe a uma questão', () => {
    const w = whereBancoSql(T, B, FILTROS_VAZIOS, U1)
    expect(w.sql).toContain('q.id = $3::uuid')
    expect(w.params[2]).toBe(U1)
  })
})

describe('ordenação', () => {
  it('whitelist de ordenação', () => {
    expect(ordemBanco('ano')).toBe('ano')
    expect(ordemBanco('drop table')).toBe('numero')
    expect(ordemBanco(null)).toBe('numero')
  })
})
