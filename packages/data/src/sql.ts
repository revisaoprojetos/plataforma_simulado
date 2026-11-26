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

// Observabilidade (O5): loga UMA vez se o SQL agregado está ATIVO ou caiu no PostgREST — assim dá pra
// saber em produção, pelo log, se o `DATABASE_URL` (o gate real) está setado, sem depender do painel.
let avisouStatus = false
export function sqlDisponivel(): boolean {
  const ok = !DESLIGADO && !!URL
  if (!avisouStatus) {
    avisouStatus = true
    if (ok) console.info('[sql] agregado ATIVO (DATABASE_URL presente) — relatórios via SQL direto.')
    else console.warn(`[sql] agregado INATIVO → relatórios via PostgREST (EGRESS ALTO). Motivo: ${DESLIGADO ? 'REPORT_SQL=off' : 'DATABASE_URL ausente'}.`)
  }
  return ok
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

/**
 * Leitura SEGURA p/ diagnóstico: transação READ ONLY com `SET LOCAL statement_timeout=10000`. Devolve `{ rows, erro }`
 * (erro como texto, p/ distinguir "objeto ausente"/"permissão" de "SQL desligado").
 */
export async function sqlLeitura<T = any>(text: string, params: any[] = []): Promise<{ rows: T[] | null; erro?: string }> {
  const p = getPool()
  if (!p) return { rows: null, erro: 'DATABASE_URL ausente (SQL direto desligado)' }
  let client
  try {
    client = await p.connect()
    await client.query('BEGIN READ ONLY')
    await client.query('SET LOCAL statement_timeout = 10000')
    const r = await client.query(text, params)
    await client.query('COMMIT')
    return { rows: r.rows as T[] }
  } catch (e) {
    try { await client?.query('ROLLBACK') } catch { /* ignora */ }
    return { rows: null, erro: (e as Error).message }
  } finally {
    client?.release()
  }
}

/** Host e usuário da conexão (NUNCA a senha) — p/ confirmar qual banco/projeto o app usa. */
export function sqlConexaoInfo(): { host: string | null; usuario: string | null; banco: string | null } {
  if (!URL) return { host: null, usuario: null, banco: null }
  try {
    const u = new globalThis.URL(URL)
    return { host: u.hostname, usuario: decodeURIComponent(u.username), banco: u.pathname.replace(/^\//, '') || null }
  } catch { return { host: null, usuario: null, banco: null } }
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
  let client
  try {
    client = await p.connect()
    // statement_timeout de 30s por query (SET LOCAL vale só dentro da transação → seguro com pooler transacional).
    await client.query('BEGIN')
    await client.query('SET LOCAL statement_timeout = 30000')
    const r = await client.query(text, params)
    await client.query('COMMIT')
    return r.rows as T[]
  } catch (e) {
    try { await client?.query('ROLLBACK') } catch { /* ignora */ }
    console.error('[sql] query falhou (fallback p/ PostgREST):', (e as Error).message)
    return null
  } finally {
    client?.release()
  }
}
