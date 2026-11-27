// Filtros MULTI + facetas (contagem ao vivo) das Etiquetas — lógica PURA (servidor + testes). Cada dimensão é contada com TODOS os outros
// filtros aplicados ("quantas etiquetas eu teria se marcasse esta"). E entre dimensões, OU dentro da dimensão.
export type DimEt = 'situacao' | 'funcao' | 'faixa'
export const DIMS_ET: readonly DimEt[] = ['situacao', 'funcao', 'faixa']
export type FiltrosEt = Partial<Record<DimEt, string[]>>
export type FacetasEt = Record<DimEt, Record<string, number>>

export const OPCOES_SITUACAO_ET = [
  { v: 'em_uso', label: 'Em uso' }, { v: 'sem_uso', label: 'Sem uso' }, { v: 'em_simulado', label: 'Usada em simulados' },
  { v: 'duplicada', label: 'Nome repetido' }, { v: 'mais_usadas', label: 'Mais usadas (top 10)' },
]
export const OPCOES_FUNCAO_ET = [{ v: 'anular', label: 'Anular' }, { v: 'avisar', label: 'Avisar' }, { v: 'desconsiderar', label: 'Desconsiderar' }, { v: 'nenhuma', label: 'Sem função' }]
export const FAIXAS_ET: { v: string; label: string; min: number; max: number }[] = [
  { v: '0', label: 'Sem questões', min: 0, max: 0 },
  { v: '1-10', label: '1 a 10 questões', min: 1, max: 10 },
  { v: '11-100', label: '11 a 100 questões', min: 11, max: 100 },
  { v: '101-1000', label: '101 a 1.000 questões', min: 101, max: 1000 },
  { v: '1001+', label: 'Mais de 1.000 questões', min: 1001, max: Infinity },
]
export interface ItemEt { id: string; questoes: number; emSimulados: number; funcao: string | null; grupoDup: string | null }

export function valoresEt(e: ItemEt, d: DimEt, top: Set<string>): string[] {
  if (d === 'situacao') return [e.questoes === 0 ? 'sem_uso' : 'em_uso', ...(e.emSimulados > 0 ? ['em_simulado'] : []), ...(e.grupoDup ? ['duplicada'] : []), ...(top.has(e.id) ? ['mais_usadas'] : [])]
  if (d === 'funcao') return [e.funcao ?? 'nenhuma']
  return [FAIXAS_ET.find((f) => e.questoes >= f.min && e.questoes <= f.max)?.v ?? '0']
}
export const passaEt = (e: ItemEt, f: FiltrosEt, top: Set<string>, ignorar?: DimEt) =>
  DIMS_ET.every((d) => d === ignorar || !f[d]?.length || valoresEt(e, d, top).some((v) => f[d]!.includes(v)))
export function facetasEt<T extends ItemEt>(itens: T[], f: FiltrosEt, top: Set<string>, passaBusca: (e: T) => boolean): FacetasEt {
  const out: FacetasEt = { situacao: {}, funcao: {}, faixa: {} }
  for (const d of DIMS_ET) for (const e of itens) if (passaBusca(e) && passaEt(e, f, top, d)) for (const v of valoresEt(e, d, top)) out[d][v] = (out[d][v] ?? 0) + 1
  return out
}
/** Filtro legado (select único / KPIs) → multi. */
export const filtroLegadoEt = (x: string): FiltrosEt => (x === 'sem_uso' ? { situacao: ['sem_uso'] } : x === 'duplicadas' ? { situacao: ['duplicada'] } : x === 'mais_usadas' ? { situacao: ['mais_usadas'] } : x === 'funcao' ? { funcao: ['anular', 'avisar', 'desconsiderar'] } : {})
export const lerListaEt = (s: string | null | undefined, validos: string[]): string[] => [...new Set((s ?? '').split(',').map((x) => x.trim()).filter((x) => validos.includes(x)))]
