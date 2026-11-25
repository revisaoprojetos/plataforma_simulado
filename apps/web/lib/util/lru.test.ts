import { describe, it, expect, vi } from 'vitest'
import { MapLru } from './lru'

describe('MapLru', () => {
  it('respeita o teto e descarta o menos recente', () => {
    const m = new MapLru<string, number>(2)
    m.set('a', 1); m.set('b', 2); m.get('a'); m.set('c', 3)
    expect([...m.keys()]).toEqual(['a', 'c'])
    expect(m.size).toBe(2)
  })
  it('set em chave existente não estoura nem duplica', () => {
    const m = new MapLru<string, number>(2)
    m.set('a', 1); m.set('a', 2); m.set('b', 3)
    expect(m.size).toBe(2); expect(m.get('a')).toBe(2)
  })
  it('TTL opcional expira entradas', () => {
    vi.useFakeTimers()
    const m = new MapLru<string, number>(5, 1000)
    m.set('a', 1)
    vi.advanceTimersByTime(1500)
    expect(m.get('a')).toBeUndefined(); expect(m.has('a')).toBe(false); expect(m.size).toBe(0)
    vi.useRealTimers()
  })
  it('delete/clear funcionam e é um Map', () => {
    const m = new MapLru<string, number>(3)
    m.set('a', 1); m.set('b', 2)
    expect(m instanceof Map).toBe(true)
    m.delete('a'); expect(m.has('a')).toBe(false)
    m.clear(); expect(m.size).toBe(0)
  })
})
