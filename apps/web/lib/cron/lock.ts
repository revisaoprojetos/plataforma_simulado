/**
 * Lock de cron compartilhado entre réplicas via Redis (SET NX PX) — evita 2 execuções simultâneas da mesma
 * rota (web com N réplicas, worker com retry/atraso). Advisory lock do Postgres NÃO serve aqui: o acesso é via
 * PostgREST/pooler transacional (sessão não persiste). Mesmo espírito do lock do curseduca-jobs (só 1 assume).
 * Fail-open: sem REDIS_URL ou com Redis fora, roda normalmente (as rotas já são idempotentes).
 * Lock ocupado → 200 { skipped: true }.
 */
import { NextRequest, NextResponse } from 'next/server'
import IORedis from 'ioredis'
import { randomUUID } from 'crypto'
import { cronAutorizado } from '@/lib/seguranca/cron-auth'

let redis: IORedis | null = null
let tentado = false
function getRedis(): IORedis | null {
  if (redis || tentado) return redis
  tentado = true
  const url = process.env.REDIS_URL
  if (!url) return null
  try {
    redis = new IORedis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, commandTimeout: 1500 })
    redis.on('error', () => { /* Redis fora → fail-open */ })
  } catch { redis = null }
  return redis
}

const LIBERAR = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`

/** Autoriza (CRON_SECRET), toma o lock `nome` por até `ttlMs` e executa `fn`; se ocupado, responde skipped. */
export async function comLockCron(
  req: NextRequest,
  nome: string,
  fn: () => Promise<Response>,
  ttlMs = 10 * 60_000,
): Promise<Response> {
  if (!cronAutorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  const r = getRedis()
  const chave = `cron:lock:${nome}`
  const token = randomUUID()
  let tomou = false
  if (r) {
    try {
      tomou = (await r.set(chave, token, 'PX', ttlMs, 'NX')) === 'OK'
      if (!tomou) return NextResponse.json({ skipped: true })
    } catch { tomou = false /* fail-open */ }
  }
  try {
    return await fn()
  } finally {
    if (tomou && r) { try { await r.eval(LIBERAR, 1, chave, token) } catch { /* expira pelo TTL */ } }
  }
}
