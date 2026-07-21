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

export const TTL_RELATORIO = Number(process.env.RELATORIO_CACHE_TTL ?? 600) // 10 min
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

/**
 * Memoização com TTL no Redis. Em qualquer instabilidade (miss, Redis fora,
 * JSON inválido), computa direto via `calcular()`. Só serializa valores
 * JSON — os loaders de relatório já devolvem objetos planos.
 */
export async function remember<T>(chave: string, ttlSeg: number, calcular: () => Promise<T>): Promise<T> {
  const r = redis()
  if (r) {
    try {
      const hit = await r.get(chave)
      if (hit != null) return JSON.parse(hit) as T
    } catch { /* miss silencioso → computa */ }
  }
  const valor = await calcular()
  if (r && valor !== undefined) {
    try { await r.set(chave, JSON.stringify(valor), 'EX', ttlSeg) } catch { /* best-effort */ }
  }
  return valor
}

/**
 * Invalida TODOS os relatórios de um tenant. Chamado nos pontos de mutação que
 * mudam números de relatório: finalização de sessões (cron encerrar-expirados),
 * re-correção e imports. Best-effort e não bloqueante em caso de erro.
 *
 * ⚠️ Chamar UMA vez por lote (fim do cron / fim da re-correção), nunca por sessão.
 */
export async function invalidarRelatorios(tenantId: string | null): Promise<void> {
  const r = redis()
  if (!r || !tenantId) return
  const padrao = `relatorio:${tenantId}:*`
  try {
    let cursor = '0'
    do {
      const [prox, chaves] = await r.scan(cursor, 'MATCH', padrao, 'COUNT', 200)
      cursor = prox
      if (chaves.length) await r.del(...chaves)
    } while (cursor !== '0')
  } catch { /* best-effort */ }
}
