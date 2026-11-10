export type FuncaoEtiqueta = 'anular' | 'avisar' | 'desconsiderar'
export type Etiqueta = { id: string; nome: string; cor: string | null; funcao?: FuncaoEtiqueta | null; total?: number }

export type SimuladoDaQuestao = { id: string; titulo: string; numero: number; publicado: boolean }
export type QuestaoDaEtiqueta = { id: string; titulo: string; disciplina: string | null; simulados: SimuladoDaQuestao[] }
