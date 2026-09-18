import type { DesempenhoLeitura } from '@/lib/leitura/pontuacao'

// Desafios do MÓDULO (metas de longo prazo que dão bônus de XP uma vez por aluno). Guardados em
// `simulado_pastas.desafios` (jsonb). Editáveis no admin; avaliados no engine de gamificação.

export type DesafioTipo = 'concluir_aulas' | 'gabaritar_quizzes' | 'acertar_questoes'
export interface DesafioModulo {
  id: string
  titulo: string
  tipo: DesafioTipo
  /** Meta a atingir (nº de aulas / quizzes / acertos). */
  meta: number
  /** Bônus de XP concedido ao completar (uma vez). */
  xp: number
  ativo: boolean
}

export const DESAFIO_TIPOS: { v: DesafioTipo; label: string; unidade: string }[] = [
  { v: 'concluir_aulas', label: 'Concluir aulas', unidade: 'aulas' },
  { v: 'gabaritar_quizzes', label: 'Gabaritar quizzes (100%)', unidade: 'quizzes' },
  { v: 'acertar_questoes', label: 'Acertar questões', unidade: 'acertos' },
]

const isTipo = (v: unknown): v is DesafioTipo => v === 'concluir_aulas' || v === 'gabaritar_quizzes' || v === 'acertar_questoes'

/** Higieniza o jsonb cru (do banco) para a lista canônica de desafios. */
export function normalizarDesafios(raw: unknown): DesafioModulo[] {
  if (!Array.isArray(raw)) return []
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : d)
  return raw
    .filter((x) => x && typeof x === 'object')
    .map((x: any, i): DesafioModulo => ({
      id: typeof x.id === 'string' && x.id ? x.id : `d${i}`,
      titulo: typeof x.titulo === 'string' ? x.titulo.slice(0, 120) : 'Desafio',
      tipo: isTipo(x.tipo) ? x.tipo : 'concluir_aulas',
      meta: Math.max(1, num(x.meta, 1)),
      xp: num(x.xp, 0),
      ativo: x.ativo !== false,
    }))
}

/** Progresso do aluno para um desafio, dado seu desempenho no módulo. */
export function progressoDesafio(d: DesafioModulo, desemp: DesempenhoLeitura): number {
  switch (d.tipo) {
    case 'concluir_aulas': return desemp.aulasConcluidas
    case 'gabaritar_quizzes': return desemp.aulasGabaritadas
    case 'acertar_questoes': return desemp.acertos
    default: return 0
  }
}
