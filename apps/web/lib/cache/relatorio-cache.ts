import 'server-only'
import IORedis from 'ioredis'

/**
 * Cache de leitura para relatórios pesados (Fase 0 do roadmap de arquitetura).
 *
 * Os relatórios recomputam do zero a cada visita, com dezenas de round-trips
 * PostgREST (fan-out N+1). Este módulo memoiza o RESULTADO já agregado no Redis,
 * com TTL curto de segurança + invalidação por evento (finalização de sessão,
 * re-correção, imports).
 *
 * Degrada com elegância: se o Redis estiver fora do ar (ex.: dev sem docker),
 * `remember()` computa direto — nunca quebra a página. Desligar com
 * RELATORIO_CACHE=off. TTL padrão via RELATORIO_CACHE_TTL (segundos).
 *
 * Singleton lazy (mesmo padrão de lib/queue/pdf-queue.ts): a conexão só abre no
 * primeiro uso.
 */

export const TTL_RELATORIO = Number(process.env.RELATORIO_CACHE_TTL ?? 1800) // 30 min (menos recomputações = menos egress)
const DESLIGADO = process.env.RELATORIO_CACHE === 'off'

let client: IORedis | null = null

function redis(): IORedis | null {
  if (DESLIGADO) return null
  if (client) return client
  try {
    client = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      // Fail-fast: se o Redis não estiver conectado, os comandos rejeitam na hora
      // (em vez de enfileirar) e o remember() computa direto.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1000,
      retryStrategy: (tentativas) => Math.min(tentativas * 300, 5000),
    })
    // Silencia o log de erro de conexão — a degradação já é tratada em cada comando.
    client.on('error', () => {})
  } catch {
    client = null
  }
  return client
}

/** Chave canônica de relatório, sempre escopada por tenant (para invalidação em massa). */
export function chaveRelatorio(tenantId: string | null, ...partes: (string | number)[]): string {
  return `relatorio:${tenantId ?? 'none'}:${partes.join(':')}`
}

// Fallback de cache EM MEMÓRIA (por processo) — usado SÓ quando o Redis está fora do ar
// (ex.: dev sem docker). Em produção o Redis é o cache e este mapa nunca é usado, então não há
// mudança de comportamento nem risco de defasagem entre réplicas. TTL curto p/ bounded staleness.
const mem = new Map<string, { v: unknown; exp: number }>()
const MEM_MAX = 300

/**
 * Memoização com TTL no Redis (produção). Se o Redis estiver fora, cai num cache em memória do
 * processo (dev) — assim os relatórios pesados não recomputam a cada acesso. Em qualquer
 * instabilidade, computa direto. Só serializa valores JSON.
 */
export async function remember<T>(chave: string, ttlSeg: number, calcular: () => Promise<T>): Promise<T> {
  const r = redis()
  let redisOk = false
  if (r) {
    try {
      const hit = await r.get(chave)
      redisOk = true
      if (hit != null) return JSON.parse(hit) as T
    } catch { redisOk = false /* Redis fora → usa memória abaixo */ }
  }
  // Sem Redis: tenta o cache em memória.
  if (!redisOk) {
    const m = mem.get(chave)
    if (m && m.exp > Date.now()) return m.v as T
  }
  const t0 = Date.now()
  const valor = await calcular()
  const ms = Date.now() - t0
  if (ms > 3000) console.warn(`[relatorio lento] ${chave} computou em ${ms}ms (cache-miss)`) // observabilidade (Fase 4)
  if (valor !== undefined) {
    if (redisOk && r) { try { await r.set(chave, JSON.stringify(valor), 'EX', ttlSeg) } catch { /* best-effort */ } }
    else {
      if (mem.size >= MEM_MAX) { const k = mem.keys().next().value; if (k) mem.delete(k) }
      mem.set(chave, { v: valor, exp: Date.now() + Math.min(ttlSeg, 120) * 1000 }) // memória: no máx. 2 min
    }
  }
  return valor
}

/** Remove UMA chave do cache (Redis + fallback em memória). Best-effort — nunca lança. */
export async function esquecer(chave: string): Promise<void> {
  mem.delete(chave)
  const r = redis()
  if (!r) return
  try { await r.del(chave) } catch { /* best-effort */ }
}

/**
 * Invalida TODOS os relatórios de um tenant. Chamado nos pontos de mutação que
 * mudam números de relatório: finalização de sessões (cron encerrar-expirados),
 * re-correção e imports. Best-effort e não bloqueante em caso de erro.
 *
 * ⚠️ Chamar UMA vez por lote (fim do cron / fim da re-correção), nunca por sessão.
 */
export async function invalidarRelatorios(tenantId: string | null): Promise<void> {
  await invalidarPorPadrao(tenantId, '*')
}

/**
 * Invalidação GRANULAR: só as chaves de UM simulado (`relatorio:{tenant}:*{simId}*` — relatório e
 * ranking daquele simulado). Os agregados do tenant (gráficos/resumos/estudante) NÃO são apagados —
 * expiram pelo TTL. Isso evita o padrão caro "finaliza 1 sessão → apaga TODO o cache do tenant →
 * recomputa tudo", crítico durante simulado ao vivo (centenas de finalizações/min). Use este no
 * auto-encerramento; a versão total (`invalidarRelatorios`) fica para re-correção/imports (raros).
 */
export async function invalidarRelatoriosSimulado(tenantId: string | null, simuladoId: string): Promise<void> {
  if (!simuladoId) return
  await invalidarPorPadrao(tenantId, `*${simuladoId}*`)
}

async function invalidarPorPadrao(tenantId: string | null, sufixo: string): Promise<void> {
  const r = redis()
  if (!r || !tenantId) return
  const padrao = `relatorio:${tenantId}:${sufixo}`
  try {
    let cursor = '0'
    do {
      const [prox, chaves] = await r.scan(cursor, 'MATCH', padrao, 'COUNT', 200)
      cursor = prox
      if (chaves.length) await r.del(...chaves)
    } while (cursor !== '0')
  } catch { /* best-effort */ }
}
