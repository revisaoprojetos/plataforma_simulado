// Ranking de um simulado com critérios de desempate configuráveis por simulado.
// Os critérios são uma LISTA ORDENADA (aplicada só quando a Pontuação empata):
// cada item pode ser Passaporte, um Grupo de questões, Idade, Mais acertos ou Menor tempo.
// O admin adiciona quantos quiser (inclusive vários grupos) e reordena.

export type TipoCriterio = 'passaporte' | 'grupo' | 'idade' | 'acertos' | 'tempo'

export type Criterio = {
  id: string
  tipo: TipoCriterio
  grupoId?: string | null   // usado quando tipo === 'grupo'
}

export type CriteriosRanking = {
  criterios: Criterio[]     // ordem de desempate (após a pontuação)
}

export const CRITERIOS_PADRAO: CriteriosRanking = { criterios: [{ id: 'passaporte', tipo: 'passaporte' }] }

/** Rótulo curto de um critério (para chips/PDF). `nomeGrupo` resolve o nome do grupo. */
export function rotuloCriterio(c: Criterio, nomeGrupo?: (id: string) => string | undefined): string {
  switch (c.tipo) {
    case 'passaporte': return 'Passaporte'
    case 'grupo': return (c.grupoId && nomeGrupo?.(c.grupoId)) || 'Grupo'
    case 'idade': return 'Idade (mais velho)'
    case 'acertos': return 'Mais acertos'
    case 'tempo': return 'Menor tempo'
    default: return '—'
  }
}

/** Normaliza o que veio salvo (aceita o formato novo em lista ou o legado C1..C5). */
export function normalizarCriterios(raw: unknown): CriteriosRanking {
  const r = (raw ?? {}) as Record<string, unknown>
  if (Array.isArray(r.criterios)) {
    const criterios = (r.criterios as any[])
      .filter((x) => x && typeof x.tipo === 'string')
      .map((x, i) => ({ id: String(x.id ?? `c${i}`), tipo: x.tipo as TipoCriterio, grupoId: x.grupoId ?? null }))
    return { criterios }
  }
  // Legado: { c1Passaporte, c2GrupoId, c3GrupoId, c4GrupoId, c5Idade }
  const list: Criterio[] = []
  if (r.c1Passaporte) list.push({ id: 'passaporte', tipo: 'passaporte' })
  if (r.c2GrupoId) list.push({ id: 'g2', tipo: 'grupo', grupoId: r.c2GrupoId as string })
  if (r.c3GrupoId) list.push({ id: 'g3', tipo: 'grupo', grupoId: r.c3GrupoId as string })
  if (r.c4GrupoId) list.push({ id: 'g4', tipo: 'grupo', grupoId: r.c4GrupoId as string })
  if (r.c5Idade) list.push({ id: 'idade', tipo: 'idade' })
  return { criterios: list.length ? list : [...CRITERIOS_PADRAO.criterios] }
}

export type EntradaRanking = {
  estudanteId: string
  nome: string
  email?: string | null
  data?: string | null        // ISO da sessão (data de conclusão)
  classificacao?: string | null // rótulo (Passaporte, Estudante…)
  pontuacao: number           // nota (ou acertos) — critério primário (com re-correções)
  pontuacaoSem?: number       // nota antes de anulações/trocas (quando afetado)
  afetado?: boolean           // teve pontos alterados por anulação/troca
  acertos: number
  total: number
  porGrupo: Record<string, number>  // acertos por grupoId
  passaporte: boolean
  idade: number | null
  tempoSeg?: number | null    // duração da prova (s) — critério "menor tempo"
}

/** Diferença de um único critério (>0 → b vem antes; <0 → a vem antes; 0 → empate). */
function difCriterio(a: EntradaRanking, b: EntradaRanking, c: Criterio): number {
  switch (c.tipo) {
    case 'passaporte': return (b.passaporte ? 1 : 0) - (a.passaporte ? 1 : 0)
    case 'grupo': { const g = c.grupoId ?? ''; return (b.porGrupo[g] ?? 0) - (a.porGrupo[g] ?? 0) }
    case 'idade': { const ai = a.idade ?? -1, bi = b.idade ?? -1; return bi - ai }           // mais velho à frente
    case 'acertos': return b.acertos - a.acertos                                             // mais acertos à frente
    case 'tempo': { const at = a.tempoSeg ?? Infinity, bt = b.tempoSeg ?? Infinity; return at - bt } // menor tempo à frente
    default: return 0
  }
}

/** Comparador de desempate (retorna <0 se `a` vem antes de `b`).
 *  Ordem: Pontuação → cada critério da lista, na ordem configurada. */
export function compararRanking(a: EntradaRanking, b: EntradaRanking, c: CriteriosRanking): number {
  if (a.pontuacao !== b.pontuacao) return b.pontuacao - a.pontuacao
  for (const cr of c.criterios ?? []) {
    const d = difCriterio(a, b, cr)
    if (d !== 0) return d
  }
  return 0
}

/** Ordena e atribui a posição (1º, 2º…). */
export function ordenarRanking(entradas: EntradaRanking[], c: CriteriosRanking): (EntradaRanking & { pos: number })[] {
  return [...entradas].sort((a, b) => compararRanking(a, b, c)).map((e, i) => ({ ...e, pos: i + 1 }))
}

/** Idade em anos a partir de uma data (YYYY-MM-DD) e uma referência (padrão: agora — passar do servidor). */
export function idadeEmAnos(nascimento: string | null | undefined, refIso: string): number | null {
  if (!nascimento) return null
  const n = new Date(nascimento), ref = new Date(refIso)
  if (isNaN(n.getTime())) return null
  let a = ref.getFullYear() - n.getFullYear()
  const m = ref.getMonth() - n.getMonth()
  if (m < 0 || (m === 0 && ref.getDate() < n.getDate())) a--
  return a
}
