export type FormaAula = { aula: string; n: number }
export type CronDaAula = { id: string; nome: string; aula: string; n: number }

export type VarianteAula = {
  disciplina: string
  aula_chave: string
  total: number
  formas: FormaAula[]
  cronogramas: CronDaAula[]
}

export type OndeEsta = {
  id: string
  nome: string
  semana: number
  dia: number
  aula: string | null
  meta_id: string
}

export type GrupoMeta = {
  chave: string
  tipo: string
  disciplina: string
  aula_chave: string
  conteudo: string | null
  n_metas: number
  n_cronogramas: number
  n_formas_aula: number
  cronogramas: OndeEsta[]
  total_linhas: number
}

export type DuracaoDivergente = {
  cronograma_id: string
  cronograma_nome: string
  semana: number
  tipo: string
  valores: { duracao: string; n: number }[]
  total: number
}
