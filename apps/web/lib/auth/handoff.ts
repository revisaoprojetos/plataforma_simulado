import 'server-only'
import crypto from 'crypto'
import IORedis from 'ioredis'

/**
 * SSO handoff entre DOMÍNIOS diferentes (troca de plataforma sem re-login). Cookies não cruzam
 * domínios, então geramos no domínio de ORIGEM um código de uso único (guardado no Redis com a
 * sessão) e o domínio de DESTINO troca esse código pela sessão e grava seu próprio cookie.
 *
 * Segurança: código aleatório de 256 bits, TTL curto (60s), USO ÚNICO (getdel), tokens só no Redis
 * interno (nunca na URL). Só quem está autenticado na origem consegue gerar (é a própria sessão).
 */

const TTL_SEG = 60
const PREFIXO = 'handoff:'

let redis: IORedis | null = null
let tentou = false
function getRedis(): IORedis | null {
  if (redis || tentou) return redis
  tentou = true
  const url = process.env.REDIS_URL
  if (!url) return null
  try {
    redis = new IORedis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: false })
    redis.on('error', () => { /* Redis fora do ar → handoff indisponível, cai no login normal */ })
  } catch { redis = null }
  return redis
}

export interface HandoffTokens { access_token: string; refresh_token: string }

/** Gera o código de handoff e guarda a sessão no Redis (TTL 60s). Retorna null se Redis indisponível. */
export async function criarHandoff(tokens: HandoffTokens): Promise<string | null> {
  const r = getRedis()
  if (!r) return null
  if (!tokens?.access_token || !tokens?.refresh_token) return null
  const code = crypto.randomBytes(32).toString('base64url')
  try {
    await r.set(PREFIXO + code, JSON.stringify(tokens), 'EX', TTL_SEG)
    return code
  } catch { return null }
}

/** Troca o código pela sessão (USO ÚNICO — apaga ao ler). Retorna null se inválido/expirado. */
export async function consumirHandoff(code: string): Promise<HandoffTokens | null> {
  const r = getRedis()
  if (!r || !code) return null
  try {
    // getdel = leitura atômica + remoção (uso único). Fallback get+del se a versão não suportar.
    let raw: string | null
    try { raw = await (r as any).getdel(PREFIXO + code) } catch { raw = await r.get(PREFIXO + code); if (raw) await r.del(PREFIXO + code) }
    if (!raw) return null
    const t = JSON.parse(raw) as HandoffTokens
    return t?.access_token && t?.refresh_token ? t : null
  } catch { return null }
}
