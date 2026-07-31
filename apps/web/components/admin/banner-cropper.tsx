'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, ZoomIn, Move, Loader2 } from 'lucide-react'

/**
 * Recortador de banner: mostra a imagem original com um MOLDE (frame) na proporção alvo
 * (1920×500) por cima — o que estiver dentro do molde é o que aparece. Arraste para
 * mover e use o zoom; ao aplicar, renderiza só a área do molde num canvas de saída.
 * Igual aos editores de foto. Funciona com imagens fora de proporção (object-cover + pan/zoom).
 */
export function BannerCropper({
  src, outW = 1920, outH = 500, onApply, onCancel,
}: {
  src: string
  outW?: number; outH?: number
  onApply: (dataUrl: string) => void
  onCancel: () => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [frame, setFrame] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const [salvando, setSalvando] = useState(false)
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const medir = () => { const r = el.getBoundingClientRect(); setFrame({ w: r.width, h: r.height }) }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => setNat({ w: im.naturalWidth, h: im.naturalHeight })
    im.src = src
  }, [src])

  const baseScale = nat && frame.w ? Math.max(frame.w / nat.w, frame.h / nat.h) : 1
  const effScale = baseScale * zoom // natural px → frame px

  const clamp = useCallback((x: number, y: number) => {
    if (!nat || !frame.w) return { x, y }
    const maxX = Math.max(0, (nat.w * effScale - frame.w) / 2)
    const maxY = Math.max(0, (nat.h * effScale - frame.h) / 2)
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) }
  }, [nat, frame, effScale])

  // Re-clampa ao mudar o zoom (evita mostrar vazio nas bordas).
  useEffect(() => { const c = clamp(tx, ty); if (c.x !== tx || c.y !== ty) { setTx(c.x); setTy(c.y) } }, [zoom]) // eslint-disable-line react-hooks/exhaustive-deps

  function onDown(e: React.PointerEvent) { drag.current = { x: e.clientX, y: e.clientY, tx, ty }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }
  function onMove(e: React.PointerEvent) {
    if (!drag.current) return
    const c = clamp(drag.current.tx + (e.clientX - drag.current.x), drag.current.ty + (e.clientY - drag.current.y))
    setTx(c.x); setTy(c.y)
  }
  function onUp() { drag.current = null }

  function aplicar() {
    const img = imgRef.current
    if (!img || !nat || !frame.w) return
    setSalvando(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = outW; canvas.height = outH
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas')
      // Retângulo-fonte (no espaço da imagem) correspondente ao molde inteiro.
      const sw = frame.w / effScale
      const sh = frame.h / effScale
      const sx = nat.w / 2 - (frame.w / 2 + tx) / effScale
      const sy = nat.h / 2 - (frame.h / 2 + ty) / effScale
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH)
      onApply(canvas.toDataURL('image/jpeg', 0.9))
    } catch {
      // Imagem de outra origem (URL externa) pode "tainted" o canvas → usa a original.
      onApply(src)
    } finally { setSalvando(false) }
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b px-5 py-3.5">
          <div className="flex items-center gap-2"><Move className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-semibold">Ajustar área do banner</span></div>
          <button type="button" onClick={onCancel} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </header>

        <div className="p-5">
          <p className="mb-3 text-xs text-muted-foreground">Arraste a imagem e use o zoom para escolher a parte que aparece dentro do molde ({outW}×{outH}).</p>
          {/* Molde na proporção alvo — o que estiver aqui dentro é o que aparece. */}
          <div ref={frameRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            className="relative w-full cursor-grab touch-none select-none overflow-hidden rounded-lg border bg-black active:cursor-grabbing" style={{ aspectRatio: `${outW}/${outH}` }}>
            {nat && frame.w > 0 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img ref={imgRef} src={src} alt="" draggable={false}
                style={{ position: 'absolute', left: '50%', top: '50%', width: nat.w * effScale, height: nat.h * effScale, maxWidth: 'none', transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))` }} />
            )}
            {!nat && <div className="absolute inset-0 flex items-center justify-center text-white/70"><Loader2 className="h-6 w-6 animate-spin" /></div>}
            {/* Guias do molde */}
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/30" />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="h-1.5 flex-1 cursor-pointer accent-primary" />
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{zoom.toFixed(1)}×</span>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t px-5 py-3.5">
          <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          <button type="button" onClick={aplicar} disabled={!nat || salvando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aplicar recorte
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
