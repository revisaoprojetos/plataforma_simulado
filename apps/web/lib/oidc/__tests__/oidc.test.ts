import { describe, it, expect, beforeAll } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { decodeJwt, jwtVerify } from 'jose'
import { parseClients, type OidcClient } from '../config'
import { desafioS256, redirectUriValido, verificarPkce } from '../pkce'
import { montarChaves, type OidcKeys } from '../keys'
import { emitirCode, emitirIdToken, verificarAccessToken, verificarCode } from '../tokens'
import { processarToken, resolverLogout, urlRetorno, validarAuthorize } from '../protocolo'

const ISS = 'https://simulado.exemplo.com/oidc'
const VERIFIER = 'a'.repeat(43) + '-._~XYZ'
const SECRET = 'segredo-bem-longo-123456'
const clients: OidcClient[] = parseClients(JSON.stringify([
  { id: 'bookstack', secret: SECRET, redirectUris: ['https://bs.exemplo.com/oidc/callback'], postLogoutUris: ['https://bs.exemplo.com/'], pkce: 'required' },
  { id: 'affine', secret: 'outro-segredo-bem-longo-9', redirectUris: ['https://affine.exemplo.com/oauth/callback'], pkce: 'optional' },
]))
let keys: OidcKeys
beforeAll(async () => { keys = await montarChaves(generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey) })

const id = { sub: 't1:e1', email: 'aluno@x.com', name: 'Aluno Teste' }
const novoCode = (over: Partial<Parameters<typeof emitirCode>[2]> = {}) =>
  emitirCode(keys, ISS, { ...id, clientId: 'bookstack', redirectUri: 'https://bs.exemplo.com/oidc/callback', scope: 'openid email', authTime: 1, nonce: 'n1', challenge: desafioS256(VERIFIER), ...over })
const usados = new Set<string>()
const consumir = async (j: string) => (usados.has(j) ? false : (usados.add(j), true))
const tok = (form: Record<string, string>, authorization: string | null = null) =>
  processarToken({ form: new URLSearchParams(form), authorization, clients, keys, issuer: ISS, consumirCode: consumir })
const basic = (i: string, s: string) => 'Basic ' + Buffer.from(`${i}:${s}`).toString('base64')

describe('clients', () => {
  it('descarta clients inválidos (secret curto / sem redirect)', () => {
    expect(parseClients('[{"id":"a","secret":"x","redirectUris":["https://a/b"]}]')).toEqual([])
    expect(parseClients('lixo')).toEqual([])
    expect(clients).toHaveLength(2)
  })
})

describe('redirect_uri', () => {
  it('igualdade exata', () => {
    const c = clients[0]
    expect(redirectUriValido(c, 'https://bs.exemplo.com/oidc/callback')).toBe(true)
    expect(redirectUriValido(c, 'https://bs.exemplo.com/oidc/callback/')).toBe(false)
    expect(redirectUriValido(c, 'https://bs.exemplo.com/oidc/callback?x=1')).toBe(false)
    expect(redirectUriValido(c, 'https://evil.com/oidc/callback')).toBe(false)
    expect(redirectUriValido(c, null)).toBe(false)
  })
  it('authorize com redirect_uri inválida NÃO redireciona (página de erro)', () => {
    const r = validarAuthorize(new URLSearchParams({ client_id: 'bookstack', redirect_uri: 'https://evil.com/cb', response_type: 'code', scope: 'openid' }), clients)
    expect(r.tipo).toBe('erro_pagina')
  })
  it('exige PKCE S256 quando required; rejeita plain', () => {
    const base = { client_id: 'bookstack', redirect_uri: 'https://bs.exemplo.com/oidc/callback', response_type: 'code', scope: 'openid', state: 's' }
    expect(validarAuthorize(new URLSearchParams(base), clients).tipo).toBe('erro_redirect')
    expect(validarAuthorize(new URLSearchParams({ ...base, code_challenge: desafioS256(VERIFIER), code_challenge_method: 'plain' }), clients).tipo).toBe('erro_redirect')
    expect(validarAuthorize(new URLSearchParams({ ...base, code_challenge: desafioS256(VERIFIER), code_challenge_method: 'S256' }), clients).tipo).toBe('ok')
  })
  it('PKCE opcional passa sem challenge', () => {
    const r = validarAuthorize(new URLSearchParams({ client_id: 'affine', redirect_uri: 'https://affine.exemplo.com/oauth/callback', response_type: 'code', scope: 'openid email' }), clients)
    expect(r.tipo).toBe('ok')
  })
  it('urlRetorno preserva query existente', () => {
    expect(urlRetorno('https://a/b?x=1', { code: 'c', state: undefined })).toBe('https://a/b?x=1&code=c')
  })
})

describe('PKCE S256', () => {
  it('confere verifier/challenge', () => {
    expect(verificarPkce(VERIFIER, desafioS256(VERIFIER))).toBe(true)
    expect(verificarPkce(VERIFIER + 'x', desafioS256(VERIFIER))).toBe(false)
    expect(verificarPkce('curto', desafioS256('curto'))).toBe(false)
    expect(verificarPkce(null, desafioS256(VERIFIER))).toBe(false)
  })
})

