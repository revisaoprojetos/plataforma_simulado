/**
 * DOWNLOAD do documento da Biblioteca pelo aluno — regras PURAS (sem banco/storage), testáveis em node:
 *  · nome do arquivo (sanitização + Content-Disposition com filename* UTF-8, sem path traversal);
 *  · decisão capa / sem capa e quais tipos de documento são baixáveis;
 *  · montagem do PDF final com a CAPA como primeira folha (pdf-lib).
 */
import { PDFDocument } from 'pdf-lib'

/** Tipos de documento que o aluno consegue baixar por este caminho (PDF original; DOCX original ou convertido em PDF c/ capa). */
export function tipoBaixavel(tipoOrigem: unknown): tipoOrigem is 'pdf' | 'docx' {
  return tipoOrigem === 'pdf' || tipoOrigem === 'docx'
}

/**
 * Nome de arquivo seguro: título do documento, sem caracteres de caminho/controle, sem ponto inicial, ≤ 120 caracteres,
 * com a extensão correta (sem duplicar se o título já termina nela).
 */
export function sanitizarNomeArquivo(titulo: unknown, ext: string): string {
  const e = String(ext || '').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'pdf'
  let base = String(titulo ?? '').normalize('NFC')
  base = base.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ') // controle + bidi/zero-width
  base = base.replace(/[\\/:*?"<>|]+/g, ' - ') // separadores de caminho e reservados do Windows
  base = base.replace(/\.{2,}/g, '.').replace(/\s+/g, ' ').replace(/(\s-){2,}/g, ' -').trim()
  base = base.replace(/^[.\s-]+/, '').replace(/[.\s]+$/, '')
  const sufixo = new RegExp('\\.' + e + '$', 'i')
  base = base.replace(sufixo, '').trim()
  base = Array.from(base).slice(0, 120).join('').trim()
  if (!base || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base = 'Documento'
  return `${base}.${e}`
}

/** Content-Disposition attachment: `filename` ASCII (fallback) + `filename*` UTF-8 (RFC 5987/6266). */
export function contentDispositionAnexo(nome: string): string {
  const ascii = nome.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/["\\%;]/g, '_')
  const utf8 = encodeURIComponent(nome).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`
}

export const CONTENT_TYPE_POR_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export interface DecisaoDownload {
  /** formato do arquivo entregue */
  formato: 'pdf' | 'docx'
  /** true = PDF final com a capa na frente (exige PDF-base; para DOCX significa converter) */
  comCapa: boolean
  /** páginas iniciais do PDF-base a descartar (página inicial da Biblioteca) — só quando há capa */
  descartarAntes: number
}

/**
 * Capa cadastrada (do documento OU da pasta em modo lote) → PDF com a capa como 1ª folha, trocando as páginas "ocultas"
 * pela Biblioteca (página inicial N ⇒ páginas 1..N-1 não existem para o aluno; a capa as substitui, sem duplicar).
 * Sem capa → documento original, sem alteração (formato = tipo de origem).
 */
export function decidirDownload(tipoOrigem: 'pdf' | 'docx', capaUrl: string | null | undefined, paginaInicial: number | null | undefined): DecisaoDownload {
  const temCapa = typeof capaUrl === 'string' && capaUrl.trim().length > 0
  if (!temCapa) return { formato: tipoOrigem, comCapa: false, descartarAntes: 0 }
  const pi = typeof paginaInicial === 'number' && Number.isFinite(paginaInicial) && paginaInicial > 1 ? Math.trunc(paginaInicial) : 1
  return { formato: 'pdf', comCapa: true, descartarAntes: pi - 1 }
}

export type TipoCapa = 'png' | 'jpg' | 'pdf'

/** Identifica a capa pelos magic bytes (nunca pelo Content-Type/URL). */
export function detectarTipoCapa(b: Uint8Array): TipoCapa | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b.length > 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf'
  return null
}

/** Host proibido para buscar a capa no servidor (anti-SSRF: loopback, rede privada, link-local, nomes internos). */
export function hostInternoProibido(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
  }
  if (h.includes(':')) return h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:')
  return !h.includes('.') // nome sem ponto = host interno (ex.: "minio", "api")
}

const A4: [number, number] = [595.28, 841.89]

/**
 * Devolve o PDF com a CAPA como primeira folha (+ o documento). Imagem → página do mesmo tamanho da 1ª página do documento,
 * imagem inteira (sem cortar) centralizada; capa em PDF → suas páginas (até 5) entram na frente.
 * O documento mantém marcadores/links (a capa é inserida NO próprio PDF, não copiando as páginas).
 */
export async function montarPdfComCapa(
  pdf: Uint8Array, capa: { tipo: TipoCapa; bytes: Uint8Array },
  opts: { descartarAntes?: number; titulo?: string } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false })
  const total = doc.getPageCount()
  if (total < 1) throw new Error('pdf sem páginas')
  const skip = Math.max(0, Math.min(Math.trunc(opts.descartarAntes ?? 0), total - 1)) // nunca descarta tudo
  const ref = doc.getPage(skip).getSize()
  const W = ref.width > 50 ? ref.width : A4[0], H = ref.height > 50 ? ref.height : A4[1]
  for (let i = 0; i < skip; i++) doc.removePage(0)

  if (capa.tipo === 'pdf') {
    const cdoc = await PDFDocument.load(capa.bytes, { ignoreEncryption: true, updateMetadata: false })
    const n = Math.min(cdoc.getPageCount(), 5)
    if (n < 1) throw new Error('capa pdf sem páginas')
    const pgs = await doc.copyPages(cdoc, Array.from({ length: n }, (_, i) => i))
    pgs.forEach((p, i) => doc.insertPage(i, p))
  } else {
    const img = capa.tipo === 'png' ? await doc.embedPng(capa.bytes) : await doc.embedJpg(capa.bytes)
    const k = Math.min(W / img.width, H / img.height)
    const w = img.width * k, h = img.height * k
    const pg = doc.insertPage(0, [W, H])
    pg.drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h })
  }
  if (opts.titulo) doc.setTitle(opts.titulo.slice(0, 200))
  return doc.save()
}
