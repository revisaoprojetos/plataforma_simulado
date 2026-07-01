import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Token curto e assinado (HMAC-SHA256) que autoriza o Gotenberg a buscar uma
 * página /imprimir sem cookie de sessão. Só o web assina e verifica — o worker
 * recebe a URL já pronta e nunca toca no segredo.
 *
 * Formato: base64url(payloadJSON) + '.' + base64url(hmac)
 * Payload: { t: tenantId, r: recurso ('caderno'), id: recursoId, exp: epochMs }
 */

export interface RenderTokenPayload {
  t: string // tenant_id
  r: string // recurso, ex.: 'caderno'
  id: string // id do recurso
  exp: number // expira em (epoch ms)
}

function secret(): string {
  const s = process.env.PDF_RENDER_SECRET
  if (!s) throw new Error('PDF_RENDER_SECRET não definido')
  return s
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

function sign(payloadB64: string): string {
  return b64url(createHmac('sha256', secret()).update(payloadB64).digest())
}

/** Gera um token válido por `ttlMs` (padrão 5 min). */
export function assinarRenderToken(
  payload: Omit<RenderTokenPayload, 'exp'>,
  ttlMs = 5 * 60_000,
): string {
  const full: RenderTokenPayload = { ...payload, exp: Date.now() + ttlMs }
  const payloadB64 = b64url(Buffer.from(JSON.stringify(full)))
  return `${payloadB64}.${sign(payloadB64)}`
}

/** Verifica assinatura + expiração. Retorna o payload ou null. */
export function verificarRenderToken(token: string | undefined | null): RenderTokenPayload | null {
  if (!token) return null
  // Sem segredo configurado, nenhum token pode ser válido (e não quebra a página).
  if (!process.env.PDF_RENDER_SECRET) return null
  const [payloadB64, sig] = token.split('.')
  if (!payloadB64 || !sig) return null

  const esperada = sign(payloadB64)
  const a = Buffer.from(sig)
  const b = Buffer.from(esperada)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as RenderTokenPayload
    if (!payload.exp || Date.now() > payload.exp) return null
    if (!payload.t || !payload.id) return null
    return payload
  } catch {
    return null
  }
}