describe('code', () => {
  it('emite e verifica; adulterado/outro issuer falha', async () => {
    const c = await novoCode()
    const p = await verificarCode(keys, ISS, c)
    expect(p?.sub).toBe('t1:e1')
    expect(p?.jti).toBeTruthy()
    expect(await verificarCode(keys, 'https://outro/oidc', c)).toBeNull()
    expect(await verificarCode(keys, ISS, c.slice(0, -2) + 'AA')).toBeNull()
    const outras = await montarChaves(generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey)
    expect(await verificarCode(outras, ISS, c)).toBeNull()
  })
})

describe('/token', () => {
  it('fluxo feliz (client_secret_basic) e claims do id_token', async () => {
    const r = await tok({ grant_type: 'authorization_code', code: await novoCode(), redirect_uri: 'https://bs.exemplo.com/oidc/callback', code_verifier: VERIFIER }, basic('bookstack', SECRET))
    expect(r.status).toBe(200)
    const idt = r.body.id_token as string
    const { payload, protectedHeader } = await jwtVerify(idt, keys.publicKey, { issuer: ISS, audience: 'bookstack', algorithms: ['RS256'] })
    expect(protectedHeader.kid).toBe(keys.kid)
    expect(payload).toMatchObject({ sub: 't1:e1', email: 'aluno@x.com', email_verified: true, name: 'Aluno Teste', preferred_username: 'aluno@x.com', nonce: 'n1' })
    expect(payload.exp! - payload.iat!).toBeGreaterThan(0)
    expect((await verificarAccessToken(keys, ISS, r.body.access_token as string))?.sub).toBe('t1:e1')
    expect(await verificarAccessToken(keys, ISS, idt)).toBeNull() // id_token não serve como access_token
  })
  it('client_secret_post com PKCE opcional sem challenge', async () => {
    const code = await novoCode({ clientId: 'affine', redirectUri: 'https://affine.exemplo.com/oauth/callback', challenge: undefined })
    const r = await tok({ grant_type: 'authorization_code', code, redirect_uri: 'https://affine.exemplo.com/oauth/callback', client_id: 'affine', client_secret: 'outro-segredo-bem-longo-9' })
    expect(r.status).toBe(200)
  })
  it('rejeita client_secret errado (401 invalid_client)', async () => {
    const code = await novoCode()
    const form = { grant_type: 'authorization_code', code, redirect_uri: 'https://bs.exemplo.com/oidc/callback', code_verifier: VERIFIER }
    expect((await tok(form, basic('bookstack', 'errado'))).status).toBe(401)
    expect((await tok({ ...form, client_id: 'bookstack', client_secret: SECRET + 'x' })).body.error).toBe('invalid_client')
    expect((await tok({ ...form, client_id: 'inexistente', client_secret: SECRET })).status).toBe(401)
    expect((await tok(form)).status).toBe(401)
  })
  it('rejeita verifier errado, redirect_uri diferente, code de outro client e replay', async () => {
    const auth = basic('bookstack', SECRET)
    const f = (code: string, extra: Record<string, string> = {}) => ({ grant_type: 'authorization_code', code, redirect_uri: 'https://bs.exemplo.com/oidc/callback', code_verifier: VERIFIER, ...extra })
    expect((await tok(f(await novoCode(), { code_verifier: 'b'.repeat(50) }), auth)).body.error).toBe('invalid_grant')
    expect((await tok(f(await novoCode(), { redirect_uri: 'https://bs.exemplo.com/outro' }), auth)).body.error).toBe('invalid_grant')
    expect((await tok(f(await novoCode({ clientId: 'affine' })), auth)).body.error).toBe('invalid_grant')
    const c = await novoCode()
    expect((await tok(f(c), auth)).status).toBe(200)
    expect((await tok(f(c), auth)).body.error).toBe('invalid_grant')
  })
})

describe('id_token direto e logout', () => {
  it('omite nonce quando ausente', async () => {
    const t = await emitirIdToken(keys, ISS, 'bookstack', id, { authTime: 1 })
    expect(decodeJwt(t).nonce).toBeUndefined()
  })
  it('post_logout_redirect_uri só se registrada', () => {
    expect(resolverLogout(clients, { clientIdHint: 'bookstack', postLogoutUri: 'https://bs.exemplo.com/' }).destino).toBe('https://bs.exemplo.com/')
    expect(resolverLogout(clients, { clientIdHint: 'bookstack', postLogoutUri: 'https://evil.com/' }).erro).toBeTruthy()
    expect(resolverLogout(clients, { clientIdHint: 'affine', postLogoutUri: 'https://bs.exemplo.com/' }).erro).toBeTruthy()
    expect(resolverLogout(clients, { clientIdHint: null, postLogoutUri: null }).destino).toBeNull()
  })
})
