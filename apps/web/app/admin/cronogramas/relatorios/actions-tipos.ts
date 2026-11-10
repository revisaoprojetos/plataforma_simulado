export type Geral = {
  emissoes: number
  alunos: number
  cronogramas_usados: number
  concluidas: number
  planejadas: number
  emissoes_7d: number
  emissoes_30d: number
  alunos_30d: number
}

export type LinhaAluno = {
  estudante_id: string
  nome: string
  email: string | null
  emissoes: number
  ultima: string
  concluidas: number
  planejadas: number
  total_linhas: number
}

export type LinhaCronograma = {
  cronograma_id: string
  nome: string
  carga_horaria: number | null
  emissoes: number
  alunos: number
  concluidas: number
  planejadas: number
}

export type LinhaDia = { dia: string; emissoes: number; concluidas: number }

export type DadosRelatorio = {
  geral: Geral
  alunos: LinhaAluno[]
  cronogramas: LinhaCronograma[]
  dias: LinhaDia[]
}
