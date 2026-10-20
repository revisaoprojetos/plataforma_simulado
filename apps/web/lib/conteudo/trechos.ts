// Extração de TRECHOS estruturados a partir de HTML (Fase 2). PURO (sem IO/server-only): roda no
// worker, no servidor e em teste/node. O HTML vem do OnlyOffice (export) ou do conteúdo de leitura.
// Cada bloco (parágrafo/título/célula/item) vira um trecho na ORDEM do documento, com tipo/rótulo
// inferidos do padrão jurídico — é a entrada do alinhamento de uid (ver alinhamento.ts).

export interface TrechoExtraido {
  ordem: number
  tipo: 'titulo' | 'capitulo' | 'artigo' | 'paragrafo' | 'inciso' | 'alinea' | 'texto'
  rotulo: string | null // "Art. 5º", "§ 1º", "II", "a)"
  texto: string
  hashTexto: string
}

const BLOCOS = /<(h[1-6]|p|li|blockquote|pre|td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi
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

const RE_ARTIGO = /^Art(?:igo)?\.?\s*\d+/i
const RE_PARAGRAFO = /^(§+\s*\d*|Par[áa]grafo\s+[úu]nico)/i
const RE_INCISO = /^[IVXLCDM]+\s*[-–.)]/
const RE_ALINEA = /^[a-z]\s*\)/

/** Infere tipo + rótulo pelo começo do texto e pela tag do bloco. */
function classificar(tag: string, texto: string): { tipo: TrechoExtraido['tipo']; rotulo: string | null } {
  const t = tag.toLowerCase()
  if (/^h1$/.test(t)) return { tipo: 'titulo', rotulo: null }
  if (/^h2$/.test(t)) return { tipo: 'capitulo', rotulo: null }
  if (RE_ARTIGO.test(texto)) return { tipo: 'artigo', rotulo: (texto.match(RE_ARTIGO) || [])[0]?.trim() ?? null }
  if (RE_PARAGRAFO.test(texto)) return { tipo: 'paragrafo', rotulo: (texto.match(RE_PARAGRAFO) || [])[0]?.trim() ?? null }
  if (RE_INCISO.test(texto)) return { tipo: 'inciso', rotulo: (texto.match(RE_INCISO) || [])[0]?.replace(/[-–.)]\s*$/, '').trim() ?? null }
  if (RE_ALINEA.test(texto)) return { tipo: 'alinea', rotulo: (texto.match(RE_ALINEA) || [])[0]?.trim() ?? null }
  if (/^h[3-6]$/.test(t)) return { tipo: 'titulo', rotulo: null }
  return { tipo: 'paragrafo', rotulo: null }
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
