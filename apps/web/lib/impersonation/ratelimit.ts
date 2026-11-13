import 'server-only'
import { rateLimit } from '@/lib/rate-limit'

// Rate limit por admin (janela de 1h). Usa o limiter compartilhado (Redis; fallback em memória).
export async function checarRateLimit(adminId: string, maxPorHora: number): Promise<{ ok: boolean; retryAfter?: number }> {
  const r = await rateLimit(`impersonate:${adminId}`, maxPorHora, 3_600_000)
  return r.ok ? { ok: true } : { ok: false, retryAfter: r.retryAfter }
}
