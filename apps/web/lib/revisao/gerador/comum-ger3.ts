// Helpers comuns das sub-abas do Gerador (importação, relatórios, liberação): leitura segura dos searchParams,
// paginação/ordenação em memória (listas pequenas já carregadas no servidor) e rótulos.

export type SP = Record<string, string | string[] | undefined>
export type QSn = Record<string, string | undefined>
export const PPS = [10, 14, 25, 50, 100]
export const PP_PADRAO = 14

/** Primeiro valor de cada param + aba/sub herdados do basePath quando o `sp` não os traz. */
export function lerQs(sp: SP, basePath: string): { base: string; qs: QSn } {
  const [base, query = ''] = basePath.split('?')
  const qs: QSn = {}
  for (const [k, v] of new URLSearchParams(query)) qs[k] = v
  for (const [k, v] of Object.entries(sp)) { const s = Array.isArray(v) ? v[0] : v; if (s !== undefined && s !== '') qs[k] = s }
  return { base, qs }
}

export const inteiro = (v: string | undefined, padrao: number, min = 1, max = 100000): number => {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao
}
export const porPaginaDe = (v: string | undefined): number => { const n = inteiro(v, PP_PADRAO); return PPS.includes(n) ? n : PP_PADRAO }
export const dirDe = (v: string | undefined): 'asc' | 'desc' => (v === 'desc' ? 'desc' : 'asc')

/** Remove caracteres que quebram o filtro `.or()`/`.ilike()` do PostgREST. */
export const limparBusca = (q: string | undefined): string => (q ?? '').trim().replace(/[,%()*\\]/g, ' ').replace(/\s+/g, ' ').trim()

/** Normaliza para busca sem acento/caixa. */
export const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Pagina uma lista já em memória (servidor) e corrige a página fora do intervalo. */
export function paginarMemoria<T>(itens: T[], pagina: number, porPagina: number): { itens: T[]; pagina: number; total: number } {
  const total = itens.length
  const ult = Math.max(1, Math.ceil(total / porPagina))
  const p = Math.min(Math.max(1, pagina), ult)
  return { itens: itens.slice((p - 1) * porPagina, p * porPagina), pagina: p, total }
}

export function ordenarPor<T>(itens: T[], chave: (x: T) => string | number, dir: 'asc' | 'desc'): T[] {
  const f = dir === 'desc' ? -1 : 1
  return [...itens].sort((a, b) => {
    const x = chave(a), y = chave(b)
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * f
    return String(x).localeCompare(String(y), 'pt-BR') * f
  })
}
