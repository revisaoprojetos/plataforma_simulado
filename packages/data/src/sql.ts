import { Pool } from 'pg'

/**
 * Camada de dados SQL DIRETO compartilhada (Fase 1/3 do roadmap).
 *
 * Conecta no Postgres (via pooler Supavisor/PgBouncer do Supabase) por `DATABASE_URL`.
 * Usada tanto pelo app Next quanto pela API dedicada (apps/api). Sem `DATABASE_URL`, ou
 * em erro, `sqlQuery` devolve null e o chamador cai no PostgREST (strangler). Kill-switch:
 * `REPORT_SQL=off`.
 *
 * Isolamento de tenant: como o app isola na aplicação, TODA query DEVE receber e filtrar
 * `tenant_id` explicitamente. Nunca uma query sem ele.
 */
const DESLIGADO = process.env.REPORT_SQL === 'off'
// Fase 4: se houver read-replica (DATABASE_URL_REPLICA), lê dela — os relatórios são só leitura.
// Cai para DATABASE_URL (pooler primário) quando não há réplica.
const URL = process.env.DATABASE_URL_REPLICA || process.env.DATABASE_URL

let pool: Pool | null = null

export function sqlDisponivel(): boolean {
  return !DESLIGADO && !!URL
}

function getPool(): Pool | null {
  if (!sqlDisponivel()) return null
  if (pool) return pool
  pool = new Pool({
    connectionString: URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    ssl: { rejectUnauthorized: false }, // Supabase exige TLS; cert do pooler não está no CA padrão
  })
  pool.on('error', () => {})
  return pool
}

/** Métricas do pool de conexões (observabilidade — Fase 4). */
export function poolStats(): { total: number; idle: number; waiting: number; replica: boolean } | null {
  if (!pool) return { total: 0, idle: 0, waiting: 0, replica: !!process.env.DATABASE_URL_REPLICA }
  return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, replica: !!process.env.DATABASE_URL_REPLICA }
}

/**
 * Executa uma query parametrizada. Retorna as linhas, ou `null` se o SQL direto não estiver
 * disponível OU a query falhar — nesses casos o chamador deve usar o caminho PostgREST.
 */
export async function sqlQuery<T = any>(text: string, params: any[] = []): Promise<T[] | null> {
  const p = getPool()
  if (!p) return null
  try {
    const r = await p.query(text, params)
    return r.rows as T[]
  } catch (e) {
    console.error('[sql] query falhou (fallback p/ PostgREST):', (e as Error).message)
    return null
  }
}
