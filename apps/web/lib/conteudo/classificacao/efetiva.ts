// Classificação EFETIVA do documento (puro, sem I/O, sem imports de alias — roda também em node via strip-types).
// FONTE ÚNICA da herança de "tipo de material" (antes copiada em conteudo-banco, meta-extras-server, revisao/cronograma,
// resumo-cronogramas e tipos-conteudo-server). Regra de ouro: com `documentos.classificacao_id` NULL em todo lugar, a saída é
// IDÊNTICA à das cópias antigas. Quando o documento TEM classificação própria, ela VENCE a pasta.

/** Vocabulário antigo (os 6 tipos de sistema) — o que `simulado_pastas.cronograma_tipo_material` sempre guardou. */
export const VOCAB_MATERIAL: ReadonlySet<string> = new Set(['pdfull', 'pdfight', 'pdflash', 'legproc', 'jurisclub', 'questoes'])

/** Traduz o slug gravado (pasta ou classificação do doc) para o valor que o consumidor entende; null = "sem tipo, continue subindo". */
export type Traduzir = (slug: string) => string | null

export interface OpcoesTraducao {
  /** slugs de tipos personalizados que GERAM meta própria (viram `gx:<slug>`). Omitido = ninguém gera (modo 'meta'/'cru'). */
  geraMeta?: ReadonlySet<string> | ReadonlyMap<string, unknown>
  /** slug personalizado → slug equivalente do vocabulário antigo (pelo PAPEL). */
  compat?: ReadonlyMap<string, string>
}

/**
 * Tradução usada por conteudo-banco (Adaptativo): vocabulário → próprio slug; geraMeta → `gx:slug`; senão papel (compat) ou null.
 */
export function traducaoBanco(o: OpcoesTraducao): Traduzir {
  return (t) => (VOCAB_MATERIAL.has(t) ? t : o.geraMeta?.has(t) ? `gx:${t}` : (o.compat?.get(t) ?? null))
}

/** Tradução usada por meta-extras-server (conteúdo por meta): vocabulário → próprio slug; senão papel (compat) ou null. Sem gx. */
export function traducaoMeta(o: Pick<OpcoesTraducao, 'compat'>): Traduzir {
  return (t) => (VOCAB_MATERIAL.has(t) ? t : (o.compat?.get(t) ?? null))
}

/** Sem tradução (revisao/cronograma › materiaisApoio): o slug cru da pasta. Vazio = sem tipo. */
export const traducaoCrua: Traduzir = (t) => (t ? t : null)

export interface ArvorePastas {
  pai: ReadonlyMap<string, string | null>
  /** `cronograma_tipo_material` cru de cada pasta (null/'' = sem tipo). */
  slug: ReadonlyMap<string, string | null>
}

/**
 * Tipo herdado de UMA pasta: a pasta tipada mais próxima subindo por pai_id (memoizado, anti-ciclo). Reproduz exatamente o
 * `tipoHerdado` de conteudo-banco.ts (e, com `traduzir` adequado, o das demais cópias). `cache` compartilhável entre chamadas.
 */
export function tipoHerdadoDaPasta(
  pastaId: string,
  arvore: ArvorePastas,
  traduzir: Traduzir,
  cache: Map<string, string | null> = new Map(),
): string | null {
  const caminho: string[] = []
  let cur: string | null = pastaId
  let achado: string | null = null
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    if (cache.has(cur)) { achado = cache.get(cur)!; break }
    caminho.push(cur)
    const t = arvore.slug.get(cur)
    const tc = t ? traduzir(t) : null
    if (tc) { achado = tc; break }
    cur = arvore.pai.get(cur) ?? null
  }
  for (const c of caminho) cache.set(c, achado)
  return achado
}

export type OrigemEfetivaDoc = 'documento' | 'pasta' | 'legado' | 'nenhuma'

export interface EfetivaDoc {
  /** valor já traduzido (ex.: 'pdfull', 'legproc', 'gx:meu-tipo'); null = sem tipo e sem fallback. */
  tipo: string | null
  origem: OrigemEfetivaDoc
}

/**
 * Classificação efetiva de um documento.
 *  1. `docClassId` (classificacao_id do doc) existente no catálogo (`slugPorId`) e traduzível → VENCE a pasta.
 *  2. `pastaSlugHerdado` (de `tipoHerdadoDaPasta`, já traduzido).
 *  3. `fallbackLegado` (hoje 'pdfull'); omitido = null.
 * `docClassId` nulo/ausente do catálogo/não traduzível → cai no passo 2 (comportamento antigo).
 */
export function classificacaoEfetivaDoc(args: {
  docClassId?: string | null
  slugPorId?: ReadonlyMap<string, string> | null
  traduzir: Traduzir
  pastaSlugHerdado: string | null | undefined
  fallbackLegado?: string | null
}): EfetivaDoc {
  const { docClassId, slugPorId, traduzir, pastaSlugHerdado, fallbackLegado } = args
  if (docClassId && slugPorId) {
    const s = slugPorId.get(docClassId)
    const t = s ? traduzir(s) : null
    if (t) return { tipo: t, origem: 'documento' }
  }
  if (pastaSlugHerdado) return { tipo: pastaSlugHerdado, origem: 'pasta' }
  if (fallbackLegado) return { tipo: fallbackLegado, origem: 'legado' }
  return { tipo: null, origem: 'nenhuma' }
}
