import 'server-only'
import IORedis from 'ioredis'
import { createHash } from 'node:crypto'

/**
 * Camada de proteção do tráfego de API dos provedores (Curseduca/Guru) — §7.4 do plano.
 * Objetivo: com vários admins/réplicas usando a MESMA key, NÃO estourar o rate limit do
 * provedor. Três ferramentas, todas compartilhadas via Redis (fallback em memória):
 *  1) `aguardarVaga`  — rate limiter por (provider, key) — janela fixa (N req / janela).
 *  2) `comCache`      — cache de resposta por chave (vários admins vendo o mesmo dado = 1 chamada).
 *  3) `coalescer`     — single-flight: coalesce chamadas idênticas simultâneas (mesma réplica).
 *
 * Sem REDIS_URL, tudo cai para memória local (dev / réplica única).
 */

let redis: IORedis | null = null
let redisResolvido = false
function getRedis(): IORedis | null {
  if (redisResolvido) return redis
  redisResolvido = true
  const url = process.env.REDIS_URL
  if (!url) return null
  try {
    redis = new IORedis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: false })
    redis.on('error', () => { /* Redis fora → fallback memória */ })
  } catch { redis = null }
  return redis
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12)

// ── 1) Rate limiter (janela fixa) ────────────────────────────────────────────
type Janela = { inicio: number; count: number }
const janelasMem = new Map<string, Janela>()

export interface RateOpts {
  /** requisições permitidas por janela. Default 60. */
  maxPorJanela?: number
  /** tamanho da janela em ms. Default 60000 (1 min). */
  janelaMs?: number
  /** tempo máx. de espera por uma vaga antes de desistir (ms). Default 15000. */
  esperaMaxMs?: number
}

/**
 * Bloqueia até haver "vaga" para mais uma chamada ao provedor com aquela key.
 * Fixed-window: conta chamadas na janela atual; se cheio, espera a próxima janela.
 * Lança se exceder `esperaMaxMs` (para não travar a request indefinidamente).
 */
export async function aguardarVaga(provider: string, keyId: string, opts: RateOpts = {}): Promise<void> {
  const max = opts.maxPorJanela ?? 60
  const janelaMs = opts.janelaMs ?? 60_000
  const esperaMax = opts.esperaMaxMs ?? 15_000
  const inicioEspera = Date.now()

  for (;;) {
    const agora = Date.now()
    const bucket = Math.floor(agora / janelaMs)
    const chave = `rl:${provider}:${keyId}:${bucket}`
    const r = getRedis()
    let count: number
    if (r) {
      try {
        count = await r.incr(chave)
        if (count === 1) await r.pexpire(chave, janelaMs + 1000)
      } catch {
        count = incrMem(chave, bucket, janelaMs)
      }
    } else {
      count = incrMem(chave, bucket, janelaMs)
    }
    if (count <= max) return
    // Janela cheia → espera até a próxima (ou desiste).
    const restanteJanela = (bucket + 1) * janelaMs - agora
    if (agora - inicioEspera + restanteJanela > esperaMax) {
      throw new Error(`rate limit: sem vaga para ${provider} em ${esperaMax}ms (limite ${max}/${janelaMs}ms)`)
    }
    await sleep(Math.min(restanteJanela + 25, 1000))
  }
}

/**
 * Checagem NÃO-bloqueante de limite (para o endpoint de webhook de ENTRADA): incrementa a
 * janela e retorna `true` se ainda está dentro do teto. Se estourar → `false` (a rota responde
 * 429 e a Guru reentrega depois). Protege contra flood de um token vazado.
 */
export async function dentroDoLimite(provider: string, keyId: string, maxPorJanela = 300, janelaMs = 60_000): Promise<boolean> {
  const bucket = Math.floor(Date.now() / janelaMs)
  const chave = `rl:${provider}:${keyId}:${bucket}`
  const r = getRedis()
  let count: number
  if (r) {
    try { count = await r.incr(chave); if (count === 1) await r.pexpire(chave, janelaMs + 1000) }
    catch { count = incrMem(chave, bucket, janelaMs) }
  } else count = incrMem(chave, bucket, janelaMs)
  return count <= maxPorJanela
}

function incrMem(chave: string, bucket: number, janelaMs: number): number {
  const atual = janelasMem.get(chave)
  if (!atual || atual.inicio !== bucket) {
    janelasMem.set(chave, { inicio: bucket, count: 1 })
    // limpeza preguiçosa de janelas velhas
    if (janelasMem.size > 500) for (const [k, v] of janelasMem) if ((bucket - v.inicio) * janelaMs > 5 * janelaMs) janelasMem.delete(k)
    return 1
  }
  atual.count += 1
  return atual.count
}

// ── 2) Cache de resposta (Redis + memória) ───────────────────────────────────
type CacheItem = { v: unknown; exp: number }
const cacheMem = new Map<string, CacheItem>()

/** Executa `fn` só se não houver valor em cache. TTL em segundos. */
export async function comCache<T>(chave: string, ttlSeg: number, fn: () => Promise<T>): Promise<T> {
  const k = `cache:${chave}`
  const r = getRedis()
  // memória primeiro (mais rápido)
  const mem = cacheMem.get(k)
  if (mem && mem.exp > Date.now()) return mem.v as T
  if (r) {
    try {
      const raw = await r.get(k)
      if (raw != null) { const v = JSON.parse(raw) as T; cacheMem.set(k, { v, exp: Date.now() + ttlSeg * 1000 }); return v }
    } catch { /* ignora */ }
  }
  const v = await fn()
  cacheMem.set(k, { v, exp: Date.now() + ttlSeg * 1000 })
  if (r) { try { await r.set(k, JSON.stringify(v), 'EX', ttlSeg) } catch { /* ignora */ } }
  return v
}

/** Invalida uma chave de cache (após import/mudança). */
export async function invalidarCache(chave: string): Promise<void> {
  const k = `cache:${chave}`
  cacheMem.delete(k)
  const r = getRedis()
  if (r) { try { await r.del(k) } catch { /* ignora */ } }
}

// ── 3) Single-flight (coalescência de chamadas idênticas na mesma réplica) ────
const emVoo = new Map<string, Promise<unknown>>()

/** Se já há uma chamada idêntica em andamento, reaproveita a mesma promise. */
export function coalescer<T>(chave: string, fn: () => Promise<T>): Promise<T> {
  const existente = emVoo.get(chave)
  if (existente) return existente as Promise<T>
  const p = fn().finally(() => emVoo.delete(chave))
  emVoo.set(chave, p)
  return p
}

/** Id curto e estável de uma credencial (p/ chavear limiter/cache sem expor o segredo). */
export function idCredencial(provider: string, seed: string): string {
  return `${provider}:${hash(seed)}`
}
