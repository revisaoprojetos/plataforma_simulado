/**
 * Rate limiter simples em memória (janela deslizante), por instância.
 * Suficiente para o MVP / single-instance. Em produção multi-réplica,
 * migrar para Redis (a interface pode ser mantida).
 */

const buckets = new Map<string, number[]>()

export interface RateLimitResult {
  ok: boolean
  /** Segundos até poder tentar de novo (quando bloqueado). */
  retryAfter: number
  /** Tentativas restantes na janela. */
  remaining: number
}

export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)

  if (hits.length >= max) {
    buckets.set(key, hits)
    const retryAfter = Math.ceil((windowMs - (now - hits[0])) / 1000)
    return { ok: false, retryAfter, remaining: 0 }
  }

  hits.push(now)
  buckets.set(key, hits)
  return { ok: true, retryAfter: 0, remaining: max - hits.length }
}

// Limpeza periódica para não vazar memória (não mantém o processo vivo).
const timer = setInterval(() => {
  const now = Date.now()
  for (const [k, arr] of buckets) {
    const filtered = arr.filter((t) => now - t < 10 * 60 * 1000)
    if (filtered.length === 0) buckets.delete(k)
    else buckets.set(k, filtered)
  }
}, 5 * 60 * 1000)
timer.unref?.()
