export type PlataformaRow = {
  id: string
  nome: string
  slug: string
  cor: string | null
  ordem: number
  ativo: boolean
  /** Quantos links usam esta plataforma — evita excluir uma que está em uso sem saber. */
  usos: number
}

export type LinkAulaRow = {
  id: string
  disciplina: string
  aula: string
  tema: string | null
  urls: { plataforma_id: string; url: string }[]
  /** Quantas metas de questões citam este par. */
  usos: number
}

export type EntradaLink = {
  disciplina: string
  aula: string
  tema: string | null
  urls: { plataforma_id: string; url: string }[]
}
