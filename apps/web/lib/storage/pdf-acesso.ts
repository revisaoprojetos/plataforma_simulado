// SERVIDOR. Acesso privado ao bucket `pdfs`: links com token HMAC (capability de curta duração) emitidos
// DEPOIS de checar dono/tenant, e utilitários p/ baixar o arquivo no servidor sem depender de URL pública.
// Ver lib/storage/pdf-proxy.ts (parte pura) e app/api/arquivo/pdf/[...path]/route.ts (resolução → URL assinada).
import { createHmac, timingSafeEqual } from 'crypto'
import { getStorage } from '@/lib/storage'
import { PROXY_PDF_BASE, pdfPathDeUrl, pdfSegmentos } from '@/lib/storage/pdf-proxy'

export const BUCKET_PDFS = 'pdfs'
/** Validade padrão do link-token (o redirect final p/ o storage vale só ~2 min). */
export const TTL_PDF_PADRAO_SEG = 6 * 3600
/** Validade p/ PDFs gerados sob demanda (jobs): o link é entregue e usado logo em seguida. */
export const TTL_PDF_JOB_SEG = 15 * 60

function segredo(): string {
  return process.env.PDF_ACCESS_SECRET || process.env.ALUNO_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-secret-troque-em-producao'
}

function sig(exp: number, path: string): string {
  return createHmac('sha256', segredo()).update(`pdfs:${exp}:${path}`).digest('base64url').slice(0, 32)
}

/** Localizador → path, reconhecendo também as bases públicas configuradas por env (S3_PUBLIC_BASE_URL / PDF_PUBLIC_BASE). */
export function pdfPathServidor(url: string | null | undefined): string | null {
  const p = pdfPathDeUrl(url)
  if (p) return p
  if (!url) return null
  for (const base of [process.env.S3_PUBLIC_BASE_URL, process.env.PDF_PUBLIC_BASE]) {
    const b = base?.replace(/\/$/, '')
    if (b && url.startsWith(b + '/')) {
      const rest = url.slice(b.length + 1).split(/[?#]/)[0]
      try { return decodeURIComponent(rest) } catch { return rest }
    }
  }
  return null
}

/** Link-token (path-based, sem query → aceita `?download=` acrescentado depois) para um PATH do bucket `pdfs`. */
export function assinarPathPdf(path: string, ttlSec: number = TTL_PDF_PADRAO_SEG): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec
  return `${PROXY_PDF_BASE}/t.${exp}.${sig(exp, path)}/${pdfSegmentos(path)}`
}

/**
 * Localizador gravado (URL pública antiga/atual) → link-token. Preserva `?download=`.
 * Se a URL não for do bucket `pdfs` (ex.: link externo), devolve-a intacta.
 * CHAMAR SÓ DEPOIS de o requisitante já ter sido autorizado a ver o arquivo.
 */
export function assinarUrlPdf(url: string | null | undefined, ttlSec: number = TTL_PDF_PADRAO_SEG): string {
  if (!url) return ''
  const path = pdfPathServidor(url)
  if (!path) return url
  const i = url.indexOf('?')
  const query = i >= 0 ? url.slice(i).split('#')[0] : ''
  return assinarPathPdf(path, ttlSec) + query
}

export function tokenPdfValido(token: string, path: string): boolean {
  const m = /^t\.(\d+)\.([\w-]+)$/.exec(token)
  if (!m) return false
  const exp = Number(m[1])
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false
  const a = Buffer.from(m[2])
  const b = Buffer.from(sig(exp, path))
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Baixa um PDF do bucket pelo localizador (usa o storage com credencial); se não for do bucket, faz fetch da URL. */
export async function baixarPdfPorUrl(url: string): Promise<Buffer | null> {
  const path = pdfPathServidor(url)
  if (path) {
    const bytes = await getStorage().download(BUCKET_PDFS, path).catch(() => null)
    return bytes ? Buffer.from(bytes) : null
  }
  if (!/^https?:\/\//i.test(url)) return null
  try {
    const r = await fetch(url, { cache: 'no-store' })
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null
  } catch {
    return null
  }
}

/** URL de download de um job de PDF (simulado_pdf_jobs): link-token curto sobre `arquivo_path`; cai no `arquivo_url` legado. */
export function urlDoJobPdf(job: { arquivo_path?: string | null; arquivo_url?: string | null; status?: string | null }): string | null {
  if (job.status && job.status !== 'concluido') return null
  if (job.arquivo_path) return assinarPathPdf(job.arquivo_path, TTL_PDF_JOB_SEG)
  return job.arquivo_url ? assinarUrlPdf(job.arquivo_url, TTL_PDF_JOB_SEG) : null
}
