import { parse, NodeType } from 'node-html-parser'

// Sanitizador ÚNICO de HTML na LEITURA (defesa em profundidade; achado manual-20261113:dangerous-html-leitor).
//
// O HTML de documentos (html_rico / simulado_documento_conteudos.html) chega de import (.docx, .html cru, editor)
// e já é sanitizado na gravação por lib/leitura/sanitize.ts. Aqui reaplicamos um allowlist na SAÍDA, no
// servidor e ANTES de cachear, para que um HTML legado/importado sem sanitização nunca chegue ao
// dangerouslySetInnerHTML do leitor. Reescreve por SERIALIZAÇÃO (texto sempre escapado, atributos sempre
// entre aspas) — não há mXSS por reparse. Idempotente.
//
// PRESERVA o que o leitor precisa: class/id, QUALQUER data-* (data-uid de trecho/grifo, data-art, data-disp,
// data-grifo, data-caixa, data-n, data-selo…), tabelas, <details>/<summary> (caixas colapsáveis STF/STJ),
// <mark>/<span> de grifo, imagens (https e data:image base64) e um subconjunto seguro de style inline.
// Comentários HTML são descartados (o marcador lpN é lido ANTES de sanitizar). NÃO usar em HTML gerado pelo
// servidor com <style>/<svg> (áreas de visibilidade, seções expansivas): sanitize o HTML do banco, depois decore.

const ALLOW_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'div', 'span', 'section', 'article', 'header', 'footer', 'aside', 'nav', 'main',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'pre', 'code', 'address',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'sup', 'sub', 'mark', 'small', 'abbr', 'cite', 'q', 'kbd', 'samp', 'var', 'time', 'wbr',
  'a', 'img', 'figure', 'figcaption', 'details', 'summary',
])
const REMOVE_TAGS = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input', 'button', 'select',
  'textarea', 'option', 'optgroup', 'link', 'meta', 'base', 'head', 'title', 'noscript', 'svg', 'math', 'video', 'audio',
  'source', 'track', 'canvas', 'template', 'dialog', 'portal', 'slot', 'xml', 'noembed', 'noframes',
])
const VOID_TAGS = new Set(['br', 'hr', 'img', 'col', 'wbr'])

