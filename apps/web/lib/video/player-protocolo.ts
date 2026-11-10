/**
 * Protocolo do player de vídeo (puro, sem DOM/React) — regras de heartbeat, retry e renovação.
 * Testável em node (vitest). O componente `components/aluno/video/lesson-player.tsx` só orquestra.
 */

export const HEARTBEAT_MS = 10_000
/** O servidor ignora batimentos com menos de 500 ms de intervalo; ficamos acima disso. */
export const HEARTBEAT_MIN_GAP_MS = 700
/** Renova o token de playback a ~80% do `expiresIn`. */
export const RENEW_FRACTION = 0.8
export const RENEW_MIN_MS = 15_000
/** Teto da fila de batimentos pendentes (descarta os mais antigos; o servidor só precisa do mais recente). */
export const QUEUE_MAX = 30
export const RETRY_BASE_MS = 1_000
export const RETRY_MAX_MS = 30_000
export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const

export type Beat = {
  seq: number
  position: number
  rate: number
  quality: string
  device: string
}

/** Troca o `t=` de uma URL de HLS pelo token mais recente (o token renova durante a aula). */
export function withToken(url: string, token: string): string {
  if (/([?&])t=[^&]*/.test(url)) return url.replace(/([?&])t=[^&]*/, `$1t=${encodeURIComponent(token)}`)
  return url + (url.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(token)
}

/** Atraso até a renovação: 80% do expiresIn (segundos), com piso. */
export function renewDelayMs(expiresInSec: number): number {
  const ms = Math.round((Number.isFinite(expiresInSec) ? expiresInSec : 0) * 1000 * RENEW_FRACTION)
  return Math.max(RENEW_MIN_MS, ms)
}

/** Backoff exponencial determinístico (1s, 2s, 4s … teto 30s). `attempt` começa em 0. */
export function retryDelayMs(attempt: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempt))
}

export type StatusClass = 'ok' | 'retry' | 'fatal'

/** 2xx ok; 401/403/404/410 = sessão/aula inválida (fatal, não insistir); 408/425/429/5xx/0 = tentar de novo. */
export function classifyStatus(status: number): StatusClass {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 0 || status === 408 || status === 425 || status === 429 || status >= 500) return 'retry'
  return 'fatal'
}

/** Deve emitir um batimento agora? (só tocando e aba visível, com intervalo mínimo; `force` ignora tocando/visível). */
export function shouldBeat(o: {
  playing: boolean
  hidden: boolean
  now: number
  last: number
  force?: boolean
}): boolean {
  if (o.now - o.last < HEARTBEAT_MIN_GAP_MS) return false
  if (o.force) return true
  return o.playing && !o.hidden
}

/**
 * Fila de batimentos com retry. Mantém ordem por `seq`; ao estourar `QUEUE_MAX` descarta os mais antigos.
 * `next(now)` devolve o batimento a enviar (respeitando backoff); `ack`/`fail` fecham o ciclo.
 */
export class BeatQueue {
  private items: Beat[] = []
  private attempt = 0
  private blockedUntil = 0
  private seq = 0

  get size(): number {
    return this.items.length
  }
  get attempts(): number {
    return this.attempt
  }

  /** Cria e enfileira um batimento com `seq` crescente. */
  push(b: Omit<Beat, 'seq'>): Beat {
    const beat: Beat = { ...b, seq: ++this.seq }
    this.items.push(beat)
    if (this.items.length > QUEUE_MAX) this.items.splice(0, this.items.length - QUEUE_MAX)
    return beat
  }

  /** Próximo a enviar, ou null se vazio/bloqueado pelo backoff. */
  next(now: number): Beat | null {
    if (!this.items.length || now < this.blockedUntil) return null
    return this.items[0]
  }

  /** Sucesso: remove o enviado e zera o backoff. */
  ack(seq: number): void {
    this.items = this.items.filter((b) => b.seq !== seq)
    this.attempt = 0
    this.blockedUntil = 0
  }

  /** Falha: `retry` mantém na fila com backoff; `fatal` descarta o item. Retorna o atraso aplicado (ms). */
  fail(seq: number, cls: StatusClass, now: number): number {
    if (cls === 'fatal') {
      this.items = this.items.filter((b) => b.seq !== seq)
      return 0
    }
    const d = retryDelayMs(this.attempt++)
    this.blockedUntil = now + d
    return d
  }

  clear(): void {
    this.items = []
    this.attempt = 0
    this.blockedUntil = 0
  }
}

export type Chapter = { startS: number; title: string }

/** Índice do capítulo atual (último com startS <= t), ou -1. Assume/aceita lista desordenada. */
export function chapterIndexAt(chapters: Chapter[], t: number): number {
  let idx = -1
  let best = -Infinity
  chapters.forEach((c, i) => {
    if (c.startS <= t && c.startS >= best) {
      best = c.startS
      idx = i
    }
  })
  return idx
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** 83 -> "1:23"; 3723 -> "1:02:03". */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Próxima/anterior velocidade da lista RATES (saturando nas pontas). */
export function stepRate(current: number, dir: 1 | -1): number {
  const i = RATES.findIndex((r) => r >= current)
  const base = i === -1 ? RATES.length - 1 : i
  return RATES[clamp(base + dir, 0, RATES.length - 1)]
}

// ─────────── postMessage ao pai (iframe Curseduca) ───────────

export type EmbedEvent =
  | { type: 'video:resize'; height: number }
  | { type: 'video:started'; aulaId: string }
  | { type: 'video:completed'; aulaId: string }

export const EMBED_NS = 'rev-video'

/** Envelope versionado e namespaced, para o pai filtrar. */
export function buildEmbedMessage(ev: EmbedEvent): { ns: string; v: 1 } & EmbedEvent {
  return { ns: EMBED_NS, v: 1, ...ev }
}

/** Heurística de conclusão: terminou OU passou de `fraction` da duração (padrão 90%). */
export function isCompleted(position: number, duration: number, ended: boolean, fraction = 0.9): boolean {
  if (ended) return true
  return duration > 0 && position / duration >= fraction
}

// ─────────── sprite de miniaturas (WebVTT `img.jpg#xywh=x,y,w,h`) ───────────

export type SpriteCue = { start: number; end: number; x: number; y: number; w: number; h: number; url: string }

function vttTime(s: string): number {
  const p = s.trim().split(':').map(Number)
  if (p.some((n) => Number.isNaN(n))) return NaN
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]
}

/** Interpreta o sprite.vtt; `resolve` transforma a URL relativa da imagem em absoluta. */
export function parseSpriteVtt(text: string, resolve: (u: string) => string = (u) => u): SpriteCue[] {
  const out: SpriteCue[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\S+)\s+-->\s+(\S+)/)
    if (!m) continue
    const ref = (lines[i + 1] ?? '').trim()
    const [file, frag] = ref.split('#xywh=')
    if (!file || !frag) continue
    const [x, y, w, h] = frag.split(',').map(Number)
    const start = vttTime(m[1])
    const end = vttTime(m[2])
    if ([x, y, w, h, start, end].some((n) => Number.isNaN(n))) continue
    out.push({ start, end, x, y, w, h, url: resolve(file) })
  }
  return out
}

export const spriteCueAt = (cues: SpriteCue[], t: number) => cues.find((c) => t >= c.start && t < c.end) ?? null
