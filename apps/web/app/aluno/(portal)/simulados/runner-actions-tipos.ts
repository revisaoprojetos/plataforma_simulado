export type ModoPessoal = 'estudo' | 'prova' | 'revisao'
export type AltRunner = { id: string; texto: string; ordem: number; correta: boolean }
export type QuestaoRunner = {
  id: string; ordem: number; enunciado: string; tipo: string
  imagemUrl: string | null; disciplina: string | null; comentario: string | null
  origemSimulado: string | null; origemNumero: number | null
  alternativas: AltRunner[]
  bloqueada: boolean // anulada no banco → não responde (ponto garantido a todos na correção)
}
export type SecaoRunner = { id: string; nome: string; questaoIds: string[] }
export type SessaoPessoal = {
  sessaoId: string; simuladoId: string; titulo: string; modo: ModoPessoal
  tempoLimiteMin: number | null; iniciadoEm: string; status: string
  questoes: QuestaoRunner[]; respostas: Record<string, string>; secoes: SecaoRunner[]
  estudanteNome: string
}

export type ResumoPessoal = {
  simuladoId: string; titulo: string; modo: ModoPessoal; tempoLimiteMin: number | null
  total: number; porDisciplina: { nome: string; count: number }[]
  secoes: { nome: string; count: number }[]; temSecoes: boolean
  emAndamento: boolean; respondidas: number
}

export type QuestaoCaderno = { numero: number; secao: string | null; disciplina: string | null; enunciado: string; alternativas: string[] }
