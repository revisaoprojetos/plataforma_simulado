import path from 'node:path'

const PREFIXO = '/storage/v1/object/public/'

function bucketsPermitidos(): Set<string> {
  const extra = (process.env.PDF_VIEW_BUCKETS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return new Set(['pdfs', process.env.STORAGE_CONTENT_BUCKET?.trim() || 'pdfs', ...extra])
}

/** Devolve a URL canônica segura ou null. */
export function urlPdfPermitida(u: string, baseStorage: string): string | null {
  if (!u || u.length > 2048 || /[\u0000-\u001f\\]/.test(u)) return null
  let base: URL, alvo: URL
  try { base = new URL(baseStorage); alvo = new URL(u) } catch { return null }
  if (!/^https?:$/.test(alvo.protocol)) return null
  if (alvo.origin !== base.origin) return null
  if (alvo.username || alvo.password) return null
  // Caminho BRUTO (antes de qualquer decodificação): sem codificação de ponto/barra/contrabarra/NUL, sem barras duplas.
  const bruto = alvo.pathname
  if (/%(2e|2f|5c|00)/i.test(bruto) || bruto.includes('//')) return null
  let dec: string
  try { dec = decodeURIComponent(bruto) } catch { return null }
  if (dec.includes('\\') || dec.includes('\u0000') || dec.split('/').some((seg) => seg === '..' || seg === '.')) return null
  const norm = path.posix.normalize(dec)
  if (norm !== dec) return null // normalização mudaria o caminho => tentativa de contorno
  const basePath = base.pathname.replace(/\/+$/, '')
  const prefixo = `${basePath}${PREFIXO}`
  if (!norm.startsWith(prefixo)) return null
  const resto = norm.slice(prefixo.length).split('/')
  const [bucket, ...arq] = resto
  if (!bucket || !bucketsPermitidos().has(bucket) || arq.length === 0 || arq.some((s) => !s)) return null
  return `${base.origin}${bruto}` // sem query/fragmento
}
