import 'server-only'
import { detectarTipoCapa, hostInternoProibido } from './baixar-pura'

// Busca de bytes com teto/timeout (anti-SSRF opcional) e carga da CAPA (png/jpg/pdf; outros formatos -> PNG via sharp).
// Compartilhado pelo download do aluno e pelo download do admin (editor + lote).
export const MAX_CAPA = 12 * 1024 * 1024

/** fetch com teto de tamanho e timeout. `redirect` manual: cada salto é revalidado quando `validar` é passado. */
export async function buscar(url: string, max: number, ms: number, validar?: (u: URL) => boolean): Promise<Uint8Array | null> {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), ms)
  try {
    let atual = url
    for (let salto = 0; salto < 4; salto++) {
      if (validar && !validar(new URL(atual))) return null
      const r = await fetch(atual, { signal: ctrl.signal, redirect: validar ? 'manual' : 'follow', cache: 'no-store' })
      if (validar && r.status >= 300 && r.status < 400) { const loc = r.headers.get('location'); if (!loc) return null; atual = new URL(loc, atual).toString(); continue }
      if (!r.ok || !r.body) return null
      const cl = Number(r.headers.get('content-length') || 0)
      if (cl && cl > max) return null
      const partes: Uint8Array[] = []; let total = 0
      const rd = r.body.getReader()
      for (;;) {
        const { done, value } = await rd.read()
        if (done) break
        total += value.byteLength
        if (total > max) { try { await rd.cancel() } catch {} return null }
        partes.push(value)
      }
      const out = new Uint8Array(total); let o = 0
      for (const p of partes) { out.set(p, o); o += p.byteLength }
      return out
    }
    return null
  } catch { return null } finally { clearTimeout(to) }
}

/** Capa (http/https público ou caminho do próprio app) → bytes de PNG/JPG/PDF. Outros formatos: tenta converter p/ PNG (sharp), senão null. */
export async function carregarCapa(capaUrl: string, origem: string): Promise<{ tipo: 'png' | 'jpg' | 'pdf'; bytes: Uint8Array } | null> {
  let alvo: string
  if (capaUrl.startsWith('//')) return null
  if (capaUrl.startsWith('/')) alvo = origem + capaUrl
  else if (/^https?:\/\//i.test(capaUrl)) alvo = capaUrl
  else return null
  const proprio = new URL(origem).host
  const bytes = await buscar(alvo, MAX_CAPA, 15000, (u) => (u.protocol === 'https:' || u.protocol === 'http:') && (u.host === proprio || !hostInternoProibido(u.hostname)))
  if (!bytes) return null
  const tipo = detectarTipoCapa(bytes)
  if (tipo) return { tipo, bytes }
  try { // webp/gif/avif… → PNG (sharp, se disponível no servidor)
    const sharp = (await import('sharp' as string)).default
    const png = await sharp(Buffer.from(bytes)).png().toBuffer()
    return { tipo: 'png', bytes: new Uint8Array(png) }
  } catch { return null }
}

