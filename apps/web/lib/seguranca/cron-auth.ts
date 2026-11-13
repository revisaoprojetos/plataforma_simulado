import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Autorização ÚNICA de rotas de cron/worker/internas por CRON_SECRET.
 * - Aceita `x-cron-secret: <segredo>` ou `Authorization: Bearer <segredo>`.
 * - Compara SHA-256 de ambos com timingSafeEqual (tempo constante, sem vazar o tamanho).
 * - Fail-closed: sem segredo configurado, SEMPRE recusa.
 * `envExtra`: nomes de env alternativos aceitos como segredo (ex.: CONTEUDO_CRON_SECRET).
 */
export function cronAutorizado(req: Request, envExtra: string[] = []): boolean {
  const segredos = ['CRON_SECRET', ...envExtra].map((n) => process.env[n]).filter((s): s is string => !!s)
  if (segredos.length === 0) return false
  const dado = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!dado) return false
  const h = createHash('sha256').update(dado).digest()
  let ok = false
  for (const s of segredos) {
    if (timingSafeEqual(h, createHash('sha256').update(s).digest())) ok = true
  }
  return ok
}
