import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

/** Autorização por CRON_SECRET (x-cron-secret ou Bearer) com comparação em tempo constante. */
export function cronAutorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const a = Buffer.from(h)
  const b = Buffer.from(segredo)
  return a.length === b.length && timingSafeEqual(a, b)
}
