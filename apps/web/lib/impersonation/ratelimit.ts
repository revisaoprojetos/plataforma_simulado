import 'server-only'

// Rate limit simples por admin (janela deslizante de 1h), EM MEMÓRIA do processo. Suficiente p/ o
// MVP; num cluster com réplicas cada uma tem seu contador (limite efetivo maior) — migrar p/ Redis
// se precisar de precisão global (o projeto já tem ioredis em lib/cache).
const hits = new Map<string, number[]>()
const JANELA_MS = 3_600_000

export function checarRateLimit(adminId: string, maxPorHora: number): { ok: boolean; retryAfter?: number } {
  const agora = Date.now()
  const arr = (hits.get(adminId) ?? []).filter((t) => agora - t < JANELA_MS)
  if (arr.length >= maxPorHora) {
    const retryAfter = Math.ceil((JANELA_MS - (agora - arr[0])) / 1000)
    hits.set(adminId, arr)
    return { ok: false, retryAfter }
  }
  arr.push(agora)
  hits.set(adminId, arr)
  return { ok: true }
}
