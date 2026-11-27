// Herança de classificação (puro): documento → pasta mais próxima → nenhuma.
// Sem classificação = 'nenhuma' (pendência); NÃO cai silenciosamente em pdfull.

export interface ItemCatalogo { id: string }

export interface PastaAncestral {
  id: string
  /** `classificacao_id` da pasta. null = não definido (herda da próxima acima). */
  classificacaoId: string | null
}

export type OrigemClassificacao = 'documento' | `pasta:${string}` | 'nenhuma' | 'legado'

export interface ClassificacaoResolvida<T extends ItemCatalogo> {
  classificacao: T | null
  origem: OrigemClassificacao
  /** true quando não há classificação (nem legado): vira pendência na matriz. */
  pendente: boolean
}

/**
 * @param docClassId       `classificacao_id` do documento (null = herda)
 * @param pastasAncestrais da pasta do documento até a raiz (MAIS PRÓXIMA PRIMEIRO)
 * @param catalogo         catálogo do tenant (array ou Map id→item); id ausente nele é ignorado e a busca segue acima
 * @param fallbackLegado   transição: se informado e nada foi achado, devolve-o com origem 'legado' (replica o
 *                         pdfull de hoje). Omitido = pendência explícita.
 */
export function resolverClassificacaoDoc<T extends ItemCatalogo>(args: {
  docClassId: string | null | undefined
  pastasAncestrais: readonly PastaAncestral[]
  catalogo: readonly T[] | ReadonlyMap<string, T>
  fallbackLegado?: T | null
}): ClassificacaoResolvida<T> {
  const { docClassId, pastasAncestrais, catalogo, fallbackLegado } = args
  const porId: ReadonlyMap<string, T> = catalogo instanceof Map
    ? (catalogo as ReadonlyMap<string, T>)
    : new Map((catalogo as readonly T[]).map((c) => [c.id, c] as const))
  if (docClassId) {
    const c = porId.get(docClassId)
    if (c) return { classificacao: c, origem: 'documento', pendente: false }
  }
  for (const p of pastasAncestrais) {
    if (!p.classificacaoId) continue
    const c = porId.get(p.classificacaoId)
    if (c) return { classificacao: c, origem: `pasta:${p.id}`, pendente: false }
  }
  if (fallbackLegado) return { classificacao: fallbackLegado, origem: 'legado', pendente: false }
  return { classificacao: null, origem: 'nenhuma', pendente: true }
}
