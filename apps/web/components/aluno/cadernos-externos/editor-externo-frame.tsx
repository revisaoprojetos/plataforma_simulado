'use client'

import { useEffect, useRef, useState } from 'react'

/** Editor externo (BookStack/AFFiNE) em iframe de largura cheia. Sem secrets; so a URL publica. */
export function EditorExternoFrame({ src, titulo }: { src: string; titulo: string }) {
  const [carregou, setCarregou] = useState(false)
  const [demora, setDemora] = useState(false)
  const ref = useRef(false)
  ref.current = carregou

  useEffect(() => {
    setCarregou(false); setDemora(false)
    const t = setTimeout(() => { if (!ref.current) setDemora(true) }, 10000)
    return () => clearTimeout(t)
  }, [src])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      {(demora && !carregou) && (
        <div role="status" style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 12px', borderRadius: 12, background: 'var(--surface2)' }}>
          O editor esta demorando para carregar. Alguns navegadores (Safari/Firefox) bloqueiam cookies de terceiros em quadros.{' '}
          <a href={src} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)', fontWeight: 800 }}>Abrir em nova aba</a>
        </div>
      )}
      <div style={{ position: 'relative', width: '100%', height: 'calc(100dvh - 190px)', minHeight: 520, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--surface)' }}>
        {!carregou && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--muted)' }}>Carregando {titulo}...</div>
        )}
        <iframe
          title={titulo}
          src={src}
          onLoad={() => setCarregou(true)}
          allow="clipboard-read; clipboard-write; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        />
      </div>
      <div style={{ textAlign: 'right' }}>
        <a href={src} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: 'var(--brand)', fontWeight: 700 }}>Abrir em nova aba</a>
      </div>
    </div>
  )
}
