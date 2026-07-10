/** Tipos compartilhados (cliente + server actions) da importação de questões. */

export interface AltImport {
  texto: string
  correta: boolean
  ordem: number
  lei?: string | null
  comentario?: string | null
}

export interface QuestaoImport {
  linha: number
  numero?: string | null // "Número" → external_id
  enunciado: string
  tipo: 'objetiva' | 'discursiva'
  formato?: 'multipla' | 'certo_errado' // classificação da objetiva
  disciplina?: string | null
  categoria?: string | null
  assunto?: string | null
  assunto_detalhe?: string | null
  grupo?: string | null
  pilar_1?: string | null
  pilar_2?: string | null
  banca?: string | null
  orgao?: string | null
  cargo?: string | null
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
