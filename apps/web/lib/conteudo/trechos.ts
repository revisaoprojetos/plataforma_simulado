// Extração de TRECHOS estruturados a partir de HTML (Fase 2). PURO (sem IO/server-only): roda no
// worker, no servidor e em teste/node. O HTML vem do OnlyOffice (export) ou do conteúdo de leitura.
// Cada bloco (parágrafo/título/célula/item) vira um trecho na ORDEM do documento, com tipo/rótulo
// inferidos do padrão jurídico — é a entrada do alinhamento de uid (ver alinhamento.ts).

export interface TrechoExtraido {
  ordem: number
  tipo: 'livro' | 'parte' | 'titulo' | 'capitulo' | 'secao' | 'subsecao' | 'artigo' | 'paragrafo' | 'inciso' | 'alinea' | 'item' | 'texto'
  rotulo: string | null // "Art. 5º", "§ 1º", "II", "a)"
  texto: string
  hashTexto: string
}

import { classificarDispositivo } from './dispositivos'

const BLOCOS =/<(h[1-6]|p|li|blockquote|pre|td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi
// Containers que apenas embrulham blocos — removidos (unwrap) para não engolir os filhos.
const CONTAINERS = /<\/?(div|section|article|main|header|footer|span|font|a)\b[^>]*>/gi
const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', sect: '§', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', atilde: 'ã', otilde: 'õ', ccedil: 'ç', agrave: 'à', acirc: 'â', ecirc: 'ê', ocirc: 'ô' }

const cp = (n: number): string => (Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '�')
function decodificar(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => cp(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => cp(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n] ?? ENTIDADES[String(n).toLowerCase()] ?? m)
}

/** Remove tags, decodifica entidades e colapsa espaços — texto puro do bloco. */
function textoDoBloco(html: string): string {
  const semTag = html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
  return decodificar(semTag).replace(/\s+/g, ' ').trim()
}

/** Hash estável (djb2) do texto normalizado — usado como hash_texto na reconciliação. */
export function hashTexto(texto: string): string {
  const s = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}

/**
 * Infere tipo + rótulo do bloco via a função ÚNICA `classificarDispositivo` (dispositivos.ts).
 * Só muda `tipo`/`rotulo` — NUNCA a sequência/filtro de blocos (o uid dos trechos depende dela).
 * Legado preservado: heading sem rótulo reconhecível → h1 'titulo', h2 'capitulo', h3–h6 'titulo';
 * bloco que não é dispositivo (inclui citação e td/th) → 'paragrafo'.
 */
function classificar(tag: string, texto: string): { tipo: TrechoExtraido['tipo']; rotulo: string | null } {
  const t = tag.toLowerCase()
  const c = classificarDispositivo(t, texto)
  if (c.via === 'tag') return { tipo: t === 'h2' ? 'capitulo' : 'titulo', rotulo: null }
  if (c.tipo === 'texto') return { tipo: 'paragrafo', rotulo: null }
  return { tipo: c.tipo, rotulo: c.rotulo }
}

/**
 * HTML RICO para a leitura: mantém a formatação original (negrito, itálico, cores, imagens, links) e
 * envolve CADA bloco não-vazio com `data-uid="<uid>"` — a âncora estável do grifo. Usa a MESMA sequência
 * e filtro de `extrairTrechosHtml` (blocos com texto < 2 são pulados), então os uids casam 1:1 com os
 * trechos. NÃO remove containers/spans (ao contrário de extrairTrechosHtml) para preservar a fidelidade.
 */
export function injetarUidsNoHtml(html: string, uids: string[]): string {
  const limpo = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, '')
  let i = 0
  BLOCOS.lastIndex = 0
  return limpo.replace(BLOCOS, (full: string, _tag: string, inner: string) => {
    const texto = textoDoBloco(inner)
    if (!texto || texto.length < 2) return full // pulado (igual a extrairTrechosHtml) → fica sem uid
    const uid = uids[i++]
    if (!uid) return full
    // injeta data-uid na tag de abertura do bloco (preserva atributos existentes)
    return full.replace(/^<([a-z0-9]+)\b/i, (_m: string, t: string) => `<${t} data-uid="${uid}"`)
  })
}

/** Extrai os trechos do HTML na ordem do documento. Ignora blocos vazios e <div> que só embrulham. */
export function extrairTrechosHtml(html: string): TrechoExtraido[] {
  const limpo = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, '')
    .replace(CONTAINERS, ' ')
  const out: TrechoExtraido[] = []
  let m: RegExpExecArray | null
  BLOCOS.lastIndex = 0
  while ((m = BLOCOS.exec(limpo))) {
    const tag = m[1]
    const texto = textoDoBloco(m[2])
    if (!texto || texto.length < 2) continue
    const { tipo, rotulo } = classificar(tag, texto)
    out.push({ ordem: out.length, tipo, rotulo, texto, hashTexto: hashTexto(texto) })
  }
  return out
}
