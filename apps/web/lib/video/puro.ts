import type { PlaybackRes, StatusAulaVideo } from './tipos'

/**
 * Funções PURAS do Vídeo próprio (sem I/O, sem server-only) — testáveis em vitest.
 */

/** Normaliza a URL base da video-api: devolve `origin` (sem barra final) e `v1` (origin + /v1). */
export function normalizarBase(url: string): { origin: string; v1: string } {
  const limpa = url.trim().replace(/\/+$/, '')
  const origin = limpa.replace(/\/v1$/i, '')
  return { origin, v1: `${origin}/v1` }
}

/** Torna absoluta uma URL relativa devolvida pela video-api (ex.: `/v1/hls/...`). Absolutas passam intactas. */
export function absolutizar(origin: string, url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`
}

/** Resposta de `POST /v1/lessons/:id/playback` (campos que usamos). */
export interface PlaybackServico {
  sessionId: string
  playbackToken: string
  expiresIn: number
  manifestUrl: string
  posterUrl?: string | null
  spriteVttUrl?: string | null
  durationS?: number | null
  watermark?: { text: string } | null
  resumeAt?: number | null
  subtitles?: { lang: string; url: string }[] | null
  chapters?: { startS: number; title: string }[] | null
}

/** Monta o contrato `PlaybackRes` que o front consome (URLs absolutas; apiBase = origin público + /v1). */
export function mapearPlayback(r: PlaybackServico, publica: { origin: string; v1: string }, nextAulaId: string | null, lessonId: string): PlaybackRes {
  return {
    apiBase: publica.v1,
    manifestUrl: absolutizar(publica.origin, r.manifestUrl) ?? r.manifestUrl,
    playbackToken: r.playbackToken,
    expiresIn: r.expiresIn,
    sessionId: r.sessionId,
    resumeAt: typeof r.resumeAt === 'number' && r.resumeAt > 0 ? r.resumeAt : 0,
    watermark: r.watermark?.text ? { text: r.watermark.text } : null,
    subtitles: (r.subtitles ?? []).map((s) => ({ lang: s.lang, url: absolutizar(publica.origin, s.url) ?? s.url })),
    chapters: (r.chapters ?? []).map((c) => ({ startS: c.startS, title: c.title })),
    poster: absolutizar(publica.origin, r.posterUrl ?? null),
    nextAulaId,
    lessonId,
    durationS: typeof r.durationS === 'number' ? r.durationS : null,
    spriteVttUrl: absolutizar(publica.origin, r.spriteVttUrl ?? null),
  }
}

/** Mapeia o status do vídeo no serviço para o status da nossa aula. */
export function statusAulaDoServico(s: string | null | undefined): StatusAulaVideo {
  switch (s) {
    case 'ready': return 'pronta'
    case 'failed': return 'erro'
    case 'queued':
    case 'processing':
    case 'uploaded': return 'processando'
    case 'uploading': return 'enviando'
    default: return 'processando'
  }
}

/** Escapa `%`, `_`, `,`, `(`, `)` para uso em `ilike`/`or` do PostgREST. */
export function escaparBusca(s: string): string {
  return s.replace(/[\\%_,()]/g, (m) => `\\${m}`).trim()
}

/** YYYY-MM-DD / ISO => ISO UTC (ou null). */
export function paraIso(v: string | null | undefined): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(+d) ? null : d.toISOString()
}
