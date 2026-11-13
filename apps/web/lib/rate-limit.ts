/**
 * Rate limit / lockout COMPARTILHADO entre réplicas via Redis (REDIS_URL), com fallback EM MEMÓRIA
 * por processo quando não há Redis (dev) ou quando o Redis está fora do ar (fail-open: nunca derruba
 * o fluxo legítimo por causa do limiter).
 *
 * Janela fixa (INCR + PEXPIRE). Interface: `await rateLimit(chave, max, janelaMs)` →
 * `{ ok, retryAfter, remaining }`. ATENÇÃO: agora é ASSÍNCRONA (precisa de await).
 *
 * Chaves: use sempre IP + identificador (e-mail/estudante/usuário). Atrás do Curseduca vários alunos
 * podem compartilhar o mesmo IP — uma chave só por IP bloquearia gente legítima.
 */
import IORedis from 'ioredis'

export interface RateLimitResult {
  ok: boolean
  /** Segundos até poder tentar de novo (quando bloqueado). */
  retryAfter: number
  /** Tentativas restantes na janela. */
  remaining: number
}

// ── Redis (lazy, fail-fast) ───────────────────────────────────────────────────
let redis: IORedis | null = null
let redisTentado = false
function getRedis(): IORedis | null {
  if (redis || redisTentado) return redis
  redisTentado = true
  const url = process.env.REDIS_URL
  if (!url) return null
  try {
    redis = new IORedis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false, commandTimeout: 400 })
    redis.on('error', () => { /* Redis fora → fallback memória */ })
  } catch { redis = null }
  return redis
}

// ── Fallback em memória ───────────────────────────────────────────────────────
const mem = new Map<string, { n: number; exp: number }>()
const timer = setInterval(() => {
  const now = Date.now()
  for (const [k, v] of mem) if (v.exp <= now) mem.delete(k)
}, 60_000)
timer.unref?.()

function incrMem(key: string, ttlMs: number): { n: number; ttlMs: number } {
  const now = Date.now()
  const cur = mem.get(key)
  if (!cur || cur.exp <= now) { mem.set(key, { n: 1, exp: now + ttlMs }); return { n: 1, ttlMs } }
  cur.n += 1
  return { n: cur.n, ttlMs: cur.exp - now }
}

/** INCR com TTL fixado na 1ª ocorrência. Retorna contagem e ms restantes da janela. */
async function incr(key: string, ttlMs: number): Promise<{ n: number; ttlMs: number }> {
  const r = getRedis()
  if (r) {
    try {
      const res = await r.multi().incr(key).pttl(key).exec()
      const n = Number(res?.[0]?.[1] ?? 0)
      let pttl = Number(res?.[1]?.[1] ?? -1)
      if (n === 1 || pttl < 0) { await r.pexpire(key, ttlMs); pttl = ttlMs }
      if (n > 0) return { n, ttlMs: pttl }
    } catch { /* cai na memória */ }
  }
  return incrMem(key, ttlMs)
}

async function setFlag(key: string, ttlMs: number): Promise<void> {
  const r = getRedis()
  if (r) { try { await r.set(key, '1', 'PX', ttlMs); return } catch { /* memória */ } }
  mem.set(key, { n: 1, exp: Date.now() + ttlMs })
}

/** ms restantes da flag (0 = inexistente). */
async function ttlFlag(key: string): Promise<number> {
  const r = getRedis()
  if (r) {
    try { const t = await r.pttl(key); if (t > 0) return t; if (t === -2) return memTtl(key) } catch { /* memória */ }
  }
  return memTtl(key)
}
function memTtl(key: string): number {
  const v = mem.get(key)
  return v && v.exp > Date.now() ? v.exp - Date.now() : 0
}

async function del(key: string): Promise<void> {
  mem.delete(key)
  const r = getRedis()
  if (r) { try { await r.del(key) } catch { /* ignora */ } }
}

// ── API: rate limit ───────────────────────────────────────────────────────────
export async function rateLimit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  const { n, ttlMs } = await incr(`rl2:${key}`, windowMs)
  if (n > max) return { ok: false, retryAfter: Math.max(1, Math.ceil(ttlMs / 1000)), remaining: 0 }
  return { ok: true, retryAfter: 0, remaining: Math.max(0, max - n) }
}

/** IP do cliente (1º do x-forwarded-for). */
export function ipDeRequest(headers: { get(name: string): string | null }): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip')?.trim() || 'unknown'
}

/** Resposta 429 padrão com Retry-After. */
export function resposta429(retryAfter: number, message = 'Muitas tentativas. Aguarde alguns instantes e tente novamente.', extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ message, error: message, ...extra }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': String(Math.max(1, Math.ceil(retryAfter))), 'cache-control': 'no-store' },
  })
}

/**
 * Aplica N limites (cada um com sua chave) e devolve a Response 429 do que estourar (o de maior
 * Retry-After), ou null se tudo ok. Uso: `const bloq = await limitar([[chave, max, janelaMs], ...]); if (bloq) return bloq`.
 */
export async function limitar(regras: Array<[key: string, max: number, windowMs: number]>, message?: string): Promise<Response | null> {
  let pior: RateLimitResult | null = null
  for (const [k, max, w] of regras) {
    const r = await rateLimit(k, max, w)
    if (!r.ok && (!pior || r.retryAfter > pior.retryAfter)) pior = r
  }
  return pior ? resposta429(pior.retryAfter, message) : null
}

// ── API: lockout com escalonamento (login) ────────────────────────────────────
// 5 falhas em 15 min → trava 15 min; reincidência em 24h trava 1h; depois 4h (teto).
const LOCK_MAX_FALHAS = 5
const LOCK_JANELA_MS = 15 * 60_000
const LOCK_DURACOES_MS = [15 * 60_000, 60 * 60_000, 4 * 60 * 60_000]

/** Segundos restantes de bloqueio (0 = livre). */
export async function lockoutRestante(chave: string): Promise<number> {
  return Math.ceil((await ttlFlag(`lock:${chave}`)) / 1000)
}

/** Registra uma falha; se atingir o limite, aplica o bloqueio escalonado. Retorna segundos de bloqueio (0 = não bloqueou). */
export async function lockoutFalha(chave: string, maxFalhas = LOCK_MAX_FALHAS): Promise<number> {
  const { n } = await incr(`fail:${chave}`, LOCK_JANELA_MS)
  if (n < maxFalhas) return 0
  const { n: nivel } = await incr(`lvl:${chave}`, 24 * 60 * 60_000)
  const dur = LOCK_DURACOES_MS[Math.min(nivel, LOCK_DURACOES_MS.length) - 1]
  await setFlag(`lock:${chave}`, dur)
  await del(`fail:${chave}`)
  return Math.ceil(dur / 1000)
}

/** Login bem-sucedido: zera o contador de falhas (não zera o nível de reincidência). */
export async function lockoutLimpar(chave: string): Promise<void> {
  await del(`fail:${chave}`)
}
