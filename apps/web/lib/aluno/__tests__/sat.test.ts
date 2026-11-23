import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assinarSat, verificarSat } from '../sat'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-23T12:00:00Z')) })
afterEach(() => vi.useRealTimers())

describe('sat (HMAC {sid,tid,exp})', () => {
  it('válido: devolve o payload', () => {
    const p = verificarSat(assinarSat('sess-1', 'ten-1'))
    expect(p?.sid).toBe('sess-1')
    expect(p?.tid).toBe('ten-1')
  })
  it('expirado → null', () => {
    const t = assinarSat('s', 't', 1000)
    vi.setSystemTime(new Date('2026-11-23T12:00:02Z'))
    expect(verificarSat(t)).toBeNull()
  })
  it('expira em 6 h por padrão', () => {
    const t = assinarSat('s', 't')
    vi.setSystemTime(new Date('2026-11-23T17:59:00Z'))
    expect(verificarSat(t)).not.toBeNull()
    vi.setSystemTime(new Date('2026-11-23T18:01:00Z'))
    expect(verificarSat(t)).toBeNull()
  })
  it('adulterado (payload ou assinatura) → null', () => {
    const [b, sig] = assinarSat('s1', 't1').split('.')
    const outro = Buffer.from(JSON.stringify({ sid: 's2', tid: 't1', exp: Date.now() + 1e6 })).toString('base64url')
    expect(verificarSat(`${outro}.${sig}`)).toBeNull()
    expect(verificarSat(`${b}.${sig.slice(0, -2)}AA`)).toBeNull()
    expect(verificarSat(`${b}.${sig}.x`)).toBeNull()
  })
  it('vazio/lixo → null', () => {
    for (const v of [null, undefined, '', 'abc', '.', 'a.b']) expect(verificarSat(v as any)).toBeNull()
  })
})
