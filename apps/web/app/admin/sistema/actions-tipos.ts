// Tipos de actions.ts — sem 'use server' para não quebrar o next build

export type PessoaLiberada = { id: string; nome: string; email: string | null }

export type WorkspaceGrupo = { id: string; nome: string; cor: string | null }
