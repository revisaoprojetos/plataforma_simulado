// Linhas da lista de páginas de UMA seção (puro). A ORDEM vem pronta do servidor (ordenar_por da seção, subpáginas agrupadas sob o pai):
// aqui só se achata a hierarquia (nível 0..2) e se escondem os descendentes de páginas recolhidas. NÃO reordena.
import type { Pagina } from './tipos'

export type LinhaPagina = { pg: Pagina; nivel: number; temFilhos: boolean }
const nv = (p: Pagina) => Math.max(0, Math.min(2, p.nivel ?? 0))

/** `paginas` já na ordem final do servidor. A 1ª linha é tratada como nível 0. */
export function organizarPaginas(paginas: Pagina[], recolhidas: ReadonlySet<string>): LinhaPagina[] {
  const linhas: LinhaPagina[] = []
  let corte: number | null = null // nível da página recolhida cujos descendentes estão sendo ocultados
  paginas.forEach((pg, i) => {
    const n = i === 0 ? 0 : nv(pg)
    if (corte !== null) { if (n > corte) return; corte = null }
    const temFilhos = i + 1 < paginas.length && nv(paginas[i + 1]) > n
    linhas.push({ pg, nivel: n, temFilhos })
    if (temFilhos && recolhidas.has(pg.id)) corte = n
  })
  return linhas
}

/** Página + descendentes contíguos (o servidor move o grupo junto). */
export function grupoDe(paginas: Pagina[], id: string): Pagina[] {
  const i = paginas.findIndex((p) => p.id === id); if (i < 0) return []
  const n = nv(paginas[i]); const g = [paginas[i]]
  for (let j = i + 1; j < paginas.length && nv(paginas[j]) > n; j++) g.push(paginas[j])
  return g
}

/** Ancestrais (ids) de uma página, para expandir ao abrir. */
export function ancestraisDe(paginas: Pagina[], id: string): string[] {
  const i = paginas.findIndex((p) => p.id === id); if (i <= 0) return []
  const out: string[] = []; let n = nv(paginas[i])
  for (let j = i - 1; j >= 0 && n > 0; j--) if (nv(paginas[j]) < n) { out.push(paginas[j].id); n = nv(paginas[j]) }
  return out
}

/** Página seguinte/anterior na ordem visível (para Ctrl+PgDn/PgUp). */
export function vizinha(linhas: LinhaPagina[], id: string | null, delta: 1 | -1): string | null {
  if (!linhas.length) return null
  const i = linhas.findIndex((l) => l.pg.id === id)
  return linhas[Math.max(0, Math.min(linhas.length - 1, (i < 0 ? 0 : i + delta)))]?.pg.id ?? null
}
