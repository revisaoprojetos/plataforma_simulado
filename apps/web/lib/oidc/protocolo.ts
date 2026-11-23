/**
 * Lógica pura do protocolo (sem Next/IO) — testável. Os route handlers só fazem a cola HTTP.
 */
import { findClient, type OidcClient } from './config'
import { igualConstante, postLogoutUriValido, redirectUriValido, verificarPkce } from './pkce'
import { ACCESS_TTL_S, emitirAccessToken, emitirIdToken, verificarCode } from './tokens'
import type { OidcKeys } from './keys'

export type ResultadoAuthorize =
  | { tipo: 'erro_pagina'; mensagem: string }
  | { tipo: 'erro_redirect'; redirectUri: string; error: string; descricao: string; state?: string }
  | { tipo: 'ok'; client: OidcClient; redirectUri: string; state?: string; nonce?: string; challenge?: string; scope: string; promptNone: boolean }

/** Valida os parâmetros do /authorize. Enquanto client/redirect_uri não validam, NUNCA redireciona (sem open redirect). */
export function validarAuthorize(p: URLSearchParams, clients: OidcClient[]): ResultadoAuthorize {
  const client = findClient(clients, p.get('client_id'))
  if (!client) return { tipo: 'erro_pagina', mensagem: 'Aplicativo não reconhecido (client_id inválido).' }
  const redirectUri = p.get('redirect_uri')
  if (!redirectUriValido(client, redirectUri)) return { tipo: 'erro_pagina', mensagem: 'redirect_uri não autorizada para este aplicativo.' }
  const state = p.get('state') ?? undefined
  const erro = (error: string, descricao: string): ResultadoAuthorize => ({ tipo: 'erro_redirect', redirectUri: redirectUri!, error, descricao, state })

  if (p.get('response_type') !== 'code') return erro('unsupported_response_type', 'Somente response_type=code é suportado.')
  const scope = (p.get('scope') ?? '').split(/\s+/).filter(Boolean)
  if (!scope.includes('openid')) return erro('invalid_scope', 'O escopo "openid" é obrigatório.')
  const challenge = p.get('code_challenge') ?? undefined
  const metodo = p.get('code_challenge_method') ?? (challenge ? 'plain' : undefined)
  if (challenge) {
    if (metodo !== 'S256') return erro('invalid_request', 'Somente code_challenge_method=S256 é suportado.')
    if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(challenge)) return erro('invalid_request', 'code_challenge inválido.')
  } else if (client.pkce === 'required') {
    return erro('invalid_request', 'PKCE (code_challenge S256) é obrigatório para este aplicativo.')
  }
  const nonce = p.get('nonce') ?? undefined
  if (nonce && nonce.length > 512) return erro('invalid_request', 'nonce muito longo.')
  if (state && state.length > 2048) return erro('invalid_request', 'state muito longo.')
  return {
    tipo: 'ok', client, redirectUri: redirectUri!, state, nonce, challenge,
    scope: scope.filter((s) => ['openid', 'profile', 'email'].includes(s)).join(' ') || 'openid',
    promptNone: (p.get('prompt') ?? '').split(/\s+/).includes('none'),
  }
}

/** Monta a URL de retorno (code ou erro) preservando a query existente do redirect_uri. */
export function urlRetorno(redirectUri: string, params: Record<string, string | undefined>): string {
  const u = new URL(redirectUri)
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v)
  return u.toString()
}

export interface EntradaToken {
  form: URLSearchParams
  authorization: string | null
  clients: OidcClient[]
  keys: OidcKeys
  issuer: string
  /** Consome o jti do code; false = já usado (replay). Best-effort (Redis ou memória). */
  consumirCode: (jti: string) => Promise<boolean>
}
export interface SaidaToken { status: number; body: Record<string, unknown>; wwwAuthenticate?: boolean }

function decodeForm(s: string): string { try { return decodeURIComponent(s.replace(/\+/g, ' ')) } catch { return s } }

/** Autentica o client (client_secret_basic ou client_secret_post). Retorna o client ou null. */
export function autenticarClient(form: URLSearchParams, authorization: string | null, clients: OidcClient[]): { client: OidcClient | null; basic: boolean } {
  let id: string | null = null
  let secret: string | null = null
  let basic = false
  if (authorization && /^basic\s/i.test(authorization)) {
    basic = true
    try {
      const dec = Buffer.from(authorization.slice(6).trim(), 'base64').toString('utf8')
      const i = dec.indexOf(':')
      if (i > 0) { id = decodeForm(dec.slice(0, i)); secret = decodeForm(dec.slice(i + 1)) }
    } catch { /* inválido */ }
  } else {
    id = form.get('client_id')
    secret = form.get('client_secret')
  }
  const client = findClient(clients, id)
  // Sempre compara (mesmo sem client) p/ não vazar existência por tempo.
  const ok = igualConstante(secret ?? '', client?.secret ?? '\u0000nao-existe')
  return { client: client && ok && secret ? client : null, basic }
}

export async function processarToken(e: EntradaToken): Promise<SaidaToken> {
  const { client, basic } = autenticarClient(e.form, e.authorization, e.clients)
  if (!client) return { status: 401, body: { error: 'invalid_client', error_description: 'Autenticação do client falhou.' }, wwwAuthenticate: basic }
  if (e.form.get('grant_type') !== 'authorization_code') return { status: 400, body: { error: 'unsupported_grant_type' } }
  const codeStr = e.form.get('code')
  const invalido = (d: string): SaidaToken => ({ status: 400, body: { error: 'invalid_grant', error_description: d } })
  if (!codeStr) return { status: 400, body: { error: 'invalid_request', error_description: 'code ausente.' } }
  const code = await verificarCode(e.keys, e.issuer, codeStr)
  if (!code) return invalido('code inválido ou expirado.')
  if (code.clientId !== client.id) return invalido('code emitido para outro client.')
  if (e.form.get('redirect_uri') !== code.redirectUri) return invalido('redirect_uri não confere.')
  if (code.challenge) {
    if (!verificarPkce(e.form.get('code_verifier'), code.challenge)) return invalido('code_verifier inválido.')
  } else if (client.pkce === 'required') {
    return invalido('PKCE obrigatório.')
  }
  if (!(await e.consumirCode(code.jti))) return invalido('code já utilizado.')
  const id = { sub: code.sub, email: code.email, name: code.name }
  const [idToken, accessToken] = await Promise.all([
    emitirIdToken(e.keys, e.issuer, client.id, id, { nonce: code.nonce, authTime: code.authTime }),
    emitirAccessToken(e.keys, e.issuer, client.id, id),
  ])
  return { status: 200, body: { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TTL_S, id_token: idToken, scope: code.scope } }
}

/** Destino do logout: só vale post_logout_redirect_uri registrada (igualdade exata). */
export function resolverLogout(clients: OidcClient[], opts: { clientIdHint: string | null; postLogoutUri: string | null }): { destino: string | null; erro?: string } {
  if (!opts.postLogoutUri) return { destino: null }
  const candidatos = opts.clientIdHint ? clients.filter((c) => c.id === opts.clientIdHint) : clients
  if (candidatos.some((c) => postLogoutUriValido(c, opts.postLogoutUri))) return { destino: opts.postLogoutUri }
  return { destino: null, erro: 'post_logout_redirect_uri não autorizada.' }
}
