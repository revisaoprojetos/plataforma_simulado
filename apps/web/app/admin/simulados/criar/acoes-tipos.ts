// Tipos de acoes.ts — sem 'use server' para não quebrar o next build

export type PastaSalvar = { id: string; nome: string; pai_id: string | null }

export type MembroGrupo = { id: string; nome: string; email: string | null; telefone: string | null; cpf: string | null; classificacao: string | null; avatar: string | null; perfil_avatar_cor: string | null }
