// Tipos de actions.ts — sem 'use server' para não quebrar o next build

export type UsuarioPerfil = { userId: string; nome: string | null; email: string | null; roleAtual?: string | null }
