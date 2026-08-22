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
  '*': new Set(['class', 'id', 'data-art', 'data-secao', 'data-disp', 'data-disp-tipo', 'data-grifo', 'data-grifo-label', 'data-grifo-estrutural']),
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

export interface Dispositivo { id_estavel: string; tipo: string; rotulo: string; caminho: string; ordem: number; texto: string }

// Slug curto de um texto (para id de titulo/capitulo/secao sem numero claro).
function slugCurto(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'sec'
}

const BLOCOS_DISP = 'p,div,li,section,blockquote,h1,h2,h3,h4,h5,h6'
const RE_ESTRUT = /^(t[íi]tulo|cap[íi]tulo|se[çc][ãa]o|livro|parte)\b/i

/**
 * Marca artigos/§/incisos/alíneas e títulos com id ESTÁVEL (derivado do rótulo, não
 * da posição) em `data-disp` + `data-disp-tipo`. Retorna a lista de dispositivos.
 */
function indexarDispositivos(root: any): Dispositivo[] {
  const disp: Dispositivo[] = []
  const usados = new Map<string, number>()
  const unico = (base: string) => { const n = (usados.get(base) ?? 0) + 1; usados.set(base, n); return n === 1 ? base : `${base}~${n}` }
  const ctx = { artigo: '', paragrafo: '', inciso: '' }
  let ordem = 0
  for (const el of root.querySelectorAll(BLOCOS_DISP)) {
    const tag = (el.tagName || '').toUpperCase()
    const txt = (el.text || '').replace(/\s+/g, ' ').trim()
    if (!txt || el.getAttribute('data-disp')) continue
    let tipo = '', id = '', rotulo = ''
    let m: RegExpMatchArray | null
    if (TITULOS.has(tag) || RE_ESTRUT.test(txt)) {
      tipo = 'secao'; rotulo = txt.slice(0, 60); id = unico('sec-' + slugCurto(txt)); ctx.artigo = ctx.paragrafo = ctx.inciso = ''
    } else if ((m = txt.match(/^art(?:igo)?\.?\s*(\d+)/i))) {
      tipo = 'artigo'; id = unico('art-' + m[1]); rotulo = 'Art. ' + m[1]; ctx.artigo = id; ctx.paragrafo = ''; ctx.inciso = ''
    } else if (/^par[áa]grafo\s+[úu]nico/i.test(txt)) {
      tipo = 'paragrafo'; id = unico((ctx.artigo || 'art') + '.par-unico'); rotulo = 'Parágrafo único'; ctx.paragrafo = id; ctx.inciso = ''
    } else if ((m = txt.match(/^§\s*(\d+)/))) {
      tipo = 'paragrafo'; id = unico((ctx.artigo || 'art') + '.par-' + m[1]); rotulo = '§ ' + m[1]; ctx.paragrafo = id; ctx.inciso = ''
    } else if ((m = txt.match(/^([IVXLCDM]{1,6})\s*[-–]/))) {
      tipo = 'inciso'; const parent = ctx.paragrafo || ctx.artigo || 'art'; id = unico(parent + '.inc-' + m[1].toLowerCase()); rotulo = m[1]; ctx.inciso = id
    } else if ((m = txt.match(/^([a-z])\s*\)/i))) {
      tipo = 'alinea'; const parent = ctx.inciso || ctx.paragrafo || ctx.artigo || 'art'; id = unico(parent + '.al-' + m[1].toLowerCase()); rotulo = m[1].toLowerCase() + ')'
    } else continue
    ordem += 1
    el.setAttribute('data-disp', id)
    el.setAttribute('data-disp-tipo', tipo)
    disp.push({ id_estavel: id, tipo, rotulo, caminho: id, ordem, texto: txt.slice(0, 4000) })
  }
  return disp
}

export interface HtmlSanitizado {
  html: string           // HTML seguro + ancoras de artigo + dispositivos
  texto: string          // espinha de texto (concatenacao dos text nodes)
  artigos: number        // numero de artigos/secoes ancorados (compat)
  dispositivos: Dispositivo[]
}

// Sanitiza + ancora (data-art) + indexa dispositivos (data-disp) + extrai a espinha.
export function sanitizarDocumento(htmlBruto: string): HtmlSanitizado {
  const root = parse(htmlBruto ?? '', { comment: false })
  const artigos = ancorarArtigos(root)
  const dispositivos = indexarDispositivos(root)
  const html = root.childNodes.map(serialize).join('').trim()
  const texto = parse(html).text.replace(/\s+/g, ' ').trim()
  return { html, texto, artigos, dispositivos }
}
