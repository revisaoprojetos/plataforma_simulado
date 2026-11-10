// Tipos exportados por banco-questoes/estudantes-actions.ts — fora do 'use server' para não quebrar o next build.

export interface AlunoBusca { id: string; nome: string; email: string | null; telefone: string | null; classificacao: string | null; jaVinculado: boolean }
export interface DetalhesVinc { ultimo: Record<string, string>; grupos: Record<string, { id: string; nome: string; cor: string | null }[]> }
export interface GrupoBancoOpc { id: string; nome: string; cor: string | null; membros: number; vinculado: boolean; pai_id: string | null; is_mestre: boolean }
