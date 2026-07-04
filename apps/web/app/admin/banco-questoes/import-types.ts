/** Tipos compartilhados (cliente + server actions) da importação de questões. */

export interface AltImport {
  texto: string
  correta: boolean
  ordem: number
}

export interface QuestaoImport {
  linha: number
  enunciado: string
  tipo: 'objetiva' | 'discursiva'
  disciplina?: string | null
  banca?: string | null
  orgao?: string | null
  ano?: number | null
  nivel_dificuldade?: string | null
  comentario_professor?: string | null
  alternativas: AltImport[]
  // Preenchidos na análise:
  jaExiste?: boolean
  questaoIdExistente?: string | null
  erro?: string | null
}

export interface AnaliseImport {
  ok: boolean
  error?: string
  questoes?: QuestaoImport[]
  resumo?: { total: number; novas: number; jaExistem: number; comErro: number }
}

export interface ResultadoImport {
  ok: boolean
  error?: string
  criadas?: number
  jaExistiam?: number
  vinculadas?: number
}
