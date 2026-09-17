'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { X, Loader2, Move, Crop } from 'lucide-react'
import { cn } from '@/lib/utils'

type Rect = { x: number; y: number; w: number; h: number } // frações 0..1 da imagem (canto sup-esq)
type Modo = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const MIN = 0.06
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/**
 * Recorte da imagem de fundo da trilha com QUADRO REDIMENSIONÁVEL: arraste o quadro para posicionar e
 * puxe as alças das bordas/cantos ("linhas laterais") para mudar a PROPORÇÃO livremente — sai do formato
 * padrão e vira o formato desejado. Ao aplicar, rasteriza só a área do quadro (base64) na proporção
 * escolhida e devolve também a proporção (para casar o canvas da trilha).
 */
export function TrilhaFundoCropper({ src, aspectInicial, cropInicial, onCancel, onConfirm }: {
  src: string
  aspectInicial: number
  cropInicial?: Rect | null
  onCancel: () => void
  onConfirm: (crop: Rect, aspect: number) => void
}) {
  const imgElRef = useRef<HTMLImageElement>(null)
  const drag = useRef<{ modo: Modo; px: number; py: number; r: Rect } | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [disp, setDisp] = useState({ w: 0, h: 0 })
  const [rect, setRect] = useState<Rect>(cropInicial ?? { x: 0.1, y: 0.1, w: 0.8, h: 0.8 })

  useEffect(() => {
    if (!src) return
    const im = new Image()
    im.onload = () => setImg(im)
    im.onerror = () => toast.error('Não foi possível carregar a imagem.')
    im.src = src
  }, [src])

  const medir = useCallback(() => { const el = imgElRef.current; if (el) setDisp({ w: el.clientWidth, h: el.clientHeight }) }, [])
  useEffect(() => {
    medir(); const t = setTimeout(medir, 60)
    window.addEventListener('resize', medir)
    return () => { clearTimeout(t); window.removeEventListener('resize', medir) }
  }, [img, medir])

  // Quadro inicial = recorte salvo (se houver) OU maior retângulo da proporção inicial, centralizado.
  useEffect(() => {
    if (!img || cropInicial) return
    const ia = img.naturalWidth / img.naturalHeight
    let w = 1, h = 1
    if (ia >= aspectInicial) { h = 1; w = aspectInicial / ia } else { w = 1; h = ia / aspectInicial }
    setRect({ x: (1 - w) / 2, y: (1 - h) / 2, w, h })
  }, [img, aspectInicial, cropInicial])

  function onDown(modo: Modo) {
    return (e: React.PointerEvent) => {
      e.stopPropagation()
      drag.current = { modo, px: e.clientX, py: e.clientY, r: rect }
      try { (e.target as HTMLElement).setPointerCapture(e.pointerId) } catch { /* ok */ }
    }
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current; if (!d || !disp.w) return
    const dx = (e.clientX - d.px) / disp.w
    const dy = (e.clientY - d.py) / disp.h
    let { x, y, w, h } = d.r
    const m = d.modo
    if (m === 'move') { x = clamp01(d.r.x + dx); y = clamp01(d.r.y + dy); x = Math.min(x, 1 - w); y = Math.min(y, 1 - h) }
    else {
      if (m.includes('e')) w = Math.max(MIN, Math.min(1 - d.r.x, d.r.w + dx))
      if (m.includes('s')) h = Math.max(MIN, Math.min(1 - d.r.y, d.r.h + dy))
      if (m.includes('w')) { const nx = Math.min(d.r.x + dx, d.r.x + d.r.w - MIN); x = Math.max(0, nx); w = d.r.w + (d.r.x - x) }
      if (m.includes('n')) { const ny = Math.min(d.r.y + dy, d.r.y + d.r.h - MIN); y = Math.max(0, ny); h = d.r.h + (d.r.y - y) }
    }
    setRect({ x, y, w, h })
  }
  function onUp() { drag.current = null }

  const aspectAtual = img ? (rect.w * img.naturalWidth) / (rect.h * img.naturalHeight) : aspectInicial

  function confirmar() {
    if (!img) return
    const r: Rect = { x: Math.round(rect.x * 1e4) / 1e4, y: Math.round(rect.y * 1e4) / 1e4, w: Math.round(rect.w * 1e4) / 1e4, h: Math.round(rect.h * 1e4) / 1e4 }
    onConfirm(r, Math.max(0.25, Math.min(4, Math.round(aspectAtual * 1000) / 1000)))
  }

  const box = { left: rect.x * disp.w, top: rect.y * disp.h, w: rect.w * disp.w, h: rect.h * disp.h }
  const handle = 'absolute z-10 h-3 w-3 rounded-full border-2 border-white bg-primary shadow'

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-2xl rounded-2xl border bg-card p-4 shadow-2xl">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Ajustar imagem de fundo</h3>
          <button onClick={onCancel} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Move className="h-3.5 w-3.5" /> Arraste o quadro p/ posicionar e puxe as alças das bordas p/ mudar a proporção. Só a parte clara aparece.</p>

        <div className="relative mx-auto flex max-h-[58vh] items-center justify-center overflow-hidden rounded-xl bg-black/70">
          {src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img ref={imgElRef} src={src} alt="" draggable={false} onLoad={medir}
              className="pointer-events-none block max-h-[58vh] max-w-full select-none" />
          )}
          {img && disp.w > 0 && (
            <div className="absolute cursor-move touch-none ring-2 ring-white"
              onPointerDown={onDown('move')} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              style={{ left: `calc(50% - ${disp.w / 2}px + ${box.left}px)`, top: `calc(50% - ${disp.h / 2}px + ${box.top}px)`, width: Math.max(8, box.w), height: Math.max(8, box.h), boxShadow: '0 0 0 100vmax rgba(0,0,0,0.6)' }}>
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }).map((_, i) => <div key={i} className="border border-white/25" />)}
              </div>
              {/* Alças de borda (linhas laterais) + cantos */}
              <span className={cn(handle, 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize')} onPointerDown={onDown('n')} onPointerMove={onMove} onPointerUp={onUp} />
              <span className={cn(handle, 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize')} onPointerDown={onDown('s')} onPointerMove={onMove} onPointerUp={onUp} />
              <span className={cn(handle, 'right-0 top-1/2 -translate-y-1/2 translate-x-1/2 cursor-ew-resize')} onPointerDown={onDown('e')} onPointerMove={onMove} onPointerUp={onUp} />
              <span className={cn(handle, 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize')} onPointerDown={onDown('w')} onPointerMove={onMove} onPointerUp={onUp} />
              <span className={cn(handle, 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize')} onPointerDown={onDown('nw')} onPointerMove={onMove} onPointerUp={onUp} />
              <span className={cn(handle, 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize')} onPointerDown={onDown('ne')} onPointerMove={onMove} onPointerUp={onUp} />
              <span className={cn(handle, 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize')} onPointerDown={onDown('sw')} onPointerMove={onMove} onPointerUp={onUp} />
              <span className={cn(handle, 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize')} onPointerDown={onDown('se')} onPointerMove={onMove} onPointerUp={onUp} />
            </div>
          )}
          {!img && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-white/70" /></div>}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Proporção: <strong className="tabular-nums">{aspectAtual.toFixed(2)}:1</strong></span>
          <div className="flex gap-2">
            <button onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
            <button onClick={confirmar} disabled={!img} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60">
              <Crop className="h-4 w-4" /> Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
