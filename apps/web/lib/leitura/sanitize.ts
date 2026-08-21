import 'server-only'
import { parse, NodeType } from 'node-html-parser'

// Sanitizador de HTML para a AREA DE LEITURA (server-only).
//
// O documento e enviado como HTML arbitrario (colar/enviar .html, importar Word,
// editor rico). Antes de guardar no banco, reescrevemos o HTML por SERIALIZACAO a
// partir de um allowlist (tags + atributos) - nada de script/style/on*/javascript
// sobrevive. Como so HTML ja sanitizado entra no banco, o leitor pode renderizar com
// dangerouslySetInnerHTML com seguranca.
//
// Tambem faz a AUTO-ANCORA de artigos/secoes: blocos que comecam com "Art. N" e os
// titulos (h1-h6) recebem id="art-K" + data-art="K" (K sequencial) -> alimentam o
// indice lateral, o virar-pagina e (fase 2) os pontos de inserir questao.

// Tags permitidas (estrutura de texto de lei/material). Demais tags viram "unwrap"
// (mantem o texto, descarta a tag). Tags perigosas somem com o conteudo (REMOVE).
const ALLOW_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'div', 'span', 'section', 'article',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub', 'mark', 'small',
  'a', 'img', 'figure', 'figcaption',
])
const REMOVE_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select',
  'textarea', 'option', 'link', 'meta', 'base', 'head', 'title', 'noscript', 'svg',
  'math', 'video', 'audio', 'canvas', 'template', 'dialog',
])
const VOID_TAGS = new Set(['br', 'hr', 'img', 'col'])
// Atributos permitidos por tag (o resto e descartado - inclusive todo on*).
const ALLOW_ATTR: Record<string, Set<string>> = {
  '*': new Set(['class', 'id', 'data-art', 'data-secao']),
  a: new Set(['href', 'title']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
  ol: new Set(['start', 'type']),
  col: new Set(['span']),
}

function hrefSeguro(url: string): string | null {
  const u = (url ?? '').trim()
  return /^(https?:\/\/|mailto:)/i.test(u) ? u : null
}
function srcSeguro(url: string): string | null {
  const u = (url ?? '').trim()
  return /^https?:\/\//i.test(u) ? u : null
}
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Atributos sanitizados de um elemento allowlist, como string.
function attrsSeguros(tag: string, el: any): string {
  const permitidos = ALLOW_ATTR[tag] ?? ALLOW_ATTR['*']
  const globais = ALLOW_ATTR['*']
  const out: string[] = []
  for (const [nome, valorRaw] of Object.entries(el.attributes as Record<string, string>)) {
    const n = nome.toLowerCase()
    if (n.startsWith('on')) continue // handlers de evento
    if (!permitidos.has(n) && !globais.has(n)) continue
    let valor = valorRaw ?? ''
    if (n === 'href') { const h = hrefSeguro(valor); if (!h) continue; valor = h }
    else if (n === 'src') { const s = srcSeguro(valor); if (!s) continue; valor = s }
    out.push(n + '="' + esc(valor) + '"')
  }
  return out.length ? ' ' + out.join(' ') : ''
}

// Serializa recursivamente so o que e permitido (unwrap p/ tags neutras, drop p/ perigosas).
function serialize(node: any): string {
  if (node.nodeType === NodeType.TEXT_NODE) return esc(node.text ?? '')
  if (node.nodeType !== NodeType.ELEMENT_NODE) return '' // comentarios fora
  const el = node
  const tag = (el.tagName ?? '').toLowerCase()
  if (!tag) return el.childNodes.map(serialize).join('')
  if (REMOVE_TAGS.has(tag)) return ''
  const filhos = el.childNodes.map(serialize).join('')
  if (!ALLOW_TAGS.has(tag)) return filhos // unwrap: mantem o conteudo, descarta a tag
  if (VOID_TAGS.has(tag)) return '<' + tag + attrsSeguros(tag, el) + '>'
  return '<' + tag + attrsSeguros(tag, el) + '>' + filhos + '</' + tag + '>'
}

const RE_ARTIGO = /^\s*art(?:igo)?\.?\s*\d+/i
const TITULOS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6'])

// Marca artigos/secoes com id="art-K" + data-art="K" (K sequencial em ordem de
// documento). Candidatos: titulos (h1-h6) e blocos cujo texto comeca com "Art. N".
// Retorna a contagem. Idempotente (nao remarca quem ja tem data-art).
function ancorarArtigos(root: any): number {
  let k = 0
  for (const el of root.querySelectorAll('*')) {
    const tag = el.tagName
    if (!tag) continue
    const jaTem = el.getAttribute('data-art')
    if (jaTem) { k = Math.max(k, Number(jaTem) || k); continue }
    const ehTitulo = TITULOS.has(tag)
    const ehArtigo = (tag === 'P' || tag === 'DIV' || tag === 'LI' || tag === 'SECTION') && RE_ARTIGO.test(el.text || '')
    if (!ehTitulo && !ehArtigo) continue
    k += 1
    el.setAttribute('data-art', String(k))
    el.setAttribute('id', 'art-' + k)
  }
  return k
}

export interface HtmlSanitizado {
  html: string     // HTML seguro + ancoras de artigo
  texto: string    // espinha de texto (concatenacao dos text nodes) p/ hash de validacao
  artigos: number  // numero de artigos/secoes ancorados
}

// Sanitiza + ancora + extrai a espinha de texto. Entrada: HTML arbitrario.
export function sanitizarDocumento(htmlBruto: string): HtmlSanitizado {
  const root = parse(htmlBruto ?? '', { comment: false })
  const artigos = ancorarArtigos(root)
  const html = root.childNodes.map(serialize).join('').trim()
  // Espinha a partir do HTML JA sanitizado (mesma base que o cliente vai ler).
  const texto = parse(html).text.replace(/\s+/g, ' ').trim()
  return { html, texto, artigos }
}
