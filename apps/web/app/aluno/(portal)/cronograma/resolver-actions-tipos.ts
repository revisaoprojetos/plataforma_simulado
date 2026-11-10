export type AltResolver = { id: string; texto: string; correta: boolean }
export type QuestaoResolver = { id: string; enunciado: string; comentario: string | null; alternativas: AltResolver[] }
