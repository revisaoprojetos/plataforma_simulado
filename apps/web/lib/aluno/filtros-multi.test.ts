import { describe, expect, it } from 'vitest'
import { alternarItem, expandirAssuntos, juntarLista, lerLista } from './filtros-multi'

describe('filtros-multi', () => {
  it('lê/junta listas e aceita valor único', () => {
    expect(lerLista('a|b||a')).toEqual(['a', 'b'])
    expect(lerLista('x')).toEqual(['x'])
    expect(lerLista(undefined)).toEqual([])
    expect(juntarLista([])).toBeUndefined()
    expect(juntarLista(['a', 'b'])).toBe('a|b')
  })
  it('alterna item', () => {
    expect(alternarItem('a', 'b')).toBe('a|b')
    expect(alternarItem('a|b', 'a')).toBe('b')
    expect(alternarItem('a', 'a')).toBeUndefined()
  })
  it('expande sub-assuntos (e tolera ciclo)', () => {
    const t = [{ id: '1', pai_id: null }, { id: '2', pai_id: '1' }, { id: '3', pai_id: '2' }, { id: '4', pai_id: null }]
    expect(expandirAssuntos(['1'], t).sort()).toEqual(['1', '2', '3'])
    expect(expandirAssuntos([], t)).toEqual([])
    expect(expandirAssuntos(['1'], [{ id: '1', pai_id: '2' }, { id: '2', pai_id: '1' }]).sort()).toEqual(['1', '2'])
  })
})
