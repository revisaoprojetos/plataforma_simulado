// Tipos de disciplinas-actions.ts — sem 'use server' para não quebrar o next build

export type DisciplinaAtual = { id: string; nome: string; classificacao: string | null; cor: string | null; ordem: number | null }

export type DisciplinaDisponivel = { chave: string; nome: string; classificacao: string | null; cor: string | null; ordem: number | null; origens: string[] }

export type PlataformaCol = { id: string; nome: string }

export type DisciplinaTodas = { id: string; tenant_id: string; nome: string; classificacao: string | null }
