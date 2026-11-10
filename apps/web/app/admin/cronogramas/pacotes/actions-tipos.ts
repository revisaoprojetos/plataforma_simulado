export type PacoteLista = {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
  acesso_gratuito: boolean
  ordem: number
  cronogramas: number
  grupos: number
  estudantes: number
  /** Alunos alcançados, contando os membros dos grupos vinculados (sem duplicar). */
  alcance: number
}

export type PacoteDetalhe = {
  pacote: { id: string; nome: string; descricao: string | null; ativo: boolean; acesso_gratuito: boolean }
  cronogramas: { id: string; nome: string; status: string; metas: number }[]
  grupos: { id: string; nome: string; membros: number }[]
  estudantes: { id: string; nome: string; email: string | null }[]
  /** Catálogo e grupos disponíveis para vincular. */
  cronogramasDisponiveis: { id: string; nome: string; status: string; metas: number }[]
  gruposDisponiveis: { id: string; nome: string; membros: number }[]
  alcance: number
}

export type PreviaDesvinculo = {
  membros: number
  mantidosPorOutroGrupo: number
  jaEmitiram: number
  perdemAcesso: number
}
