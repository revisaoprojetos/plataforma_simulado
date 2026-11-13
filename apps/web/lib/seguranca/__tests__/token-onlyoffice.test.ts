import { describe, it, expect, beforeEach } from 'vitest'
import { emitirTokenOO, validarTokenOO, comTokenOO } from '../token-onlyoffice'

beforeEach(() => { process.env.ONLYOFFICE_ACCESS_SECRET = 'segredo-de-teste-com-mais-de-16' })
const T0 = 1_700_000_000_000

describe('token-onlyoffice', () => {
  it('valido', () => {
    const t = emitirTokenOO({ docId: 'd1', escopo: 'escrever', tenantId: 't1' }, T0)!
    const p = validarTokenOO(t, { docId: 'd1', escopo: 'escrever' }, T0 + 1000)
    expect(p?.docId).toBe('d1'); expect(p?.tenantId).toBe('t1')
  })
  it('expirado', () => {
    const t = emitirTokenOO({ docId: 'd1', escopo: 'ler', ttlSeg: 60 }, T0)!
    expect(validarTokenOO(t, { docId: 'd1', escopo: 'ler' }, T0 + 61_000)).toBeNull()
  })
  it('adulterado (payload e assinatura)', () => {
    const t = emitirTokenOO({ docId: 'd1', escopo: 'ler' }, T0)!
    const [c, s] = t.split('.')
    const falso = Buffer.from(JSON.stringify({ docId: 'd1', escopo: 'escrever', exp: 9999999999 })).toString('base64url')
    expect(validarTokenOO(`${falso}.${s}`, { docId: 'd1', escopo: 'ler' }, T0)).toBeNull()
    expect(validarTokenOO(`${c}.${s}x`, { docId: 'd1', escopo: 'ler' }, T0)).toBeNull()
    expect(validarTokenOO('lixo', { escopo: 'ler' }, T0)).toBeNull()
  })
  it('docId trocado', () => {
    const t = emitirTokenOO({ docId: 'd1', escopo: 'escrever' }, T0)!
    expect(validarTokenOO(t, { docId: 'd2', escopo: 'ler' }, T0)).toBeNull()
  })
  it('escopo insuficiente; escrever satisfaz ler', () => {
    const l = emitirTokenOO({ docId: 'd1', escopo: 'ler' }, T0)!
    expect(validarTokenOO(l, { docId: 'd1', escopo: 'escrever' }, T0)).toBeNull()
    const e = emitirTokenOO({ docId: 'd1', escopo: 'escrever' }, T0)!
    expect(validarTokenOO(e, { docId: 'd1', escopo: 'ler' }, T0)).not.toBeNull()
  })
  it('segredo diferente invalida; sem segredo nao emite', () => {
    const t = emitirTokenOO({ docId: 'd1', escopo: 'ler' }, T0)!
    process.env.ONLYOFFICE_ACCESS_SECRET = 'outro-segredo-totalmente-diferente'
    expect(validarTokenOO(t, { docId: 'd1', escopo: 'ler' }, T0)).toBeNull()
    delete process.env.ONLYOFFICE_ACCESS_SECRET
    const a = process.env.APP_ENCRYPTION_KEY, b = process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.APP_ENCRYPTION_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(emitirTokenOO({ docId: 'd1', escopo: 'ler' }, T0)).toBeNull()
    if (a) process.env.APP_ENCRYPTION_KEY = a; if (b) process.env.SUPABASE_SERVICE_ROLE_KEY = b
  })
  it('comTokenOO', () => {
    expect(comTokenOO('http://x/a', 'a.b')).toBe('http://x/a?access_token=a.b')
    expect(comTokenOO('http://x/a?q=1', 'a.b')).toBe('http://x/a?q=1&access_token=a.b')
    expect(comTokenOO('http://x/a', null)).toBe('http://x/a')
  })
})
