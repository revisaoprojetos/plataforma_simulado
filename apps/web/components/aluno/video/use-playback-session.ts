'use client'

/**
 * Sessão de reprodução do aluno: abre o playback (rota do nosso servidor), renova o token a ~80% do
 * expiresIn, envia heartbeats (10 s, só tocando e com a aba visível) com fila de retry e encerra a
 * sessão com sendBeacon. A regra pura vive em lib/video/player-protocolo.ts.
 * O browser fala DIRETO com a video-api (`apiBase`) usando o playbackToken; a chave de integração
 * nunca chega aqui.
 */

import * as React from 'react'
import {
  BeatQueue, HEARTBEAT_MS, classifyStatus, renewDelayMs, shouldBeat, type Chapter,
} from '@/lib/video/player-protocolo'

export type PlaybackData = {
  apiBase: string
  manifestUrl: string
  playbackToken: string
  expiresIn: number
  sessionId: string
  resumeAt: number
  watermark: { text: string } | string | null
  subtitles: { lang: string; url: string }[]
  chapters: Chapter[]
  poster: string | null
  nextAulaId: string | null
  /** Opcionais (ver docs/video/FRONT.md, "lacunas do contrato"). */
  lessonId?: string
  durationS?: number | null
  spriteVttUrl?: string | null
}

export type SessionStatus = 'loading' | 'ready' | 'error' | 'ended'

/** Leitura do estado do <video> no momento do batimento (injetada pelo player). */
export type VideoSnapshot = () => { position: number; rate: number; quality: string; playing: boolean } | null

export function absUrl(apiBase: string, u: string | null | undefined): string {
  if (!u) return ''
  return /^https?:\/\//i.test(u) ? u : apiBase.replace(/\/$/, '') + (u.startsWith('/') ? u : `/${u}`)
}

export function watermarkText(w: PlaybackData['watermark']): string {
  return !w ? '' : typeof w === 'string' ? w : w.text
}

export function usePlaybackSession(aulaId: string, snapshot: VideoSnapshot) {
  const [status, setStatus] = React.useState<SessionStatus>('loading')
  const [error, setError] = React.useState<string | null>(null)
  const [data, setData] = React.useState<PlaybackData | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)

  const tokenRef = React.useRef('')
  const apiRef = React.useRef('')
  const queue = React.useRef(new BeatQueue())
  const lastBeat = React.useRef(0)
  const inFlight = React.useRef(false)
  const retryTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapRef = React.useRef(snapshot)
  snapRef.current = snapshot

  const fail = React.useCallback((msg: string) => {
    setError(msg)
    setStatus('error')
  }, [])

  const flush = React.useCallback(async () => {
    if (inFlight.current || !tokenRef.current) return
    const b = queue.current.next(Date.now())
    if (!b) return
    inFlight.current = true
    let cls = classifyStatus(0)
    try {
      const res = await fetch(`${apiRef.current}/v1/progress/heartbeat`, {
        method: 'POST',
        keepalive: true,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenRef.current}` },
        body: JSON.stringify(b),
      })
      cls = classifyStatus(res.status)
    } catch {
      cls = 'retry'
    }
    inFlight.current = false
    if (cls === 'ok') {
      queue.current.ack(b.seq)
      if (queue.current.size) void flush()
      return
    }
    const delay = queue.current.fail(b.seq, cls, Date.now())
    if (cls === 'retry' && delay > 0) {
      if (retryTimer.current) clearTimeout(retryTimer.current)
      retryTimer.current = setTimeout(() => void flush(), delay + 50)
    }
  }, [])

  /** Registra um batimento (se as regras permitirem) e tenta enviar a fila. */
  const beat = React.useCallback((force = false) => {
    const s = snapRef.current()
    if (!s || !tokenRef.current) return
    const now = Date.now()
    if (!shouldBeat({ playing: s.playing, hidden: document.visibilityState === 'hidden', now, last: lastBeat.current, force })) return
    lastBeat.current = now
    queue.current.push({ position: s.position, rate: s.rate, quality: s.quality, device: 'web' })
    void flush()
  }, [flush])

  const endSession = React.useCallback(() => {
    const t = tokenRef.current
    if (!t) return
    tokenRef.current = ''
    try {
      navigator.sendBeacon(`${apiRef.current}/v1/playback/end?t=${encodeURIComponent(t)}`)
    } catch { /* sem beacon: o token expira sozinho */ }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    let renewTimer: ReturnType<typeof setTimeout> | null = null
    let hbTimer: ReturnType<typeof setInterval> | null = null
    setStatus('loading')
    setError(null)
    queue.current.clear()

    const renew = async (expiresIn: number) => {
      renewTimer = setTimeout(async () => {
        if (cancelled || !tokenRef.current) return
        try {
          const res = await fetch(`${apiRef.current}/v1/playback/renew`, {
            method: 'POST',
            headers: { authorization: `Bearer ${tokenRef.current}` },
          })
          if (!res.ok) throw new Error(String(res.status))
          const j = (await res.json()) as { playbackToken?: string; expiresIn?: number }
          if (!j.playbackToken) throw new Error('sem token')
          tokenRef.current = j.playbackToken
          void renew(j.expiresIn ?? expiresIn)
        } catch {
          if (!cancelled) fail('Sua sessão de reprodução foi encerrada. Recarregue a aula para continuar.')
        }
      }, renewDelayMs(expiresIn))
    }

    ;(async () => {
      try {
        const res = await fetch('/api/aluno/video/playback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ aulaId }),
        })
        const j = (await res.json().catch(() => ({}))) as Partial<PlaybackData> & { error?: string; message?: string }
        if (!res.ok) throw new Error(j.error ?? j.message ?? 'Não foi possível iniciar o vídeo.')
        if (cancelled) return
        const d = j as PlaybackData
        tokenRef.current = d.playbackToken
        apiRef.current = d.apiBase.replace(/\/$/, '')
        setData(d)
        setStatus('ready')
        hbTimer = setInterval(() => beat(false), HEARTBEAT_MS)
        void renew(d.expiresIn)
      } catch (e) {
        if (!cancelled) fail(e instanceof Error ? e.message : 'Não foi possível iniciar o vídeo.')
      }
    })()

    const onVis = () => { if (document.visibilityState === 'hidden') beat(true) }
    const onHide = () => { beat(true); endSession() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onHide)

    return () => {
      cancelled = true
      if (renewTimer) clearTimeout(renewTimer)
      if (hbTimer) clearInterval(hbTimer)
      if (retryTimer.current) clearTimeout(retryTimer.current)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onHide)
      beat(true)
      endSession()
    }
  }, [aulaId, reloadKey, beat, endSession, fail])

  return {
    status, error, data, beat, tokenRef,
    reload: () => setReloadKey((k) => k + 1),
    /** Sinaliza fim da reprodução (envia batimento final). */
    finish: () => beat(true),
  }
}
