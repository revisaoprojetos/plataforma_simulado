'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { APP_VERSION } from '@/lib/version'

// Estúdio de Conteúdo = PORTE FIEL do designer em IFRAME (mesmo padrão do cronograma/leitor).
// HTML exato do designer em /public/estudio-conteudo/*.html (style+script injetados escondem a
// sidebar/topbar do designer, desligam animações de entrada e trocam telas SEM reload — SPA).
// Cache-bust (?v=APP_VERSION&cb) como leitor/cronograma: sem isso o navegador serve o HTML cacheado.
// Carregamento = LINHA DO TOPO (navprogress), igual às outras áreas — acende no load inicial e nas
// trocas internas (o iframe avisa via postMessage). Tema claro/escuro sincronizado com o admin.
export function EstudioIframe({ file, title = 'Estúdio de Conteúdo' }: { file: string; title?: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  // Em DEV o navegador cacheia o HTML do iframe por URL; um nonce por montagem força o fetch fresco.
  const [bust] = useState(() => (process.env.NODE_ENV === 'development' ? `&cb=${Date.now()}` : ''))

  const syncTema = useCallback(() => {
    try {
      const doc = ref.current?.contentDocument
      if (!doc?.documentElement) return
      doc.documentElement.classList.toggle('dark', document.documentElement.classList.contains('dark'))
    } catch { /* ignore */ }
  }, [])

  // tema: segue o claro/escuro do admin
  useEffect(() => {
    const obs = new MutationObserver(syncTema)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => obs.disconnect()
  }, [syncTema])

  // barra de carregamento do TOPO: acende no load inicial e repassa início/fim das trocas internas
  useEffect(() => {
    try { window.dispatchEvent(new Event('navprogress:start')) } catch { /* ignore */ }
    function onMsg(e: MessageEvent) {
      const d = (e?.data || {}) as { type?: string; phase?: string }
      if (d.type !== 'estudio-nav') return
      try { window.dispatchEvent(new Event(d.phase === 'done' ? 'navprogress:done' : 'navprogress:start')) } catch { /* ignore */ }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  return (
    <iframe
      ref={ref}
      src={`/estudio-conteudo/${file}?v=${APP_VERSION}${bust}`}
      title={title}
      onLoad={() => { syncTema(); try { window.dispatchEvent(new Event('navprogress:done')) } catch { /* ignore */ } }}
      className="h-full w-full border-0"
    />
  )
}
