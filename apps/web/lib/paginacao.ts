import 'server-only'

/**
 * Fundação de PAGINAÇÃO server-side (reduz egress: lê só a página, não a tabela inteira).
 *
 * Padroniza os cuidados que já custaram bugs/egress no projeto:
 *  - **Projeção obrigatória** — nunca `select('*')` (egress é cobrado por bytes; ver guardrail).
 *  - **Filtro no banco** (`tenant_id` + callback de filtros) — nunca filtrar no cliente após ler tudo.
 *  - **`count: 'exact'`** numa só query (sem 2ª chamada) → total p/ a UI paginar.
 *  - **Ordenação por coluna ÚNICA** (default `id`) — landmine conhecida: ordenar por coluna não-única
 *    (ex.: `documento_id`) ou sem `order` faz o `.range()` PERDER/DUPLICAR linhas entre páginas.
 *
 * Uso:
 *   const { rows, total, temMais } = await carregarLote(svc, 'simulado_grupos', {
 *     cols: 'id, nome, criado_em', tenantId, offset, limit: 20,
 *     filtros: (q) => busca ? q.ilike('nome', `%${busca}%`) : q,
 *   })
 */
export interface LotePagina<T> {
  rows: T[]
  total: number
  offset: number
  limit: number
  temMais: boolean
}

export interface CarregarLoteOpts {
  /** Projeção OBRIGATÓRIA das colunas usadas (nunca `'*'`). */
  cols: string
  offset?: number
  limit?: number
  /** Ordenação por coluna ÚNICA (default `id` asc) — evita perder linhas na paginação. */
  order?: { coluna: string; asc?: boolean }
  /** Isolamento de tenant (aplica `.eq('tenant_id', …)` quando informado). */
  tenantId?: string | null
  /** Aplica filtros/busca NO BANCO: `(q) => q.eq(...).ilike(...)`. */
  filtros?: (q: any) => any
}

export async function carregarLote<T = any>(
  sb: any,
  tabela: string,
  opts: CarregarLoteOpts,
): Promise<LotePagina<T>> {
  const { cols, offset = 0, limit = 20, order = { coluna: 'id', asc: true }, tenantId, filtros } = opts
  if (!cols || cols.trim() === '*') {
    throw new Error(`carregarLote(${tabela}): projeção de colunas obrigatória — nunca "*".`)
  }
  let q = sb.from(tabela).select(cols, { count: 'exact' })
  if (tenantId) q = q.eq('tenant_id', tenantId)
  if (filtros) q = filtros(q)
  q = q.order(order.coluna, { ascending: order.asc ?? true })
  // Desempate por `id` (coluna ÚNICA) quando a ordenação principal não é única — garante ordem estável
  // entre páginas e evita perder/duplicar linhas no `.range()` (landmine conhecida do projeto).
  if (order.coluna !== 'id') q = q.order('id', { ascending: true })
  q = q.range(offset, offset + limit - 1)
  const { data, count, error } = await q
  if (error) throw error
  const rows = (data ?? []) as T[]
  const total = count ?? 0
  return { rows, total, offset, limit, temMais: offset + rows.length < total }
}

/**
 * Contagem barata (head, sem trazer linhas) — para KPIs/badges sem egress de dados.
 */
export async function contar(
  sb: any,
  tabela: string,
  opts: { tenantId?: string | null; filtros?: (q: any) => any } = {},
): Promise<number> {
  let q = sb.from(tabela).select('id', { count: 'exact', head: true })
  if (opts.tenantId) q = q.eq('tenant_id', opts.tenantId)
  if (opts.filtros) q = opts.filtros(q)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}