const ATTR_GLOBAIS = new Set(['class', 'id', 'title', 'lang', 'dir', 'align', 'valign'])
const ATTR_POR_TAG: Record<string, Set<string>> = {
  a: new Set(['href', 'name']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan', 'width', 'height', 'headers', 'scope']),
  th: new Set(['colspan', 'rowspan', 'width', 'height', 'headers', 'scope']),
  col: new Set(['span', 'width']),
  colgroup: new Set(['span']),
  ol: new Set(['start', 'type', 'reversed']),
  li: new Set(['value']),
  details: new Set(['open']),
  time: new Set(['datetime']),
  table: new Set(['width', 'border', 'cellpadding', 'cellspacing']),
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Remove caracteres de controle/espacos que navegadores ignoram dentro de "java\tscript:".
function normUrl(u: string): string {
  let o = ''
  for (const ch of String(u ?? '')) {
    const c = ch.charCodeAt(0)
    if (c <= 0x20 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) || c === 0x2028 || c === 0x2029 || c === 0xfeff) continue
    o += ch
  }
  return o
}
function hrefSeguro(url: string): string | null {
  const u = normUrl(url)
  if (!u) return null
  if (/^(https?:\/\/|mailto:|tel:)/i.test(u)) return (url ?? '').trim()
  if (u[0] === '#') return u
  return null
}
function srcSeguro(url: string): string | null {
  const u = normUrl(url)
  if (/^https?:\/\//i.test(u)) return (url ?? '').trim()
  if (/^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=]+$/i.test(u)) return u
  if (/^\/(?!\/)/.test(u)) return (url ?? '').trim() // caminho relativo ao próprio host
  return null
}

// style inline: subconjunto de propriedades + valores sem nada executável/externo.
const PROPS_STYLE = new Set([
  'color', 'background', 'background-color', 'text-align', 'font-weight', 'font-style', 'font-size', 'font-family',
  'text-decoration', 'text-indent', 'line-height', 'vertical-align', 'width', 'height', 'min-width', 'max-width',
  'margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom',
  'padding', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom',
  'border', 'border-top', 'border-bottom', 'border-left', 'border-right', 'border-color', 'border-style', 'border-width', 'border-collapse',
  'list-style-type', 'white-space', 'text-transform', 'letter-spacing', '--marca-cor',
])
function valorStyleSeguro(v: string): boolean {
  const s = v.trim().toLowerCase()
  if (!s || s.length > 200) return false
  if (/url\(|expression|javascript:|vbscript:|@import|behavior|binding|[{}<>\\]|\/\*/.test(s)) return false
  return true
}
function styleSeguro(raw: string): string | null {
  const out: string[] = []
  for (const decl of (raw ?? '').split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const prop = decl.slice(0, i).trim().toLowerCase()
    const val = decl.slice(i + 1).trim()
    if (PROPS_STYLE.has(prop) && valorStyleSeguro(val)) out.push(prop + ':' + val)
  }
  return out.length ? out.join(';') : null
}

function attrsSeguros(tag: string, el: any): string {
  const porTag = ATTR_POR_TAG[tag]
  const out: string[] = []
  for (const [nome, valorRaw] of Object.entries(el.attributes as Record<string, string>)) {
    const n = nome.toLowerCase()
    if (n.startsWith('on')) continue
    const valor0 = valorRaw ?? ''
    if (n === 'style') { const s = styleSeguro(valor0); if (s) out.push('style="' + esc(s) + '"'); continue }
    const ehData = /^data-[a-z0-9_-]{1,40}$/.test(n)
    if (!ehData && !ATTR_GLOBAIS.has(n) && !porTag?.has(n)) continue
    let valor = valor0
    if (n === 'href') { const h = hrefSeguro(valor); if (!h) continue; valor = h }
    else if (n === 'src') { const s = srcSeguro(valor); if (!s) continue; valor = s }
    else if (n === 'id' || n === 'name') { if (!/^[\w:.-]{1,200}$/.test(valor)) continue }
    out.push(n + '="' + esc(valor) + '"')
  }
  // links externos: sem vazar opener/referrer (o leitor não usa target)
  if (tag === 'a' && out.some((a) => a.startsWith('href="http'))) out.push('rel="noopener noreferrer nofollow"')
  return out.length ? ' ' + out.join(' ') : ''
}

function serialize(node: any): string {
  if (node.nodeType === NodeType.TEXT_NODE) return esc(node.text ?? '')
  if (node.nodeType !== NodeType.ELEMENT_NODE) return '' // comentários fora
  const tag = (node.tagName ?? '').toLowerCase()
  if (!tag) return node.childNodes.map(serialize).join('')
  if (REMOVE_TAGS.has(tag)) return ''
  const filhos = node.childNodes.map(serialize).join('')
  if (!ALLOW_TAGS.has(tag)) return filhos // unwrap: mantém o texto, descarta a tag
  if (VOID_TAGS.has(tag)) return '<' + tag + attrsSeguros(tag, node) + '>'
  return '<' + tag + attrsSeguros(tag, node) + '>' + filhos + '</' + tag + '>'
}

/** Sanitiza HTML de documento para renderização no leitor. Seguro para dangerouslySetInnerHTML. */
export function sanitizarHtmlLeitura(html: string | null | undefined): string {
  if (!html) return ''
  const limpo = html.replace(/<\?xml[^>]*\?>/gi, '').replace(/<!DOCTYPE[^>]*>/gi, '')
  // blockTextElements: padrão do parser mantém script/style/pre como bloco de texto cru; aqui descartamos script/style
  // pelo REMOVE_TAGS, e comentários nunca são mantidos.
  const root = parse(limpo, { comment: false, blockTextElements: { script: true, noscript: true, style: true } })
  return root.childNodes.map(serialize).join('')
}
