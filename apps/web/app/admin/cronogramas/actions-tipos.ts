export type CategoriaRow = {
  id: string
  nome: string
  slug: string
  cor: string | null
  ordem: number
  /** Quantos cronogramas usam esta categoria — evita excluir uma em uso sem saber. */
  usos: number
}

export type CronogramaLista = {
  id: string
  slug: string
  nome: string
  carga_horaria: number
  total_semanas: number
  dias_curso: number[]
  dias_nome: string[]
  semanas_revisao: number[]
  categoria_id: string | null
  categoria_nome: string | null
  status: 'rascunho' | 'liberado'
  ordem: number
  faixa: string
  metas: number
  /** Em quantos pacotes está — zero significa invisível para o aluno. */
  pacotes: number
}

export type EntradaCronograma = {
  nome: string
  carga_horaria: number
  total_semanas: number
  dias_curso: number[]
  dias_nome: string[]
  semanas_revisao: number[]
  categoria_id: string | null
  subtitulo: string | null
  ordem: number
}
