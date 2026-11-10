// Tipos exportados por banco-questoes/actions.ts — fora do 'use server' para não quebrar o next build.

export type QuestaoBancoBuscaItem = {
  id: string; external_id: string | null; enunciado: string; tipo: string; formato: string | null
  nivel_dificuldade: string | null; disciplina: string | null; assunto: string | null; assunto_detalhe: string | null
  banca: string | null; orgao: string | null; ano: number | null
  etiquetas: { nome: string; cor: string | null }[]
}
export type FiltrosBuscaBanco = { busca?: string; disciplinaId?: string; dificuldade?: string; tipo?: string }
export interface DetalheQuestao {
  enunciado: string
  comentario_professor: string | null
  tipo: string | null
  alternativas: { ordem: number; texto: string; correta: boolean; comentario: string | null; lei: string | null }[]
}
export type QuestaoDetalheBanco = { alternativas: { ordem: number; texto: string; correta: boolean; comentario: string | null }[]; comentario: string | null }
export type GrupoBanco = { id: string; nome: string; disciplinas: string[] }
