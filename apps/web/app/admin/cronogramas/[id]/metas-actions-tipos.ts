import type { TipoMeta } from '@/lib/cronograma/tipos'

export type CronogramaDetalhe = {
  id: string
  slug: string
  nome: string
  carga_horaria: number
  total_semanas: number
  dias_curso: number[]
  dias_nome: string[]
  semanas_revisao: number[]
  categoria_nome: string | null
  status: 'rascunho' | 'liberado'
}

/** Problemas de DADO que a equipe precisa ver — não são erros de uso. */
export type Diagnostico = {
  semanasComMetasEmRevisao: number[]
  metasForaDosDias: number
  metasForaDasSemanas: number
  questoesSemLink: { disciplina: string; aula: string }[]
  duracoesDivergentes: { semana: number; tipo: string }[]
  semanasVazias: number[]
}

export type EntradaMeta = {
  semana: number
  dia: number
  tipo: TipoMeta
  disciplina: string
  disciplina_id: string | null
  aula: string | null
  conteudo: string | null
  duracao: string | null
  ordem: number
  simulado_id: string | null
  simulado_externo_nome: string | null
  simulado_externo_url: string | null
}

export type OpcoesRepetir = {
  incrementoAula: number
  substituir: boolean
}

export type ComposicaoBanco = {
  conjuntoIds: string[]
  semanaInicial: number
  diaInicial: number
  estrategia: 'sequencial' | 'mesmo_dia'
}

export type PacotesDoCronograma = {
  dentro: { id: string; nome: string; alcance: number }[]
  fora: { id: string; nome: string; alcance: number }[]
}
