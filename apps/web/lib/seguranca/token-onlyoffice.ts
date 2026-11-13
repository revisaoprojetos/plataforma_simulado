import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Token HMAC-SHA256 de acesso ao OnlyOffice/WOPI (servidor-para-servidor, sem cookie).
 * Formato: base64url(JSON payload) + '.' + base64url(HMAC). Vai na URL como `access_token` (padrão WOPI).
 * Sem segredo configurado => NADA é emitido nem validado (falha fechada; nunca existe segredo default fixo).
 */
export type EscopoOO = 'ler' | 'escrever'
export interface PayloadOO { docId: string; escopo: EscopoOO; tenantId?: string; exp: number }

export const TTL_EDICAO_SEG = 8 * 60 * 60
export const TTL_LEITURA_SEG = 2 * 60 * 60

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')

function segredo(): Buffer | null {
  const dedicado = process.env.ONLYOFFICE_ACCESS_SECRET
  if (dedicado && dedicado.length >= 16) return Buffer.from(dedicado)
  const base = process.env.APP_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) return null
  // chave derivada (separação de domínio: não reutiliza a chave crua para outro fim)
  return createHmac('sha256', base).update('onlyoffice-access-token-v1').digest()
}

function assinar(corpo: string, key: Buffer): string {
  return b64(createHmac('sha256', key).update(corpo).digest())
}

export function emitirTokenOO(
  p: { docId: string; escopo: EscopoOO; tenantId?: string | null; ttlSeg?: number },
  agoraMs: number = Date.now(),
): string | null {
  const key = segredo()
  if (!key || !p.docId) return null
  const ttl = p.ttlSeg ?? (p.escopo === 'escrever' ? TTL_EDICAO_SEG : TTL_LEITURA_SEG)
  const payload: PayloadOO = { docId: p.docId, escopo: p.escopo, exp: Math.floor(agoraMs / 1000) + ttl }
  if (p.tenantId) payload.tenantId = p.tenantId
  const corpo = b64(JSON.stringify(payload))
  return `${corpo}.${assinar(corpo, key)}`
}

/**
 * Valida assinatura (tempo constante), expiração, docId (se informado) e escopo mínimo.
 * 'escrever' satisfaz 'ler'. Qualquer falha => null (sem detalhe).
 */
export function validarTokenOO(
  token: string | null | undefined,
  req: { docId?: string; escopo: EscopoOO },
  agoraMs: number = Date.now(),
): PayloadOO | null {
  try {
    const key = segredo()
    if (!key || !token || token.length > 2048) return null
    const [corpo, sig, resto] = token.split('.')
    if (!corpo || !sig || resto !== undefined) return null
    const esperado = Buffer.from(assinar(corpo, key))
    const recebido = Buffer.from(sig)
    if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null
    const p = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as PayloadOO
    if (!p || typeof p.docId !== 'string' || typeof p.exp !== 'number') return null
    if (p.escopo !== 'ler' && p.escopo !== 'escrever') return null
    if (p.exp * 1000 <= agoraMs) return null
    if (req.docId !== undefined && p.docId !== req.docId) return null
    if (req.escopo === 'escrever' && p.escopo !== 'escrever') return null
    return p
  } catch {
    return null
  }
}

/** Extrai o token da request: ?access_token=, header x-oo-token ou Authorization: Bearer. */
export function tokenDaRequest(req: Request): string | null {
  try {
    const u = new URL(req.url)
    return u.searchParams.get('access_token') || req.headers.get('x-oo-token') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null
  } catch {
    return null
  }
}

export { comTokenOO } from './url-token-oo'
