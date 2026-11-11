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
// Observabilidade de EGRESS: avisa no log quando uma leitura varre MUITAS linhas (o que faltou no
// incidente — leituras gigantes passavam despercebidas). Limiar via EGRESS_WARN_ROWS (default 20000).
const EGRESS_WARN_ROWS = Number(process.env.EGRESS_WARN_ROWS ?? 20000)
function avisarSeGrande(qtd: number, rotulo?: string) {
  if (EGRESS_WARN_ROWS > 0 && qtd >= EGRESS_WARN_ROWS) {
    console.warn(`[egress] leitura grande: ${qtd} linhas${rotulo ? ` em "${rotulo}"` : ''} — considere agregar no banco/projetar colunas.`)
  }
}

export async function fetchAll<T = any>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> },
  pageSize = 1000,
  rotulo?: string,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
  }
  avisarSeGrande(all.length, rotulo)
  return all
}

/**
 * Busca todas as linhas de um `.in(coluna, ids)` com lista GRANDE de ids,
 * contornando dois limites do PostgREST: (1) URL gigante quando há centenas de
 * ids no `.in()`, e (2) o teto de ~1000 linhas por resposta. Fatia os ids em
 * lotes e pagina cada lote.
 *
 * `build(idsChunk)` deve montar a query já com `.in(coluna, idsChunk)` e demais
 * filtros/select. Um `.order()` estável é recomendado para paginação consistente.
 */
export async function fetchAllByIn<T = any>(
  ids: string[],
  build: (idsChunk: string[]) => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> },
  { chunk = 80, pageSize = 1000, rotulo, concorrencia = 1 }: { chunk?: number; pageSize?: number; rotulo?: string; concorrencia?: number } = {},
): Promise<T[]> {
  const lerLote = async (idsChunk: string[]): Promise<T[]> => {
    const out: T[] = []
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await build(idsChunk).range(from, from + pageSize - 1)
      if (error) throw error
      if (!data || data.length === 0) break
      out.push(...data)
      if (data.length < pageSize) break
    }
    return out
  }
  const lotes: string[][] = []
  for (let i = 0; i < ids.length; i += chunk) lotes.push(ids.slice(i, i + chunk))
  const all: T[] = []
  // `concorrencia` > 1: lotes em ondas paralelas (ordem de saída preservada). Padrão 1 = comportamento antigo (sequencial).
  const onda = Math.max(1, Math.floor(concorrencia))
  for (let i = 0; i < lotes.length; i += onda) {
    const partes = await Promise.all(lotes.slice(i, i + onda).map(lerLote))
    for (const p of partes) all.push(...p)
  }
  avisarSeGrande(all.length, rotulo)
  return all
}
