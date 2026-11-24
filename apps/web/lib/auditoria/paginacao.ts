/**
 * Helpers puros de paginação da Auditoria (sem I/O).
 * - total estimado (count 'estimated' do PostgREST) é corrigido com o que a página realmente trouxe;
 * - listas de vários chunks de `.in()` (≤80 ids) são mescladas e re-paginadas no servidor.
 */

/** Divide em pedaços de no máximo `n` itens (padrão 80 — limite seguro do proxy para `.in()`). */
export function emChunks<T>(arr: readonly T[], n = 80): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

/**
 * Ajusta o total (possivelmente estimado) para ficar coerente com a página lida:
 *  - página parcial (< pageSize linhas) => total exato = offset + linhas;
 *  - página cheia e estimativa <= offset + pageSize => há ao menos mais 1 linha, devolve offset + pageSize + 1
 *    (mantém "Próxima" funcionando mesmo se a estimativa ficou baixa).
 */
export function ajustarTotal(estimado: number | null | undefined, offset: number, pageSize: number, linhas: number): number {
  const est = Math.max(0, Number(estimado ?? 0) || 0)
  if (linhas < pageSize) return linhas === 0 && offset > 0 ? Math.max(est, 0) : offset + linhas
  return est > offset + pageSize ? est : offset + pageSize + 1
}

/** Mescla listas já ordenadas por `ord`/`dir`, ordena globalmente e devolve a fatia [offset, offset+size). */
export function mesclarPaginas<T extends Record<string, any>>(listas: readonly (readonly T[])[], ord: string, dir: 'asc' | 'desc', offset: number, size: number): T[] {
  const mult = dir === 'asc' ? 1 : -1
  const todos = listas.flat()
  todos.sort((a, b) => {
    const x = a[ord], y = b[ord]
    if (x == null && y == null) return 0
    if (x == null) return 1 // nullsFirst:false => nulos por último nos dois sentidos
    if (y == null) return -1
    return x < y ? -mult : x > y ? mult : 0
  })
  return todos.slice(offset, offset + size)
}
