// Motor de anotação por TRECHO de texto (client-only; usa DOM, sem React).
//
// "Espinha" = concatenação, em ordem de documento, do texto de todos os text nodes
// do conteúdo. Uma anotação é ancorada por offset de caractere na espinha + um
// fallback text-quote (exact/prefix/suffix) para recolocar se o texto mudar.
// Os grifos são pintados como retângulos num OVERLAY (getClientRects) — o DOM do
// conteúdo NUNCA é mutado. Grifo que não ancora fica "órfão" (não pintado) mas NUNCA é apagado.

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

/** A espinha ainda reflete o DOM? Checagem COMPLETA (todos os nós conectados, dentro do root, com o
 * mesmo tamanho). Não detecta nó NOVO — por isso recomputarGrifos reconstrói sempre. */
export function espinhaConfere(esp: Espinha, root: HTMLElement): boolean {
  for (const e of esp.nodes) {
    if (!e.node.isConnected || !root.contains(e.node) || e.node.data.length !== e.end - e.start) return false
  }
  return true
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

// ── Normalização p/ o fallback de ancoragem (porte do recuperarNorm do leitor-jus.html) ──
// Casa o `exact` ignorando diferenças de whitespace/NBSP/aspas/travessões/zero-width. Mantém mapas
// índice-normalizado → índice-original p/ voltar à espinha real.
export interface TextoNorm { N: string; ini: number[]; fim: number[] }
const ZERO_W = /[\u200b-\u200d\u2060\ufeff\u00ad]/
const ESPACO = /[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/
export function normalizarComMapa(s: string): TextoNorm {
  const ini: number[] = [], fim: number[] = []
  let N = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (ZERO_W.test(c)) continue
    if (ESPACO.test(c)) {
      if (N.length && N[N.length - 1] === ' ') { fim[fim.length - 1] = i + 1; continue }
      N += ' '; ini.push(i); fim.push(i + 1); continue
    }
    let m = c
    if (c === '\u2018' || c === '\u2019' || c === '\u201a' || c === '\u2032' || c === '`' || c === '\u00b4') m = "'"
    else if (c === '\u201c' || c === '\u201d' || c === '\u201e' || c === '\u00ab' || c === '\u00bb' || c === '\u2033') m = '"'
    else if (c === '\u2013' || c === '\u2014' || c === '\u2212' || c === '\u2010' || c === '\u2011') m = '-'
    N += m; ini.push(i); fim.push(i + 1)
  }
  return { N, ini, fim }
}

function todosIndices(S: string, x: string): number[] {
  const idxs: number[] = []
  let i = S.indexOf(x)
  while (i >= 0 && idxs.length < 200) { idxs.push(i); i = S.indexOf(x, i + 1) }
  return idxs
}

function melhorIndice(S: string, exactLen: number, idxs: number[], esperado: number, pos: (idx: number) => number, prefix: string, suffix: string): number {
  let best = idxs[0], bestScore = -Infinity
  const pTail = prefix.trimEnd().slice(-8), sHead = suffix.trimStart().slice(0, 8)
  for (const idx of idxs) {
    const pre = S.slice(Math.max(0, idx - prefix.length - 2), idx).trimEnd()
    const suf = S.slice(idx + exactLen, idx + exactLen + suffix.length + 2).trimStart()
    let score = 0
    if (pTail && pre.endsWith(pTail)) score += 2
    if (sHead && suf.startsWith(sHead)) score += 2
    score -= Math.abs(pos(idx) - esperado) / 1000
    if (score > bestScore) { bestScore = score; best = idx }
  }
  return best
}

/** Recuperação text-quote: acha o exact mais próximo do esperado (desempata por prefix/suffix).
 * 1º exato; se falhar, casa com whitespace/NBSP/aspas normalizados. null = órfão (o grifo NUNCA é apagado). */
export function recuperarTrecho(S: string, a: AncoraTexto): { inicio: number; fim: number } | null {
  if (!a.exact || !a.exact.trim()) return null
  const idxs = todosIndices(S, a.exact)
  if (idxs.length) {
    const best = melhorIndice(S, a.exact.length, idxs, a.inicio, (i) => i, a.prefix, a.suffix)
    return { inicio: best, fim: best + a.exact.length }
  }
  // Fallback normalizado
  const nx = normalizarComMapa(a.exact).N.trim()
  if (!nx) return null
  const ns = normalizarComMapa(S)
  const nidxs = todosIndices(ns.N, nx)
  if (!nidxs.length) return null
  const np = normalizarComMapa(a.prefix).N, nsf = normalizarComMapa(a.suffix).N
  const best = melhorIndice(ns.N, nx.length, nidxs, a.inicio, (i) => ns.ini[i] ?? 0, np, nsf)
  const inicio = ns.ini[best], fim = ns.fim[best + nx.length - 1]
  if (inicio === undefined || fim === undefined || fim <= inicio) return null
  return { inicio, fim }
}

/** Converte uma âncora em Range no DOM atual (com recuperação se os offsets driftaram). null = órfão. */
export function ancoraParaRange(esp: Espinha, a: AncoraTexto): Range | null {
  let { inicio, fim } = a
  if (esp.S.slice(inicio, fim) !== a.exact) {
    const rec = recuperarTrecho(esp.S, a)
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

// ── Retângulos ──
export interface Box { left: number; top: number; right: number; bottom: number }
/** Interseção de dois boxes; null se vazia. clip=null → sem recorte. */
export function interseccionar(a: Box, clip: Box | null): Box | null {
  if (!clip) return a
  const l = Math.max(a.left, clip.left), t = Math.max(a.top, clip.top)
  const r = Math.min(a.right, clip.right), b = Math.min(a.bottom, clip.bottom)
  return r - l > 0.5 && b - t > 0.5 ? { left: l, top: t, right: r, bottom: b } : null
}
/** Um trecho de texto a medir (um text node, já recortado ao range). Funções lazy p/ não custar à toa. */
export interface TrechoMedir { texto: string; fechado: () => boolean; medir: () => Box[]; clip: () => Box | null }
/** Núcleo puro: rects por text node → ignora só-espaço, caixa recolhida e recorta pelo overflow:hidden. */
export function rectsDeTrechos(trechos: TrechoMedir[], base: { left: number; top: number }): RectRel[] {
  const out: RectRel[] = []
  for (const t of trechos) {
    if (!/\S/.test(t.texto)) continue
    if (t.fechado()) continue
    const clip = t.clip()
    for (const b of t.medir()) {
      const c = interseccionar(b, clip)
      if (c) out.push({ left: c.left - base.left, top: c.top - base.top, width: c.right - c.left, height: c.bottom - c.top })
    }
  }
  return out
}

/** Caixa colapsável FECHADA acima do elemento? (texto no corpo recolhido continua com layout.) */
export function dentroDeCaixaFechada(el: Element | null, limite: Element | null): boolean {
  for (let e: Element | null = el; e && e !== limite; e = e.parentElement) {
    if (e.classList?.contains('caixa-corpo')) {
      const box = e.parentElement
      if (box?.classList.contains('caixa-colapsavel') && !box.hasAttribute('data-aberto')) {
        // "Já cobrado": também abre no :hover (CSS) → não conta como fechada enquanto o mouse está sobre ela.
        if (box.getAttribute('data-caixa') === 'cobrado' && box.matches(':hover')) continue
        return true
      }
    }
  }
  return false
}

/** Box de recorte acumulado dos ancestrais com overflow != visible (até `limite`, exclusive). Cacheável. */
function clipDoElemento(el: Element | null, limite: Element | null, cache?: Map<Element, Box | null>): Box | null {
  if (!el || el === limite) return null
  if (cache?.has(el)) return cache.get(el) ?? null
  const pai = clipDoElemento(el.parentElement, limite, cache)
  let cs: CSSStyleDeclaration | null = null
  try { cs = getComputedStyle(el) } catch { /* ok */ }
  let res: Box | null = pai
  if (cs) {
    const cx = cs.overflowX !== 'visible', cy = cs.overflowY !== 'visible'
    if (cx || cy) {
      const r = el.getBoundingClientRect()
      const mine: Box = { left: cx ? r.left : -Infinity, right: cx ? r.right : Infinity, top: cy ? r.top : -Infinity, bottom: cy ? r.bottom : Infinity }
      res = pai ? { left: Math.max(pai.left, mine.left), right: Math.min(pai.right, mine.right), top: Math.max(pai.top, mine.top), bottom: Math.min(pai.bottom, mine.bottom) } : mine
    }
  }
  cache?.set(el, res)
  return res
}

export interface RectsOpts { limite?: Element | null; cache?: Map<Element, Box | null> }

/**
 * Retângulos do range relativos a `base` (bounding rect do overlay). Medidos POR TEXT NODE (sub-range):
 * `range.getClientRects()` de um range que cruza blocos devolve também a caixa inteira dos elementos
 * contidos (p vazio, table, img, wrappers) → faixas sem texto. Ignora nós só-espaço, texto em caixa
 * colapsável fechada e recorta pelo overflow:hidden dos ancestrais (não passa do `limite`: o scroller/
 * viewport NÃO recorta, senão perderia as páginas fora da tela).
 */
export function rectsDoRange(range: Range, base: DOMRect, opts: RectsOpts = {}): RectRel[] {
  const ca = range.commonAncestorContainer
  const limite = opts.limite ?? (ca.nodeType === 3 ? ca.parentElement : (ca as Element))?.closest?.('.leitura-prosa') ?? null
  const nos: Text[] = []
  if (ca.nodeType === 3) nos.push(ca as Text)
  else {
    const w = document.createTreeWalker(ca, NodeFilter.SHOW_TEXT)
    let n: Node | null
    while ((n = w.nextNode())) { if (range.intersectsNode(n)) nos.push(n as Text) }
  }
  const trechos: TrechoMedir[] = []
  for (const t of nos) {
    const ini = t === range.startContainer ? range.startOffset : 0
    const fim = t === range.endContainer ? range.endOffset : t.data.length
    if (fim <= ini) continue
    const pai = t.parentElement
    if (pai?.closest('[data-leitura-q]')) continue // questão injetada: fora da espinha
    trechos.push({
      texto: t.data.slice(ini, fim),
      fechado: () => dentroDeCaixaFechada(pai, limite),
      clip: () => clipDoElemento(pai, limite, opts.cache),
      medir: () => {
        const sub = document.createRange()
        try { sub.setStart(t, ini); sub.setEnd(t, fim) } catch { return [] }
        return Array.from(sub.getClientRects()).filter((r) => r.width > 0 && r.height > 0)
          .map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }))
      },
    })
  }
  return rectsDeTrechos(trechos, base)
}
