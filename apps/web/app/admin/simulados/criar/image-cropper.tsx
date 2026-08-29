'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { X, ZoomIn, ZoomOut, Loader2, Move } from 'lucide-react'
import { cn } from '@/lib/utils'

// Editor de recorte: arraste para posicionar + zoom. O QUADRO é exatamente a proporção final
// (banner/card), então "o que você vê é o que aparece". Ao aplicar, o recorte é RASTERIZADO num
// canvas na proporção alvo e devolvido como base64 (WebP/JPEG) — já enquadrado para o upload.
// Aceita um arquivo novo (`file`) OU a imagem já enviada (`src`, URL) para reajustar.
export function ImageCropper({ file, src, aspect, titulo, onCancel, onConfirm }: {
  file?: File
  src?: string
  aspect: number // largura / altura (banner ~4, card 0.8)
  titulo?: string
  onCancel: () => void
  onConfirm: (base64: string) => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [displaySrc, setDisplaySrc] = useState('')
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [frame, setFrame] = useState({ w: 0, h: 0 })
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let url = ''
    let revoga = false
    if (file) { url = URL.createObjectURL(file); revoga = true }
    else if (src) { url = src }
    setDisplaySrc(url)
    setImg(null)
    if (!url) return
    const im = new Image()
    if (!file) im.crossOrigin = 'anonymous' // URL remota → evita "tainted canvas" no toDataURL
    im.onload = () => setImg(im)
    im.src = url
    return () => { if (revoga) URL.revokeObjectURL(url) }
  }, [file, src])

  useEffect(() => {
    function medir() { const el = frameRef.current; if (el) setFrame({ w: el.clientWidth, h: el.clientHeight }) }
    medir()
    const t = setTimeout(medir, 50)
    window.addEventListener('resize', medir)
    return () => { clearTimeout(t); window.removeEventListener('resize', medir) }
  }, [img])

  const coverScale = img && frame.w ? Math.max(frame.w / img.naturalWidth, frame.h / img.naturalHeight) : 1
  const displayScale = coverScale * zoom
  const dispW = img ? img.naturalWidth * displayScale : 0
  const dispH = img ? img.naturalHeight * displayScale : 0
  const maxX = Math.max(0, (dispW - frame.w) / 2)
  const maxY = Math.max(0, (dispH - frame.h) / 2)
  const clamp = (o: { x: number; y: number }) => ({ x: Math.max(-maxX, Math.min(maxX, o.x)), y: Math.max(-maxY, Math.min(maxY, o.y)) })

  useEffect(() => { setOffset((o) => clamp(o)) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [zoom, frame.w, frame.h, img])

  function onDown(e: React.PointerEvent) { drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }; try { (e.target as HTMLElement).setPointerCapture(e.pointerId) } catch { /* ok */ } }
  function onMove(e: React.PointerEvent) { if (!drag.current) return; setOffset(clamp({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) })) }
  function onUp() { drag.current = null }

  function confirmar() {
    if (!img || !frame.w) return
    setSalvando(true)
    try {
      const long = 1600
      const outW = aspect >= 1 ? long : Math.round(long * aspect)
      const outH = aspect >= 1 ? Math.round(long / aspect) : long
      const canvas = document.createElement('canvas')
      canvas.width = outW; canvas.height = outH
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const topLeftX = (frame.w - dispW) / 2 + offset.x
      const topLeftY = (frame.h - dispH) / 2 + offset.y
      const sx = -topLeftX / displayScale
      const sy = -topLeftY / displayScale
      const sW = frame.w / displayScale
      const sH = frame.h / displayScale
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, sx, sy, sW, sH, 0, 0, outW, outH)
      let out: string
      try {
        const webp = canvas.toDataURL('image/webp', 0.92)
        out = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.92)
      } catch {
        toast.error('Não foi possível reajustar esta imagem. Use "Trocar" e envie o arquivo de novo.')
        return
      }
      onConfirm(out)
    } finally {
      setSalvando(false)
    }
  }

  const frameStyle: React.CSSProperties = aspect >= 1
    ? { aspectRatio: String(aspect), width: '100%' }
    : { aspectRatio: String(aspect), width: 'min(78vw, 300px)' }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-2xl rounded-2xl border bg-card p-4 shadow-2xl">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{titulo ?? 'Ajustar imagem'}</h3>
          <button onClick={onCancel} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Move className="h-3.5 w-3.5" /> Arraste para posicionar e use o zoom — a área abaixo é exatamente o que vai aparecer.</p>

        <div
          ref={frameRef}
          className="relative mx-auto touch-none select-none overflow-hidden rounded-xl border bg-muted"
          style={frameStyle}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        >
          {displaySrc && (
            <img
              src={displaySrc}
              alt=""
              draggable={false}
              crossOrigin={file ? undefined : 'anonymous'}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none cursor-move"
              style={{ width: dispW || undefined, height: dispH || undefined, transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }}
            />
          )}
          {!img && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-[var(--primary)]" aria-label="Zoom" />
          <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          <button onClick={confirmar} disabled={salvando || !img} className={cn('inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60')}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Aplicar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
