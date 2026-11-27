// Filtros MULTI + facetas (contagem ao vivo) do CADASTRO da taxonomia (Classificação › disciplinas/assuntos/bancas/órgãos…) — lógica PURA.
// E entre dimensões, OU dentro da dimensão; cada dimensão é contada com TODOS os outros filtros (e a busca) aplicados.
import type { ItemTaxG } from './biblioteca-questoes-gestao-tipos'

export type DimTax = 'disciplina' | 'uso' | 'faixa' | 'classe'
export const DIMS_TAX: readonly DimTax[] = ['disciplina', 'uso', 'faixa', 'classe']
export type FiltrosTax = Partial<Record<DimTax, string[]>>
export type FacetasTax = Record<DimTax, Record<string, number>>

export const OPCOES_USO_TAX = [{ v: 'em_uso', label: 'Com questões' }, { v: 'sem_uso', label: 'Sem questões' }]
export const OPCOES_CLASSE_TAX = [{ v: 'essencial', label: 'Essencial' }, { v: 'complementar', label: 'Complementar' }, { v: 'especifica', label: 'Específica' }, { v: 'nenhuma', label: 'Sem classificação' }]
export const FAIXAS_TAX: { v: string; label: string; min: number; max: number }[] = [
  { v: '0', label: 'Sem questões', min: 0, max: 0 },
  { v: '1-10', label: '1 a 10 questões', min: 1, max: 10 },
  { v: '11-100', label: '11 a 100 questões', min: 11, max: 100 },
  { v: '101-1000', label: '101 a 1.000 questões', min: 101, max: 1000 },
  { v: '1001+', label: 'Mais de 1.000 questões', min: 1001, max: Infinity },
]
export const SEM_DISCIPLINA = '_sem'

export function valoresTax(i: ItemTaxG, d: DimTax): string[] {
  if (d === 'disciplina') return [i.paiId ?? SEM_DISCIPLINA]
  if (d === 'uso') return [i.questoes === 0 ? 'sem_uso' : 'em_uso']
  if (d === 'classe') return [i.classificacao || 'nenhuma']
  return [FAIXAS_TAX.find((f) => i.questoes >= f.min && i.questoes <= f.max)?.v ?? '0']
}
const passa = (i: ItemTaxG, f: FiltrosTax, ignorar?: DimTax) => DIMS_TAX.every((d) => d === ignorar || !f[d]?.length || valoresTax(i, d).some((v) => f[d]!.includes(v)))

/** Aplica busca + filtros e devolve a lista e as facetas (mesma passada). */
export function filtrarTax(itens: ItemTaxG[], f: FiltrosTax, busca: (i: ItemTaxG) => boolean): { lista: ItemTaxG[]; facetas: FacetasTax } {
  const facetas: FacetasTax = { disciplina: {}, uso: {}, faixa: {}, classe: {} }
  for (const d of DIMS_TAX) for (const i of itens) if (busca(i) && passa(i, f, d)) for (const v of valoresTax(i, d)) facetas[d][v] = (facetas[d][v] ?? 0) + 1
  return { lista: itens.filter((i) => busca(i) && passa(i, f)), facetas }
}
/** Une os filtros legados (disciplina única, "só sem questões") aos multi. */
export function unirLegadoTax(m: FiltrosTax | undefined, disciplina?: string, semUso?: boolean): FiltrosTax {
  const out: FiltrosTax = { ...(m ?? {}) }
  if (disciplina && !out.disciplina?.length) out.disciplina = [disciplina]
  if (semUso && !out.uso?.length) out.uso = ['sem_uso']
  return out
}
export const listaCsvTax = (s: string | null | undefined, ok: (x: string) => boolean): string[] => [...new Set((s ?? '').split(',').map((x) => x.trim()).filter(ok))].slice(0, 200)
