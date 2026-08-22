// Motor de anotação por TRECHO de texto (client-only; usa DOM, sem React).
//
// "Espinha" = concatenação, em ordem de documento, do texto de todos os text nodes
// do conteúdo. Uma anotação é ancorada por offset de caractere na espinha + um
// fallback text-quote (exact/prefix/suffix) para recolocar se o texto mudar.
// Os grifos são pintados como retângulos num OVERLAY (getClientRects) — o DOM do
// conteúdo NUNCA é mutado, então os offsets nunca se invalidam.

export interface EspinhaNode { node: Text; start: number; end: number }
export interface Espinha { S: string; nodes: EspinhaNode[] }
export interface AncoraTexto { inicio: number; fim: number; exact: string; prefix: string; suffix: string }
export interface RectRel { left: number; top: number; width: number; height: number }

const CTX = 32 // tamanho do contexto (prefix/suffix) guardado p/ recuperação

/**
 * Constrói a espinha (S + posições de cada text node) do conteúdo. IGNORA o texto de
 * questões injetadas ([data-leitura-q]) — assim os offsets das anotações não mudam
 * quando o leitor insere questões entre os artigos.
 */
export function construirEspinha(root: HTMLElement): Espinha {
  const nodes: EspinhaNode[] = []
  let S = ''
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      let el: Element | null = (n as Text).parentElement
      while (el && el !== root) { if (el.hasAttribute('data-leitura-q')) return NodeFilter.FILTER_REJECT; el = el.parentElement }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let n: Node | null
  while ((n = walker.nextNode())) {
    const t = n as Text
    const txt = t.data
    if (!txt) continue
    nodes.push({ node: t, start: S.length, end: S.length + txt.length })
    S += txt
  }
  return { S, nodes }
}

/** Posição na espinha de um boundary (container, offset). Consistente com construirEspinha
 * (não conta o texto das questões injetadas). */
function posNaEspinha(esp: Espinha, container: Node, offset: number): number {
  if (container.nodeType === 3) {
    const e = esp.nodes.find((x) => x.node === container)
    return e ? e.start + offset : -1
  }
  const el = container as Element
  const ref = el.childNodes[offset] ?? null
  if (ref === null) {
    let last = -1
    for (const x of esp.nodes) if (el.contains(x.node)) last = x.end
    return last >= 0 ? last : esp.S.length
  }
  for (const x of esp.nodes) {
    if (ref === (x.node as Node) || (ref as Element).contains?.(x.node)) return x.start
    if (ref.compareDocumentPosition(x.node) & Node.DOCUMENT_POSITION_FOLLOWING) return x.start
  }
  return esp.S.length
}

/** Converte uma seleção (Range) em âncora de texto. null se vazia/inválida. */
export function rangeParaAncora(_root: HTMLElement, esp: Espinha, range: Range): AncoraTexto | null {
  const inicio = posNaEspinha(esp, range.startContainer, range.startOffset)
  const fim = posNaEspinha(esp, range.endContainer, range.endOffset)
  if (inicio < 0 || fim < 0 || fim <= inicio) return null
  return {
    inicio, fim,
    exact: esp.S.slice(inicio, fim),
    prefix: esp.S.slice(Math.max(0, inicio - CTX), inicio),
    suffix: esp.S.slice(fim, fim + CTX),
  }
}

/** Acha o text node + offset local para uma posição global. */
function localizar(esp: Espinha, pos: number): { node: Text; offset: number } | null {
  for (const e of esp.nodes) {
    if (pos >= e.start && pos <= e.end) return { node: e.node, offset: pos - e.start }
  }
  return null
}

/** Recuperação text-quote: acha o exact mais próximo do esperado (desempata por prefix/suffix). */
function recuperar(S: string, a: AncoraTexto): { inicio: number; fim: number } | null {
  if (!a.exact) return null
  const idxs: number[] = []
  let i = S.indexOf(a.exact)
  while (i >= 0 && idxs.length < 200) { idxs.push(i); i = S.indexOf(a.exact, i + 1) }
  if (!idxs.length) return null
  let best = idxs[0], bestScore = -Infinity
  for (const idx of idxs) {
    const pre = S.slice(Math.max(0, idx - a.prefix.length), idx)
    const suf = S.slice(idx + a.exact.length, idx + a.exact.length + a.suffix.length)
    let score = 0
    if (a.prefix && pre.endsWith(a.prefix.slice(-8))) score += 2
    if (a.suffix && suf.startsWith(a.suffix.slice(0, 8))) score += 2
    score -= Math.abs(idx - a.inicio) / 1000
    if (score > bestScore) { bestScore = score; best = idx }
  }
  return { inicio: best, fim: best + a.exact.length }
}

/** Converte uma âncora em Range no DOM atual (com recuperação se os offsets driftaram). */
export function ancoraParaRange(esp: Espinha, a: AncoraTexto): Range | null {
  let { inicio, fim } = a
  if (esp.S.slice(inicio, fim) !== a.exact) {
    const rec = recuperar(esp.S, a)
    if (!rec) return null
    inicio = rec.inicio; fim = rec.fim
  }
  const ini = localizar(esp, inicio)
  const end = localizar(esp, fim)
  if (!ini || !end) return null
  const r = document.createRange()
  try { r.setStart(ini.node, ini.offset); r.setEnd(end.node, end.offset) } catch { return null }
  return r
}

/** Retângulos do range relativos a `base` (bounding rect do overlay). Um por linha. */
export function rectsDoRange(range: Range, base: DOMRect): RectRel[] {
  return Array.from(range.getClientRects())
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({ left: r.left - base.left, top: r.top - base.top, width: r.width, height: r.height }))
}
