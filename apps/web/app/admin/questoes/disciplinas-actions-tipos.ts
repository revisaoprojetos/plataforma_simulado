// Tipos de disciplinas-actions.ts — sem 'use server' para não quebrar o next build

export type DisciplinaContagem = { id: string; nome: string; questoes: number; assuntos: number }

export type UnificacaoRecente = { id: string; mantida: string; duplicadas: string[]; questoes: number; criado_em: string }

export type DisciplinaClass = { id: string; nome: string; classificacao: string | null; cor: string | null; ordem: number; questoes: number }

export type PastaConteudo = { id: string; nome: string; pai_id: string | null; disciplina_id: string | null; docs: number }
