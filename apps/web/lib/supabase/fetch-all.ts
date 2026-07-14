/**
 * Busca TODAS as linhas de uma query, paginando com `.range()`.
 *
 * O PostgREST (Supabase) limita cada resposta a no máximo ~1000 linhas,
 * independentemente do `.limit()` informado. Consultas que precisam varrer
 * uma tabela inteira do tenant (ex.: listar todos os estudantes) devem usar
 * este helper para não truncar silenciosamente em 1000 registros.
 *
 * `build` deve devolver um NOVO query builder a cada chamada (a query é
 * reexecutada por página), já com filtros e um `.order()` estável aplicado.
 */
export async function fetchAll<T = any>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> },
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
  }
  return all
}
