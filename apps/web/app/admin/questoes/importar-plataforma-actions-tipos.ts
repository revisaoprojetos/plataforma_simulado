// Tipos de importar-plataforma-actions.ts — sem 'use server' para não quebrar o next build

export interface QuestaoOrigem {
  id: string
  codigo: string | null
  enunciado: string
  status: string | null
  tipo: string | null
  nivel_dificuldade: string | null
  ano: number | null
  disciplina: string | null
  assunto: string | null
  banca: string | null
  orgao: string | null
  cargo: string | null
}

export interface FiltrosOrigem {
  busca?: string
  status?: string
  disciplinaId?: string
  dificuldade?: string
  tipo?: string
  page?: number
}
