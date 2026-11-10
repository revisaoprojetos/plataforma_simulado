import type { Grade } from '@/lib/cronograma/tipos'

export type EmissaoResumo = {
  id: string
  cronograma_id: string
  cronograma_nome: string
  titulo: string | null
  criado_em: string
  arquivada: boolean
  /** Só vem no caminho de renderização (PDF); a lista do aluno não precisa. */
  estudante_id?: string
  estudante_nome?: string | null
  /** Estado de leitura do aluno: semanas fechadas, contagem escondida. */
  preferencias?: unknown
  resumo: {
    totalSemanas?: number
    semanasConteudo?: number
    semanasRevisao?: number
    atividades?: number
    conclusao?: string
    subtitulo?: string
  } | null
  formulario: Record<string, unknown> | null
}

export type PaginaEmissoes = {
  itens: EmissaoResumo[]
  /** Quantos existem no filtro atual — é o que permite montar a paginação. */
  total: number
  /** Contagens das duas abas, independentes do filtro, para os rótulos não oscilarem. */
  ativas: number
  arquivadas: number
}

export type EmissaoAberta = {
  emissao: EmissaoResumo
  grade: Grade
  /** Do CATÁLOGO, não do formulário salvo — a folha impressa usa na faixa "MARCA - 2H". */
  cargaHoraria: number | null
  /** O cronograma saiu do ar (despublicado ou excluído) desde a emissão. */
  indisponivel: boolean
}
