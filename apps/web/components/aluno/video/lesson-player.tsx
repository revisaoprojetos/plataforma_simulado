'use client'

/**
 * <LessonPlayer> — player HLS da aula ("Vídeo próprio"). Comportamento de referência: services/video/apps/player.
 * - hls.js via import() dinâmico (Safari usa HLS nativo); `?t=` atualizado a cada request via xhrSetup.
 * - Sessão (playback/renovação/heartbeat/fim) em usePlaybackSession; regras puras em lib/video/player-protocolo.
 * - Tokens de cor do tema (sem hex); só a sobreposição do vídeo usa preto/branco translúcido.
 * - Compatível com iframe Curseduca: postMessage ao pai (altura, iniciou, concluiu).
 */

import * as React from 'react'
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, PictureInPicture2, Captions, Gauge, Settings2,
  Loader2, AlertTriangle, SkipForward, RotateCcw, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  RATES, chapterIndexAt, clamp, formatTime, isCompleted, parseSpriteVtt, spriteCueAt, stepRate, withToken,
  type SpriteCue,
} from '@/lib/video/player-protocolo'
import { absUrl, usePlaybackSession, watermarkText } from './use-playback-session'
import { postToParent, useEmbedResize } from './use-embed-bridge'
import { ChaptersPanel, NotesPanel, TranscriptPanel, type PanelCtx } from './lesson-panels'

// ───────── tipagem mínima do hls.js (a dependência é carregada por import() dinâmico) ─────────
type HlsInstance = {
  loadSource(src: string): void
  attachMedia(v: HTMLVideoElement): void
  destroy(): void
  on(ev: string, cb: (...a: any[]) => void): void // eslint-disable-line @typescript-eslint/no-explicit-any
  startLoad(): void
  recoverMediaError(): void
  levels: { height: number }[]
  currentLevel: number
  autoLevelEnabled: boolean
}
type HlsCtor = {
  new (cfg: Record<string, unknown>): HlsInstance
  isSupported(): boolean
  Events: Record<string, string>
}

async function loadHls(): Promise<HlsCtor> {
  // @ts-ignore -- `hls.js` ainda não está no package.json (ver docs/video/FRONT.md); tipado localmente.
  const mod = await import('hls.js')
  return ((mod as { default?: HlsCtor }).default ?? (mod as unknown as HlsCtor)) as HlsCtor
}

function safeGet(k: string): string | null { try { return localStorage.getItem(k) } catch { return null } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* sem storage */ } }

type Aba = 'capitulos' | 'transcricao' | 'anotacoes'

export type LessonPlayerProps = {
  aulaId: string
  titulo?: string
  /** Clique em "Próxima aula" (ou fim do vídeo com próxima disponível). */
  onNext?: (nextAulaId: string) => void
  onCompleted?: () => void
  className?: string
}

const ctlBtn =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white outline-none transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:w-9'

