import { describe, it, expect } from 'vitest'
import { mapearContagensBancos, conjuntoPastas, contagensBancosRpc, pastasComEstudantesRpc } from './contagens-bancos'

describe('contagens-bancos', () => {
  it('mapeia linhas e zera ids ausentes (bigint vem como string)', () => {
    expect(mapearContagensBancos(['a', 'b'], [{ pasta_id: 'a', questoes: '3', estudantes: 5 }])).toEqual({ a: { q: 3, e: 5 }, b: { q: 0, e: 0 } })
    expect(mapearContagensBancos(['a'], null)).toEqual({ a: { q: 0, e: 0 } })
  })
  it('conjuntoPastas', () => {
    expect([...conjuntoPastas([{ pasta_id: 'x' }, { pasta_id: 'x' }])]).toEqual(['x'])
  })
  it('RPC ausente devolve null (fallback) e memoriza', async () => {
    let n = 0
    const svc = { rpc: async () => { n++; return { data: null, error: { message: 'Could not find the function public.contagens_bancos_wizard in the schema cache' } } } }
    expect(await contagensBancosRpc(svc, 't', ['a'])).toBeNull()
    expect(await contagensBancosRpc(svc, 't', ['a'])).toBeNull()
    expect(n).toBe(1)
  })
  it('pastasComEstudantesRpc faz chunk de 80', async () => {
    const chamadas: number[] = []
    const svc = { rpc: async (_f: string, a: any) => { chamadas.push(a.p_pastas.length); return { data: [{ pasta_id: a.p_pastas[0] }], error: null } } }
    const ids = Array.from({ length: 170 }, (_, i) => `p${i}`)
    const r = await pastasComEstudantesRpc(svc, 't', ids)
    expect(chamadas).toEqual([80, 80, 10])
    expect(r!.size).toBe(3)
  })
})
