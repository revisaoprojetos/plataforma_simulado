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

/** externalRef de idempotência no serviço: `regra_id:aluno_id`. */
export function externalRefDe(regraId: string, estudanteId: string): string {
  return `${regraId}:${estudanteId}`
}

export const MAX_TENTATIVAS = 8
const BASE_MS = 30_000
const TETO_MS = 6 * 3600_000

/**
 * Backoff exponencial com teto e jitter determinístico opcional (`rand` injetável nos testes).
 * tentativa 1 => ~30s, 2 => ~1min, 3 => ~2min … até 6h. Jitter ±20%.
 */
export function proximaTentativaMs(tentativas: number, rand: () => number = Math.random): number {
  const t = Math.max(1, Math.floor(tentativas))
  const base = Math.min(TETO_MS, BASE_MS * 2 ** (t - 1))
  const jitter = 0.8 + rand() * 0.4
  return Math.round(base * jitter)
}

/** Erros que NÃO adiantam repetir (falha definitiva): validação/regra de negócio, não-encontrado, conflito. */
export function erroDefinitivo(status: number | null): boolean {
  if (status === null) return false // rede/timeout: repete
  if (status === 408 || status === 429) return false
  return status >= 400 && status < 500
}

export interface OutraMatricula {
  estado: string
  acao: string
  fimEm: string | null
}

/**
 * Antes de revogar no serviço: outra regra AINDA concede o mesmo curso ao aluno? Então só encerramos a linha local.
 * "Concede" = enroll vigente (não expirada) e ainda não revogada/falha.
 */
export function outraRegraAindaConcede(outras: OutraMatricula[], agora: Date): boolean {
  return outras.some((o) => o.acao === 'enroll' && (o.estado === 'pendente' || o.estado === 'processando' || o.estado === 'sincronizado') && (!o.fimEm || +new Date(o.fimEm) > +agora))
}

/** O aluno tem acesso vigente a um curso segundo as linhas de sincronização? */
export function acessoVigente(linhas: { acao: string; estado: string; inicioEm: string | null; fimEm: string | null }[], agora: Date): boolean {
  return linhas.some(
    (l) =>
      l.acao === 'enroll' &&
      l.estado === 'sincronizado' &&
      (!l.inicioEm || +new Date(l.inicioEm) <= +agora) &&
      (!l.fimEm || +new Date(l.fimEm) > +agora),
  )
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

// ── Reconciliação ───────────────────────────────────────────────────────────

export interface Desejado { regraId: string; estudanteId: string; cursoId: string; inicioEm: string | null; fimEm: string | null }
export interface Existente extends Desejado { acao: string; estado: string }

export const chaveSync = (x: { regraId: string; estudanteId: string; cursoId: string }) => `${x.regraId}|${x.estudanteId}|${x.cursoId}`

const mesmaData = (a: string | null, b: string | null) => (a ? +new Date(a) : null) === (b ? +new Date(b) : null)

/**
 * Diferença entre o que os grants ATIVOS pedem (desejado) e o que a fila/serviço já tem (existente).
 *  - enroll : desejado sem linha, ou linha revogada/falha/com datas diferentes.
 *  - revoke : linha enroll vigente (pendente/sincronizada) sem grant correspondente.
 * Idempotente: rodar de novo sem mudanças => listas vazias.
 */
export function diferencaSync(desejado: Desejado[], existente: Existente[], agora: Date): { enroll: Desejado[]; revoke: Existente[] } {
  const ex = new Map(existente.map((e) => [chaveSync(e), e]))
  const des = new Map(desejado.map((d) => [chaveSync(d), d]))
  const enroll: Desejado[] = []
  const revoke: Existente[] = []
  for (const [k, d] of des) {
    const e = ex.get(k)
    if (!e) { enroll.push(d); continue }
    const ok = e.acao === 'enroll' && (e.estado === 'sincronizado' || e.estado === 'pendente' || e.estado === 'processando') && mesmaData(e.inicioEm, d.inicioEm) && mesmaData(e.fimEm, d.fimEm)
    if (!ok) enroll.push(d)
  }
  for (const [k, e] of ex) {
    if (des.has(k)) continue
    const vigente = e.acao === 'enroll' && (e.estado === 'sincronizado' || e.estado === 'pendente' || e.estado === 'processando')
    const jaExpirou = !!e.fimEm && +new Date(e.fimEm) <= +agora
    if (vigente && !jaExpirou) revoke.push(e)
    else if (vigente && jaExpirou && e.estado === 'sincronizado') revoke.push(e) // expirada: encerra a linha/serviço
  }
  return { enroll, revoke }
}
