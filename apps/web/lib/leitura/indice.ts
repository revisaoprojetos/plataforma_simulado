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

/** Tipos de dispositivo PRESENTES no HTML, em ordem de hierarquia (client-side; usa DOMParser). */
export function tiposPresentesNoHtml(html: string): string[] {
  if (typeof window === 'undefined' || !html) return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const presentes = new Set<string>()
  for (const el of Array.from(doc.querySelectorAll('[data-disp]'))) presentes.add(el.getAttribute('data-disp-tipo') || 'artigo')
  if (!presentes.size && doc.querySelector('[data-art]')) presentes.add('artigo') // conteúdo antigo sem data-disp
  return TIPOS_INDICE.filter((t) => presentes.has(t.tipo)).map((t) => t.tipo)
}

/** Normaliza a config vinda do banco (array de tipos válidos) ou o padrão. */
export function normalizarTiposIndice(bruto: unknown): string[] {
  if (!Array.isArray(bruto)) return [...TIPOS_INDICE_PADRAO]
  const validos = new Set(TIPOS_INDICE.map((t) => t.tipo))
  const out = bruto.filter((t): t is string => typeof t === 'string' && validos.has(t))
  return out.length ? out : [...TIPOS_INDICE_PADRAO]
}

/**
 * Agrupa as seções em capítulo → itens (mesma UX expansível): um grupo começa em cada CAPÍTULO
 * (se 'capitulo' estiver selecionado); os demais tipos selecionados entram como itens do grupo
 * corrente (indentados por nível). Itens antes de qualquer capítulo formam um grupo sem cabeçalho.
 * Genérico no tipo do item (só precisa de `.tipo`).
 */
export function montarGruposToc<T extends { tipo: string }>(secoes: T[], tipos: string[]): { cap: T | null; itens: T[] }[] {
  const set = new Set(tipos.length ? tipos : TIPOS_INDICE_PADRAO)
  const usarCap = set.has('capitulo')
  const grupos: { cap: T | null; itens: T[] }[] = []
  let atual: { cap: T | null; itens: T[] } | null = null
  for (const s of secoes) {
    if (!set.has(s.tipo)) continue
    if (usarCap && s.tipo === 'capitulo') { atual = { cap: s, itens: [] }; grupos.push(atual) }
    else { if (!atual) { atual = { cap: null, itens: [] }; grupos.push(atual) } atual.itens.push(s) }
  }
  return grupos
}
