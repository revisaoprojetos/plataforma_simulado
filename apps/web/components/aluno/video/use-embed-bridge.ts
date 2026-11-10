'use client'

import * as React from 'react'
import { buildEmbedMessage, type EmbedEvent } from '@/lib/video/player-protocolo'

/** Envia um evento ao documento pai (iframe Curseduca). Sem pai → no-op. O payload não carrega dados sensíveis. */
export function postToParent(ev: EmbedEvent): void {
  if (typeof window === 'undefined' || window.parent === window) return
  try {
    window.parent.postMessage(buildEmbedMessage(ev), '*')
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
