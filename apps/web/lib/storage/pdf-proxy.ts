// Parte PURA (sem Node/segredos → usável também em componentes 'use client') do acesso privado ao bucket `pdfs`.
//
// O bucket `pdfs` deixou de ser público: nenhum link direto do storage funciona sem assinatura. Os
// "localizadores" que já estão gravados no banco (URL pública do Supabase `/storage/v1/object/public/pdfs/…`
// ou URL pública S3) continuam VÁLIDOS como identificadores — só não são mais abertos direto. Eles passam por
// `/api/arquivo/pdf/<path>` (checa dono/tenant pela sessão e responde com URL assinada de ~2 min).
// Compatível ANTES e DEPOIS da migration 20261119060000 (que torna o bucket privado): a rota assina sempre.

export const PROXY_PDF_BASE = '/api/arquivo/pdf'

const RE_SUPABASE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/pdfs\/([^?#]+)/
// S3 path-style (`endpoint/<prefixo>pdfs/materiais/..`) ou virtual-host (`<prefixo>pdfs.s3.../materiais/..`).
const RE_S3_PATH = /^https?:\/\/[^?#]*?\/[\w.-]*pdfs\/((?:materiais|relatorios)\/[^?#]+)/i
const RE_S3_HOST = /^https?:\/\/[\w.-]*pdfs[\w.-]*\/((?:materiais|relatorios)\/[^?#]+)/i
const RE_PROXY = /\/api\/arquivo\/pdf\/(?:t\.\d+\.[\w-]+\/)?([^?#]+)/

function dec(s: string): string {
  try { return decodeURIComponent(s) } catch { return s }
}

/** Caminho (dentro do bucket `pdfs`) referenciado por uma URL/localizador; null se não for do bucket. */
export function pdfPathDeUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  const m = RE_SUPABASE.exec(url) ?? RE_PROXY.exec(url) ?? RE_S3_PATH.exec(url) ?? RE_S3_HOST.exec(url)
  return m ? dec(m[1]) : null
}

export function pdfSegmentos(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

function queryDe(url: string): string {
  const i = url.indexOf('?')
  if (i < 0) return ''
  const h = url.indexOf('#', i)
  return h < 0 ? url.slice(i) : url.slice(i, h)
}

/**
 * Converte um localizador do bucket `pdfs` na URL do proxy autenticado por COOKIE (admin / painel).
 * Preserva `?download=`. URLs que não são do bucket `pdfs` voltam intactas. Idempotente.
 */
export function pdfProxyUrl(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith(PROXY_PDF_BASE + '/')) return url
  const path = pdfPathDeUrl(url)
  if (!path) return url
  return `${PROXY_PDF_BASE}/${pdfSegmentos(path)}${queryDe(url)}`
}
