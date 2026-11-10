export type EstadoAtual = {
  cronogramas: { slug: string; nome: string; status: string; metas: number }[]
  linksChaves: string[]
  plataformas: { id: string; nome: string; slug: string }[]
  /** Slugs de tipo cadastrados — a validação das metas confere contra eles. */
  tiposMeta: string[]
}
