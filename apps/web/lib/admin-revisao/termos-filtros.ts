// Filtros + facetas (contagem por opção) de Unificar › Termos — lógica PURA (cliente + servidor + testes).
// Faceta = cada dimensão é contada com TODOS os OUTROS filtros aplicados (mesmo padrão do Banco): o número é "quantos grupos eu teria se marcasse esta".
import type { ConfTermo, GrupoTermo, TipoTermo } from './questoes-termos-tipos'

export type DimTermo = 'tipo' | 'confianca' | 'disciplina' | 'faixa' | 'variantes'
export const DIMS_TERMO: readonly DimTermo[] = ['tipo', 'confianca', 'disciplina', 'faixa', 'variantes']
export type FiltrosTermo = Partial<Record<DimTermo, string[]>>
export type FacetasTermo = Record<DimTermo, Record<string, number>>

/** Faixas de nº de questões do GRUPO (soma das variantes). `0` = sem questões. */
export const FAIXAS_TERMO: { v: string; label: string; min: number; max: number }[] = [
  { v: '0', label: 'Sem questões', min: 0, max: 0 },
  { v: '1-10', label: '1 a 10 questões', min: 1, max: 10 },
  { v: '11-100', label: '11 a 100 questões', min: 11, max: 100 },
  { v: '101-1000', label: '101 a 1.000 questões', min: 101, max: 1000 },
  { v: '1001+', label: 'Mais de 1.000 questões', min: 1001, max: Infinity },
]
export const VARIANTES_TERMO: { v: string; label: string }[] = [{ v: '2', label: '2 termos' }, { v: '3', label: '3 termos' }, { v: '4+', label: '4 ou mais termos' }]

export const faixaDe = (n: number): string => FAIXAS_TERMO.find((f) => n >= f.min && n <= f.max)?.v ?? '0'
export const varianteDe = (n: number): string => (n >= 4 ? '4+' : String(Math.max(2, n)))

/** Disciplinas às quais o grupo pertence: assunto → disciplina-pai de cada variante; disciplina → a própria variante. */
export function disciplinasDoGrupo(g: GrupoTermo): { id: string; nome: string }[] {
  const m = new Map<string, string>()
  for (const v of g.variantes) {
    if (g.tipo === 'disciplina') m.set(v.id, v.nome)
    else if (v.paiId) m.set(v.paiId, v.paiNome ?? v.paiId)
  }
  return [...m].map(([id, nome]) => ({ id, nome }))
}

const valoresDe = (g: GrupoTermo, d: DimTermo): string[] => {
  switch (d) {
    case 'tipo': return [g.tipo]
    case 'confianca': return [g.confianca]
    case 'disciplina': return disciplinasDoGrupo(g).map((x) => x.id)
    case 'faixa': return [faixaDe(g.questoes)]
    case 'variantes': return [varianteDe(g.variantes.length)]
  }
}

/** Aplica os filtros (E entre dimensões, OU dentro da dimensão), ignorando `ignorar` (usado pela faceta). */
export function filtrarGruposTermo(grupos: GrupoTermo[], f: FiltrosTermo, ignorar?: DimTermo): GrupoTermo[] {
  const ativos = DIMS_TERMO.filter((d) => d !== ignorar && (f[d]?.length ?? 0) > 0)
  if (!ativos.length) return grupos
  return grupos.filter((g) => ativos.every((d) => { const sel = f[d]!; return valoresDe(g, d).some((v) => sel.includes(v)) }))
}

export function calcularFacetasTermo(grupos: GrupoTermo[], f: FiltrosTermo): FacetasTermo {
  const out = { tipo: {}, confianca: {}, disciplina: {}, faixa: {}, variantes: {} } as FacetasTermo
  for (const d of DIMS_TERMO) {
    for (const g of filtrarGruposTermo(grupos, f, d)) for (const v of valoresDe(g, d)) out[d][v] = (out[d][v] ?? 0) + 1
  }
  return out
}

/** Opções de disciplina presentes nos grupos (ordenadas por nome). */
export function opcoesDisciplina(grupos: GrupoTermo[]): { v: string; label: string }[] {
  const m = new Map<string, string>()
  for (const g of grupos) for (const d of disciplinasDoGrupo(g)) m.set(d.id, d.nome)
  return [...m].map(([v, label]) => ({ v, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

export const lerListaTermo = (s: string | null | undefined): string[] => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 200)
export type { ConfTermo, TipoTermo }
