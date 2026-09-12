/**
 * Índice CONFIGURÁVEL do conteúdo de leitura. O admin escolhe QUAIS tipos de dispositivo aparecem
 * no índice (Títulos, Capítulos, Artigos, §, Incisos, Alíneas…). O sistema detecta os tipos que
 * REALMENTE existem no arquivo (data-disp-tipo) e mostra só esses; os selecionados aparecem no índice
 * do admin (prévia) e do aluno, respeitando a hierarquia (nível).
 *
 * Persistência sem migração: guardado em `simulado_documentos.quiz_config.indice_tipos` (jsonb já
 * existente). Vazio/ausente = padrão (capítulos + artigos, o comportamento anterior).
 */
export const TIPOS_INDICE: { tipo: string; label: string; nivel: number }[] = [
  { tipo: 'livro', label: 'Livros', nivel: 0 },
  { tipo: 'parte', label: 'Partes', nivel: 0 },
  { tipo: 'titulo', label: 'Títulos', nivel: 0 },
  { tipo: 'capitulo', label: 'Capítulos', nivel: 0 },
  { tipo: 'secao', label: 'Seções', nivel: 0 },
  { tipo: 'subsecao', label: 'Subseções', nivel: 0 },
  { tipo: 'artigo', label: 'Artigos (Art.)', nivel: 1 },
  { tipo: 'paragrafo', label: 'Parágrafos (§)', nivel: 2 },
  { tipo: 'inciso', label: 'Incisos (I, II, III)', nivel: 3 },
  { tipo: 'alinea', label: 'Alíneas (a, b, c)', nivel: 4 },
  { tipo: 'item', label: 'Itens', nivel: 4 },
]
export const NIVEL_TIPO: Record<string, number> = Object.fromEntries(TIPOS_INDICE.map((t) => [t.tipo, t.nivel]))
export const LABEL_TIPO: Record<string, string> = Object.fromEntries(TIPOS_INDICE.map((t) => [t.tipo, t.label]))
/** Padrão (retrocompat): capítulos como grupo + artigos. */
export const TIPOS_INDICE_PADRAO = ['capitulo', 'artigo']

/** Quantidade de cada tipo de dispositivo no HTML (client-side; usa DOMParser). */
export function contarTiposNoHtml(html: string): Record<string, number> {
  if (typeof window === 'undefined' || !html) return {}
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const counts: Record<string, number> = {}
  for (const el of Array.from(doc.querySelectorAll('[data-disp]'))) {
    const t = el.getAttribute('data-disp-tipo') || 'artigo'
    counts[t] = (counts[t] ?? 0) + 1
  }
  if (!Object.keys(counts).length) { const n = doc.querySelectorAll('[data-art]').length; if (n) counts.artigo = n } // conteúdo antigo
  return counts
}

/** Tipos de dispositivo PRESENTES no HTML, em ordem de hierarquia. */
export function tiposPresentesNoHtml(html: string): string[] {
  const c = contarTiposNoHtml(html)
  return TIPOS_INDICE.filter((t) => (c[t.tipo] ?? 0) > 0).map((t) => t.tipo)
}

/** Normaliza a config vinda do banco (array de tipos válidos) ou o padrão. */
export function normalizarTiposIndice(bruto: unknown): string[] {
  if (!Array.isArray(bruto)) return [...TIPOS_INDICE_PADRAO]
  const validos = new Set(TIPOS_INDICE.map((t) => t.tipo))
  const out = bruto.filter((t): t is string => typeof t === 'string' && validos.has(t))
  return out.length ? out : [...TIPOS_INDICE_PADRAO]
}

export type NoToc<T> = { item: T; filhos: NoToc<T>[] }

/**
 * Monta a ÁRVORE do índice (aninhada por nível) a partir das seções filtradas pelos tipos escolhidos.
 * Cada item vira filho do último item de nível MENOR (ex.: TÍTULO → Art. → inciso). Qualquer nó com
 * filhos é recolhível no render. Genérico no tipo do item (usa `.nivel`, ou deriva de `.tipo`).
 */
export function montarArvoreToc<T extends { tipo: string; nivel?: number }>(secoes: T[], tipos: string[]): NoToc<T>[] {
  const set = new Set(tipos.length ? tipos : TIPOS_INDICE_PADRAO)
  const nivel = (s: T) => (typeof s.nivel === 'number' ? s.nivel : (NIVEL_TIPO[s.tipo] ?? 1))
  const roots: NoToc<T>[] = []
  const pilha: NoToc<T>[] = []
  for (const s of secoes) {
    if (!set.has(s.tipo)) continue
    const no: NoToc<T> = { item: s, filhos: [] }
    while (pilha.length && nivel(pilha[pilha.length - 1].item) >= nivel(s)) pilha.pop()
    if (pilha.length) pilha[pilha.length - 1].filhos.push(no); else roots.push(no)
    pilha.push(no)
  }
  return roots
}
