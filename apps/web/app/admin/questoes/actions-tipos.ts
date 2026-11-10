// Tipos de actions.ts — sem 'use server' para não quebrar o next build

export interface UsoQuestao { id: string; codigo: string | null; enunciado: string; bancos: string[]; simulados: string[]; respostas: number }