export function LessonPlayer({ aulaId, titulo, onNext, onCompleted, className }: LessonPlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const boxRef = React.useRef<HTMLDivElement>(null)
  const hlsRef = React.useRef<HlsInstance | null>(null)
  const startedRef = React.useRef(false)
  const completedRef = React.useRef(false)

  const [playing, setPlaying] = React.useState(false)
  const [waiting, setWaiting] = React.useState(false)
  const [ended, setEnded] = React.useState(false)
  const [time, setTime] = React.useState(0)
  const [duration, setDuration] = React.useState(0)
  const [buffered, setBuffered] = React.useState(0)
  const [rate, setRate] = React.useState(1)
  const [volume, setVolume] = React.useState(1)
  const [muted, setMuted] = React.useState(false)
  const [levels, setLevels] = React.useState<number[]>([])
  const [auto, setAuto] = React.useState(true)
  const [levelH, setLevelH] = React.useState<number | null>(null)
  const [caption, setCaption] = React.useState<string | null>(null)
  const [fs, setFs] = React.useState(false)
  const [active, setActive] = React.useState(true)
  const [playerError, setPlayerError] = React.useState<string | null>(null)
  const [aba, setAba] = React.useState<Aba>('capitulos')
  const [wmPos, setWmPos] = React.useState(0)
  const [hover, setHover] = React.useState<{ t: number; x: number } | null>(null)
  const [sprite, setSprite] = React.useState<SpriteCue[]>([])

  const snapshot = React.useCallback(() => {
    const v = videoRef.current
    if (!v) return null
    return {
      position: v.currentTime,
      rate: v.playbackRate,
      quality: hlsRef.current && !hlsRef.current.autoLevelEnabled ? `${hlsRef.current.levels[hlsRef.current.currentLevel]?.height ?? 'auto'}p` : 'auto',
      playing: !v.paused && !v.ended,
    }
  }, [])

  const { status, error, data, beat, tokenRef, reload, finish } = usePlaybackSession(aulaId, snapshot)
  useEmbedResize()

  const getToken = React.useCallback(() => tokenRef.current, [tokenRef])
  const getTime = React.useCallback(() => videoRef.current?.currentTime ?? 0, [])
  const seek = React.useCallback((t: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = clamp(t, 0, v.duration || Number.MAX_SAFE_INTEGER)
    setTime(v.currentTime)
  }, [])

  // ── HLS ──
  React.useEffect(() => {
    if (status !== 'ready' || !data || !videoRef.current) return
    const v = videoRef.current
    let dead = false
    const manifest = absUrl(data.apiBase, data.manifestUrl)
    const resume = () => {
      const d = v.duration
      if (data.resumeAt > 0 && (!d || data.resumeAt < d - 5)) v.currentTime = data.resumeAt
    }
    setPlayerError(null)
    ;(async () => {
      try {
        const Hls = await loadHls()
        if (dead) return
        if (Hls.isSupported()) {
          const hls = new Hls({
            // Todo request da API usa o token ATUAL (renovado a ~80% do expiresIn).
            xhrSetup: (xhr: XMLHttpRequest, url: string) => {
              if (url.includes('/v1/hls/')) xhr.open('GET', withToken(url, tokenRef.current), true)
            },
          })
          hlsRef.current = hls
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setLevels([...new Set(hls.levels.map((l) => l.height))].sort((a, b) => b - a))
            resume()
          })
          hls.on(Hls.Events.LEVEL_SWITCHED, (_e: unknown, d: { level: number }) => setLevelH(hls.levels[d.level]?.height ?? null))
          hls.on(Hls.Events.ERROR, (_e: unknown, err: { fatal?: boolean; type?: string }) => {
            if (!err.fatal) return
            if (err.type === 'networkError') hls.startLoad()
            else if (err.type === 'mediaError') hls.recoverMediaError()
            else setPlayerError('Falha ao carregar o vídeo. Tente novamente.')
          })
          hls.loadSource(manifest)
          hls.attachMedia(v)
        } else {
          v.src = withToken(manifest, tokenRef.current) // Safari: HLS nativo
          v.addEventListener('loadedmetadata', resume, { once: true })
        }
      } catch {
        if (!dead) setPlayerError('Não foi possível carregar o player de vídeo.')
      }
    })()
    return () => {
      dead = true
      hlsRef.current?.destroy()
      hlsRef.current = null
      v.removeAttribute('src')
      v.load()
    }
  }, [status, data, tokenRef])

  // ── sprite (miniaturas na timeline), opcional ──
  React.useEffect(() => {
    if (!data?.spriteVttUrl) return
    const ac = new AbortController()
    fetch(absUrl(data.apiBase, data.spriteVttUrl), { signal: ac.signal })
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => setSprite(parseSpriteVtt(t, (u) => absUrl(data.apiBase, u))))
      .catch(() => undefined)
    return () => ac.abort()
  }, [data])

  // ── preferências persistidas ──
  React.useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const r = Number(safeGet('rev.video.rate'))
    if (RATES.includes(r as (typeof RATES)[number])) { v.playbackRate = r; setRate(r) }
    const vol = Number(safeGet('rev.video.volume') ?? 1)
    if (!Number.isNaN(vol)) { v.volume = clamp(vol, 0, 1); setVolume(v.volume) }
    setCaption(safeGet('rev.video.caption') || null)
  }, [status])

  // legendas: ativa a trilha escolhida
  React.useEffect(() => {
    const v = videoRef.current
    if (!v) return
    for (const tr of Array.from(v.textTracks)) tr.mode = tr.language === caption ? 'showing' : 'disabled'
  }, [caption, data])

  // fullscreen state
  React.useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  // marca d'água se move (desencoraja captura de tela)
  React.useEffect(() => {
    if (!data) return
    const id = setInterval(() => setWmPos((p) => (p + 1) % 4), 15_000)
    return () => clearInterval(id)
  }, [data])

  // auto-ocultar controles
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const poke = React.useCallback(() => {
    setActive(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setActive(false), 3000)
  }, [])
  React.useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current) }, [])
  const controlsVisible = active || !playing

  // ── ações ──
  const togglePlay = React.useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused || v.ended) void v.play().catch(() => undefined)
    else v.pause()
  }, [])
  const changeRate = (r: number) => {
    const v = videoRef.current
    if (v) v.playbackRate = r
    setRate(r)
    safeSet('rev.video.rate', String(r))
  }
  const changeVolume = (n: number) => {
    const v = videoRef.current
    if (!v) return
    v.volume = clamp(n, 0, 1)
    v.muted = v.volume === 0
    setVolume(v.volume)
    setMuted(v.muted)
    safeSet('rev.video.volume', String(v.volume))
  }
  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }
  const toggleFs = () => {
    const box = boxRef.current
    const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    if (document.fullscreenElement) void document.exitFullscreen()
    else if (box?.requestFullscreen) void box.requestFullscreen().catch(() => undefined)
    else v?.webkitEnterFullscreen?.() // iOS Safari
  }
  const pipOk = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled
  const togglePip = async () => {
    const v = videoRef.current
    if (!v) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await v.requestPictureInPicture()
    } catch { /* indisponível */ }
  }
  const setLevel = (h: number | null) => {
    const hls = hlsRef.current
    if (!hls) return
    if (h == null) { hls.currentLevel = -1; setAuto(true); return }
    const i = hls.levels.findIndex((l) => l.height === h)
    if (i >= 0) { hls.currentLevel = i; setAuto(false); setLevelH(h) }
  }
  const pickCaption = (lang: string | null) => {
    setCaption(lang)
    safeSet('rev.video.caption', lang ?? '')
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    // Sliders/menus tratam as próprias setas.
    const role = (e.target as HTMLElement).getAttribute('role')
    const own = role === 'slider' || role === 'menuitemradio'
    const k = e.key
    let handled = true
    if (k === ' ' || k === 'k') { if ((e.target as HTMLElement).tagName === 'BUTTON' && k === ' ') return; togglePlay() }
    else if (k === 'ArrowLeft' && !own) seek(getTime() - 5)
    else if (k === 'ArrowRight' && !own) seek(getTime() + 5)
    else if (k === 'j') seek(getTime() - 10)
    else if (k === 'l') seek(getTime() + 10)
    else if (k === 'ArrowUp' && !own) changeVolume(volume + 0.05)
    else if (k === 'ArrowDown' && !own) changeVolume(volume - 0.05)
    else if (k === 'm') toggleMute()
    else if (k === 'f') toggleFs()
    else if (k === 'c' && data?.subtitles.length) pickCaption(caption ? null : data.subtitles[0].lang)
    else if (k === 'p' && pipOk) void togglePip()
    else if (k === '>' || k === '.') changeRate(stepRate(rate, 1))
    else if (k === '<' || k === ',') changeRate(stepRate(rate, -1))
    else handled = false
    if (handled) { e.preventDefault(); poke() }
  }

  // ── eventos do <video> ──
  const onTimeUpdate = () => {
    const v = videoRef.current
    if (!v) return
    setTime(v.currentTime)
    if (!completedRef.current && isCompleted(v.currentTime, v.duration, false)) {
      completedRef.current = true
      postToParent({ type: 'video:completed', aulaId })
      onCompleted?.()
    }
  }
  const onProgress = () => {
    const v = videoRef.current
    if (!v || !v.buffered.length) return
    setBuffered(v.buffered.end(v.buffered.length - 1))
  }

  // ── barra de progresso ──
  const seekRef = React.useRef<HTMLDivElement>(null)
  const posToTime = (clientX: number) => {
    const r = seekRef.current?.getBoundingClientRect()
    if (!r || !duration) return 0
    return clamp((clientX - r.left) / r.width, 0, 1) * duration
  }
  const dragging = React.useRef(false)
  const chapters = data?.chapters ?? []
  const chIdx = chapterIndexAt(chapters, time)
  const hoverCue = hover ? spriteCueAt(sprite, hover.t) : null
  const hoverChapter = hover ? chapters[chapterIndexAt(chapters, hover.t)]?.title : undefined

  const panelCtx: PanelCtx | null = data ? {
    aulaId, apiBase: data.apiBase, lessonId: data.lessonId, getToken, time, seek, getTime,
  } : null
  const wm = watermarkText(data?.watermark ?? null)
  const wmClass = ['left-3 top-3', 'right-3 top-3', 'bottom-16 right-3', 'bottom-16 left-3'][wmPos]
  const showError = error ?? playerError

  return (
    <div className={cn('w-full space-y-4', className)}>
      <div
        ref={boxRef}
        tabIndex={0}
        role="region"
        aria-label={titulo ? `Player de vídeo: ${titulo}` : 'Player de vídeo'}
        onKeyDown={onKeyDown}
        onMouseMove={poke}
        onTouchStart={poke}
        className={cn(
          'group/player relative w-full select-none overflow-hidden bg-black outline-none focus-visible:ring-2 focus-visible:ring-ring',
          fs ? 'h-full rounded-none' : 'aspect-video rounded-2xl',
        )}
      >
        <video
          ref={videoRef}
          className="h-full w-full bg-black object-contain"
          playsInline
          crossOrigin="anonymous"
          poster={absUrl(data?.apiBase ?? '', data?.poster) || undefined}
          aria-label={titulo ?? 'Vídeo da aula'}
          onClick={togglePlay}
          onPlay={() => {
            setPlaying(true); setEnded(false)
            if (!startedRef.current) { startedRef.current = true; postToParent({ type: 'video:started', aulaId }) }
            beat(false)
          }}
          onPause={() => { setPlaying(false); beat(true) }}
          onSeeked={() => beat(true)}
          onEnded={() => { setEnded(true); setPlaying(false); finish(); postToParent({ type: 'video:completed', aulaId }); if (!completedRef.current) { completedRef.current = true; onCompleted?.() } }}
          onTimeUpdate={onTimeUpdate}
          onProgress={onProgress}
          onDurationChange={() => setDuration(videoRef.current?.duration || 0)}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onCanPlay={() => setWaiting(false)}
          onRateChange={() => setRate(videoRef.current?.playbackRate ?? 1)}
          onVolumeChange={() => { setMuted(!!videoRef.current?.muted); setVolume(videoRef.current?.volume ?? 1) }}
        >
          {data?.subtitles.map((s) => (
            <track key={s.lang} kind="subtitles" srcLang={s.lang} label={s.lang} src={absUrl(data.apiBase, s.url)} />
          ))}
        </video>

        {wm && (
          <div aria-hidden className={cn('pointer-events-none absolute z-10 rounded bg-black/30 px-2 py-0.5 text-[11px] font-medium text-white/60 transition-all duration-1000', wmClass)}>
            {wm}
          </div>
        )}

        {(status === 'loading' || waiting) && !showError && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" role="status" aria-label="Carregando">
            <Loader2 className="h-10 w-10 animate-spin text-white/80" />
          </div>
        )}

        {showError && (
          <div role="alert" className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center text-white">
            <AlertTriangle className="h-8 w-8" />
            <p className="max-w-md text-sm">{showError}</p>
            <button type="button" onClick={() => { setPlayerError(null); reload() }}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring">
              <RotateCcw className="h-4 w-4" /> Tentar novamente
            </button>
          </div>
        )}

        {ended && data?.nextAulaId && onNext && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
            <button type="button" onClick={() => onNext(data.nextAulaId!)}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring">
              <SkipForward className="h-5 w-5" /> Próxima aula
            </button>
          </div>
        )}

        {!playing && !ended && status === 'ready' && !showError && (
          <button type="button" onClick={togglePlay} aria-label="Reproduzir"
            className="absolute left-1/2 top-1/2 z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring">
            <Play className="ml-0.5 h-7 w-7" />
          </button>
        )}

        {/* Controles */}
        <div className={cn(
          'absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-8 transition-opacity sm:px-3',
          controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100',
        )}>
          {/* Timeline */}
          <div
            ref={seekRef}
            role="slider"
            tabIndex={0}
            aria-label="Posição do vídeo"
            aria-valuemin={0}
            aria-valuemax={Math.floor(duration)}
            aria-valuenow={Math.floor(time)}
            aria-valuetext={`${formatTime(time)} de ${formatTime(duration)}`}
            onPointerDown={(e) => { dragging.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); seek(posToTime(e.clientX)) }}
            onPointerMove={(e) => { setHover({ t: posToTime(e.clientX), x: e.clientX - (seekRef.current?.getBoundingClientRect().left ?? 0) }); if (dragging.current) seek(posToTime(e.clientX)) }}
            onPointerUp={() => { dragging.current = false }}
            onPointerLeave={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') { seek(time - 5); e.preventDefault(); e.stopPropagation() }
              else if (e.key === 'ArrowRight') { seek(time + 5); e.preventDefault(); e.stopPropagation() }
              else if (e.key === 'Home') { seek(0); e.preventDefault() }
              else if (e.key === 'End') { seek(duration); e.preventDefault() }
            }}
            className="group/seek relative flex h-5 cursor-pointer touch-none items-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="relative h-1 w-full rounded-full bg-white/25 transition-all group-hover/seek:h-1.5">
              <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${duration ? (time / duration) * 100 : 0}%` }} />
              {duration > 0 && chapters.map((c, i) => c.startS > 0 && (
                <span key={i} aria-hidden className="absolute top-0 h-full w-0.5 bg-black/60" style={{ left: `${(c.startS / duration) * 100}%` }} />
              ))}
            </div>
            {hover && duration > 0 && (
              <div className="pointer-events-none absolute bottom-6 z-30 -translate-x-1/2 text-center text-xs text-white" style={{ left: clamp(hover.x, 60, (seekRef.current?.clientWidth ?? 0) - 60) }}>
                {hoverCue && (
                  <div className="mb-1 overflow-hidden rounded-md border border-white/20" style={{ width: hoverCue.w, height: hoverCue.h, backgroundImage: `url(${hoverCue.url})`, backgroundPosition: `-${hoverCue.x}px -${hoverCue.y}px` }} />
                )}
                {hoverChapter && <div className="mb-0.5 max-w-[180px] truncate rounded bg-black/70 px-1.5 py-0.5">{hoverChapter}</div>}
                <span className="rounded bg-black/70 px-1.5 py-0.5 tabular-nums">{formatTime(hover.t)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-0.5 text-white">
            <button type="button" onClick={togglePlay} aria-label={playing ? 'Pausar' : 'Reproduzir'} className={ctlBtn}>
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            <button type="button" onClick={toggleMute} aria-label={muted || volume === 0 ? 'Ativar som' : 'Silenciar'} className={ctlBtn}>
              {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <input
              type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              aria-label="Volume"
              className="hidden h-1 w-20 cursor-pointer accent-primary sm:block"
            />
            <span className="ml-1 whitespace-nowrap text-xs tabular-nums sm:text-sm" aria-hidden>
              {formatTime(time)} / {formatTime(duration)}
            </span>
            {chIdx >= 0 && <span className="ml-2 hidden min-w-0 truncate text-xs text-white/70 md:inline">{chapters[chIdx].title}</span>}
            <span className="flex-1" />

            <ControlMenu icon={<Gauge className="h-5 w-5" />} label="Velocidade de reprodução" value={`${rate}×`}
              items={RATES.map((r) => ({ id: String(r), label: `${r}×`, checked: rate === r, onSelect: () => changeRate(r) }))} />
            {levels.length > 0 && (
              <ControlMenu icon={<Settings2 className="h-5 w-5" />} label="Qualidade do vídeo" value={auto ? 'Auto' : `${levelH}p`}
                items={[{ id: 'auto', label: 'Auto', checked: auto, onSelect: () => setLevel(null) },
                  ...levels.map((h) => ({ id: String(h), label: `${h}p`, checked: !auto && levelH === h, onSelect: () => setLevel(h) }))]} />
            )}
            {!!data?.subtitles.length && (
              <ControlMenu icon={<Captions className="h-5 w-5" />} label="Legendas" value={caption ?? 'Off'}
                items={[{ id: 'off', label: 'Desativadas', checked: !caption, onSelect: () => pickCaption(null) },
                  ...data.subtitles.map((s) => ({ id: s.lang, label: s.lang, checked: caption === s.lang, onSelect: () => pickCaption(s.lang) }))]} />
            )}
            {pipOk && (
              <button type="button" onClick={() => void togglePip()} aria-label="Picture-in-Picture" className={ctlBtn}>
                <PictureInPicture2 className="h-5 w-5" />
              </button>
            )}
            <button type="button" onClick={toggleFs} aria-label={fs ? 'Sair da tela cheia' : 'Tela cheia'} className={ctlBtn}>
              {fs ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Painéis (abas sublinhadas) */}
      {data && panelCtx && (
        <section aria-label="Recursos da aula" className="w-full">
          <div role="tablist" aria-label="Recursos da aula" className="flex gap-1 border-b">
            {([['capitulos', 'Capítulos'], ['transcricao', 'Transcrição'], ['anotacoes', 'Anotações']] as [Aba, string][]).map(([id, label]) => (
              <button key={id} type="button" role="tab" id={`vtab-${id}`} aria-selected={aba === id} aria-controls={`vpanel-${id}`}
                tabIndex={aba === id ? 0 : -1} onClick={() => setAba(id)}
                onKeyDown={(e) => {
                  const order: Aba[] = ['capitulos', 'transcricao', 'anotacoes']
                  const i = order.indexOf(aba)
                  if (e.key === 'ArrowRight') { setAba(order[(i + 1) % 3]); e.preventDefault() }
                  if (e.key === 'ArrowLeft') { setAba(order[(i + 2) % 3]); e.preventDefault() }
                }}
                className={cn('-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  aba === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`vpanel-${aba}`} aria-labelledby={`vtab-${aba}`} className="pt-3">
            {aba === 'capitulos' && <ChaptersPanel chapters={chapters} time={time} seek={seek} />}
            {aba === 'transcricao' && <TranscriptPanel ctx={panelCtx} />}
            {aba === 'anotacoes' && <NotesPanel ctx={panelCtx} />}
          </div>
        </section>
      )}
    </div>
  )
}

// ───────────────────────────── Menu de opções exclusivas ─────────────────────────────

type MenuItem = { id: string; label: string; checked: boolean; onSelect: () => void }

function ControlMenu({ icon, label, value, items }: { icon: React.ReactNode; label: string; value: string; items: MenuItem[] }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!open) return
    const out = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', out)
    return () => document.removeEventListener('pointerdown', out)
  }, [open])
  return (
    <div ref={ref} className="relative" onKeyDown={(e) => { if (e.key === 'Escape' && open) { setOpen(false); e.stopPropagation() } }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`${label}: ${value}`} title={label}
        className={cn(ctlBtn, 'w-auto gap-1 px-2')}>
        {icon}<span className="hidden text-xs tabular-nums md:inline">{value}</span>
      </button>
      {open && (
        <div role="menu" aria-label={label} className="absolute bottom-11 right-0 z-40 min-w-[8rem] rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg">
          {items.map((it) => (
            <button key={it.id} type="button" role="menuitemradio" aria-checked={it.checked}
              onClick={() => { it.onSelect(); setOpen(false) }}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
              {it.label}{it.checked && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
