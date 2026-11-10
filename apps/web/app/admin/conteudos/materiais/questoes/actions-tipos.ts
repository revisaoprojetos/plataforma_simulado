// Tipos exportados por conteudos/materiais/questoes/actions.ts — fora do 'use server' para não quebrar o next build.

export type RefClass = { id: string; nome: string } | null
export type ClassificacaoPadrao = {
  disciplina: RefClass
  assunto: RefClass
  banca: RefClass
  orgao: RefClass
}
