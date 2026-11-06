// FILTRO DE QUESTÕES DA PLATAFORMA POR META (Cronograma Adaptativo). Módulo PURO (sem server-only):
// usado no admin (editor), no servidor (consulta) e na normalização. Guarda IDs da taxonomia — nunca nomes.

export type Dificuldade = 'facil' | 'medio' | 'dificil'
export const DIFICULDADES: { v: Dificuldade; rot: string }[] = [
  { v: 'facil', rot: 'Fácil' }, { v: 'medio', rot: 'Médio' }, { v: 'dificil', rot: 'Difícil' },
]

export interface FiltroQuestoesMeta {
  /** ids de simulado_disciplinas */ disc?: string[]
  /** ids de simulado_assuntos (um assunto-pai inclui os filhos na consulta) */ ass?: string[]
  /** ids de simulado_bancas */ banca?: string[]
  /** ids de simulado_orgaos */ orgao?: string[]
  anos?: number[]
  dif?: Dificuldade[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_IDS = 100

const ids = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined
  const out = [...new Set(v.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x)))].slice(0, MAX_IDS)
  return out.length ? out : undefined
}

/** Sanitiza qualquer entrada (banco/cliente) → só campos conhecidos, com tipo e limite certos. */
export function normalizarFiltro(raw: unknown): FiltroQuestoesMeta {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const o = raw as Record<string, unknown>
  const f: FiltroQuestoesMeta = {}
  const disc = ids(o.disc); if (disc) f.disc = disc
  const ass = ids(o.ass); if (ass) f.ass = ass
  const banca = ids(o.banca); if (banca) f.banca = banca
  const orgao = ids(o.orgao); if (orgao) f.orgao = orgao
  if (Array.isArray(o.anos)) {
    const anos = [...new Set(o.anos.map((a) => Math.trunc(Number(a))).filter((a) => Number.isFinite(a) && a >= 1900 && a <= 2100))].slice(0, 40).sort((a, b) => b - a)
    if (anos.length) f.anos = anos
  }
  if (Array.isArray(o.dif)) {
    const dif = [...new Set(o.dif.filter((d): d is Dificuldade => d === 'facil' || d === 'medio' || d === 'dificil'))]
    if (dif.length) f.dif = dif
  }
  return f
}

/** Listas da taxonomia para o seletor do admin (carregadas sob demanda, uma vez). */
export interface OpcoesQf {
  disciplinas: { id: string; nome: string }[]
  bancas: { id: string; nome: string }[]
  orgaos: { id: string; nome: string }[]
  assuntos: { id: string; nome: string; disciplina_id: string | null; pai_id: string | null }[]
  anos: number[]
}

/** Sem nenhum critério = sem filtro configurado (a meta NÃO oferece questões da plataforma). */
export function filtroVazio(f: FiltroQuestoesMeta | null | undefined): boolean {
  return !f || !(f.disc?.length || f.ass?.length || f.banca?.length || f.orgao?.length || f.anos?.length || f.dif?.length)
}

/** Quantos critérios estão ativos (selo "3 filtros" na linha da aula). */
export function contarCriterios(f: FiltroQuestoesMeta | null | undefined): number {
  if (!f) return 0
  return [f.disc, f.ass, f.banca, f.orgao, f.anos, f.dif].filter((l) => l && l.length).length
}
