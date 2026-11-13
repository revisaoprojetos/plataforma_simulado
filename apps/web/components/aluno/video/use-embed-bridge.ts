'use client'

import * as React from 'react'
import { origemHostValidada } from '@/lib/embed/origem-host'
import { buildEmbedMessage, type EmbedEvent } from '@/lib/video/player-protocolo'

/**
 * Envia um evento ao documento pai (iframe Curseduca). Sem pai → no-op.
 * targetOrigin = origem do pai VALIDADA (ancestorOrigins/referrer × allowlist Curseduca + NEXT_PUBLIC_EMBED_HOST_ORIGINS).
 * Sem origem validada: só `video:resize` (altura, sem dados) segue com '*'; `started/completed` (levam aulaId) NÃO são enviados.
 */
export function postToParent(ev: EmbedEvent): void {
  if (typeof window === 'undefined' || window.parent === window) return
  const msg = buildEmbedMessage(ev)
  const alvo = origemHostValidada()
  try {
    if (alvo) window.parent.postMessage(msg, alvo)
    else if (ev.type === 'video:resize') window.parent.postMessage(msg, '*')
  } catch { /* pai inacessível */ }
}

/**
 * Auto-ajuste de altura: observa o documento e avisa o pai (`video:resize`).
 * Requer que o iframe hospedeiro escute `message` com `ns === 'rev-video'` (ver docs/video/FRONT.md).
 */
export function useEmbedResize(): void {
  React.useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return
    let last = 0
    let raf = 0
    const send = () => {
      raf = 0
      const h = Math.ceil(document.documentElement.scrollHeight)
      if (Math.abs(h - last) < 2) return
      last = h
      postToParent({ type: 'video:resize', height: h })
    }
    const ro = new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(send) })
    ro.observe(document.documentElement)
    send()
    return () => { ro.disconnect(); if (raf) cancelAnimationFrame(raf) }
  }, [])
}
