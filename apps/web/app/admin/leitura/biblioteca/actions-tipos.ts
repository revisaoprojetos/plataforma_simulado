// Tipos de actions.ts — sem 'use server' para não quebrar o next build

export type Tipo = 'conteudo' | 'tag'

export type BibItem = { id: string; tipo: string; nome: string; descricao: string | null; html: string; slug: string | null; pasta_id: string | null; atualizado_em: string | null }

export type BibPasta = { id: string; nome: string; pai_id: string | null; cor: string | null }
