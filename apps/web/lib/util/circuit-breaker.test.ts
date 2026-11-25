import { describe, it, expect } from 'vitest'
import { criarCircuitBreaker } from './circuit-breaker'

describe('circuit-breaker', () => {
  it('abre após N falhas e pula chamadas', async () => {
    let t = 0
    const cb = criarCircuitBreaker({ limite: 3, pausaMs: 1000, agora: () => t })
    let chamadas = 0
    const ruim = async () => { chamadas++; throw new Error('x') }
    for (let i = 0; i < 3; i++) expect(await cb.executar(ruim, 'fb')).toBe('fb')
    expect(cb.aberto()).toBe(true)
    expect(await cb.executar(ruim, 'fb')).toBe('fb')
    expect(chamadas).toBe(3)
  })
  it('meia-abertura: sonda após a pausa, fecha em sucesso', async () => {
    let t = 0
    const cb = criarCircuitBreaker({ limite: 1, pausaMs: 1000, agora: () => t })
    await cb.executar(async () => { throw new Error('x') }, 0)
    expect(cb.permitir()).toBe(false)
    t = 1001
    expect(await cb.executar(async () => 7, 0)).toBe(7)
    expect(cb.aberto()).toBe(false)
    expect(cb.permitir()).toBe(true)
  })
  it('só uma sonda por vez e reabre se a sonda falhar', async () => {
    let t = 0
    const cb = criarCircuitBreaker({ limite: 1, pausaMs: 1000, agora: () => t })
    cb.falha()
    t = 1001
    expect(cb.permitir()).toBe(true)
    expect(cb.permitir()).toBe(false)
    cb.falha()
    expect(cb.aberto()).toBe(true)
  })
})
