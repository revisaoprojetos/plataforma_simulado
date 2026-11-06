// Tipos do "Conjunto de questões" — arquivo SEM 'use server' (um módulo 'use server' só pode
// exportar funções async; exportar interface/type daí passa no tsc mas quebra o next build/HMR).

export interface QuestaoConjuntoItem {
  id: string; questao_id: string; ordem: number
  enunciado: string; disciplina: string | null; tipo: string | null; nivel: string | null
}
