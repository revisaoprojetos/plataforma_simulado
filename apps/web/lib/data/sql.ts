import 'server-only'
import { Pool } from 'pg'

/**
 * Camada de dados SQL DIRETO (Fase 1 do roadmap de arquitetura).
 *
 * O acesso padrão do app é PostgREST (HTTP, teto de 1000 linhas/resposta → loops
 * fetchAll). Para os HOTSPOTS de relatório, uma conexão Postgres direta (via pooler
 * Supavisor/PgBouncer do Supabase) troca dezenas de round-trips HTTP por 1 query com
 * agregação no banco.
 *
 * STRANGLER: ativa só quando `DATABASE_URL` está setado; sem ela (ou em erro), `sqlQuery`
 * devolve null e o chamador cai de volta no PostgREST — zero mudança de comportamento até
 * a env ser configurada. Kill-switch: `REPORT_SQL=off`.
 *
 * Isolamento de tenant: como o app hoje já isola na aplicação (service-role + filtro),
 * TODA query aqui DEVE receber e filtrar `tenant_id` explicitamente. Nunca uma query sem ele.
 */
const DESLIGADO = process.env.REPORT_SQL === 'off'
const URL = process.env.DATABASE_URL

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
    // Supabase exige TLS; o cert do pooler não está no CA bundle padrão do Node.
    ssl: { rejectUnauthorized: false },
  })
  // Erro em conexão ociosa não pode derrubar o processo (o pool reconecta na próxima query).
  pool.on('error', () => {})
  return pool
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
