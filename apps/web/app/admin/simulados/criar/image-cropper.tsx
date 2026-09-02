'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { X, ZoomIn, ZoomOut, Loader2, Move } from 'lucide-react'
import { cn } from '@/lib/utils'

// Editor estilo "Pan & Zoom": mostra a IMAGEM INTEIRA e, por cima, um RETÂNGULO (a área que vai
// aparecer) na proporção alvo. O que fica FORA do retângulo aparece escurecido (mas visível) — nada é
// cortado de fato. Arraste o retângulo p/ posicionar e use o zoom p/ ele ficar menor (mais fechado).
// Ao aplicar, o retângulo é rasterizado num canvas na proporção alvo (base64) e devolve o ESTADO
// (zoom + centro normalizado) — assim dá p/ reeditar de onde parou, do original, sem reimportar.
export type CropState = { zoom: number; cx: number; cy: number }

export function ImageCropper({ file, src, aspect, titulo, initialZoom, initialCenter, onCancel, onConfirm }: {
  file?: File
  src?: string
  aspect: number // largura / altura (banner ~4, card 0.8, ticket 1.33)
  titulo?: string
  /** Estado inicial p/ REEDITAR de onde parou: zoom + centro do recorte (fração 0..1 da imagem). */
  initialZoom?: number
  initialCenter?: { x: number; y: number }
  onCancel: () => void
  onConfirm: (base64: string, state: CropState) => void
}) {
  const imgElRef = useRef<HTMLImageElement>(null)
  const drag = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null)
  const [displaySrc, setDisplaySrc] = useState('')
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [disp, setDisp] = useState({ w: 0, h: 0 }) // tamanho EXIBIDO da imagem (px)
  const [zoom, setZoom] = useState(initialZoom ?? 1)
  const [center, setCenter] = useState({ x: initialCenter?.x ?? 0.5, y: initialCenter?.y ?? 0.5 })
  const [salvando, setSalvando] = useState(false)

  // Carrega a imagem (arquivo novo OU URL existente p/ reajustar).
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

  // Mede o tamanho EXIBIDO da imagem (respeita max-w/max-h, mantém proporção).
  const medir = useCallback(() => { const el = imgElRef.current; if (el) setDisp({ w: el.clientWidth, h: el.clientHeight }) }, [])
  useEffect(() => {
    medir()
    const t = setTimeout(medir, 60)
    window.addEventListener('resize', medir)
    return () => { clearTimeout(t); window.removeEventListener('resize', medir) }
  }, [img, medir])

  const imgAspect = img ? img.naturalWidth / img.naturalHeight : 1
  // Maior retângulo (zoom=1) de proporção `aspect` que cabe na imagem — em FRAÇÃO da imagem.
  const maxW = imgAspect >= aspect ? aspect / imgAspect : 1
  const maxH = imgAspect >= aspect ? 1 : imgAspect / aspect
  const rw = maxW / zoom // largura do retângulo (fração)
  const rh = maxH / zoom // altura do retângulo (fração)
  const clampCentro = useCallback((c: { x: number; y: number }) => ({
    x: Math.min(1 - rw / 2, Math.max(rw / 2, c.x)),
    y: Math.min(1 - rh / 2, Math.max(rh / 2, c.y)),
  }), [rw, rh])
  useEffect(() => { setCenter((c) => clampCentro(c)) }, [clampCentro])

  const cc = clampCentro(center)
  // Retângulo em px, relativo ao canto sup-esq da imagem exibida.
  const rectPx = { left: (cc.x - rw / 2) * disp.w, top: (cc.y - rh / 2) * disp.h, w: rw * disp.w, h: rh * disp.h }

  function onDown(e: React.PointerEvent) { drag.current = { px: e.clientX, py: e.clientY, cx: cc.x, cy: cc.y }; try { (e.target as HTMLElement).setPointerCapture(e.pointerId) } catch { /* ok */ } }
  function onMove(e: React.PointerEvent) {
    if (!drag.current || !disp.w) return
    const dx = (e.clientX - drag.current.px) / disp.w
    const dy = (e.clientY - drag.current.py) / disp.h
    setCenter(clampCentro({ x: drag.current.cx + dx, y: drag.current.cy + dy }))
  }
  function onUp() { drag.current = null }

  function confirmar() {
    if (!img) return
    setSalvando(true)
    try {
      const long = 1600
      const outW = aspect >= 1 ? long : Math.round(long * aspect)
      const outH = aspect >= 1 ? Math.round(long / aspect) : long
      const canvas = document.createElement('canvas')
      canvas.width = outW; canvas.height = outH
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const sx = (cc.x - rw / 2) * img.naturalWidth
      const sy = (cc.y - rh / 2) * img.naturalHeight
      const sW = rw * img.naturalWidth
      const sH = rh * img.naturalHeight
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, sx, sy, sW, sH, 0, 0, outW, outH)
      let out: string
      try {
        const webp = canvas.toDataURL('image/webp', 0.92)
        out = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.92)
      } catch {
        toast.error('Não foi possível recortar esta imagem. Use "Trocar" e envie o arquivo de novo.')
        return
      }
      onConfirm(out, { zoom, cx: cc.x, cy: cc.y })
    } finally {
      setSalvando(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-2xl rounded-2xl border bg-card p-4 shadow-2xl">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{titulo ?? 'Ajustar imagem'}</h3>
          <button onClick={onCancel} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Move className="h-3.5 w-3.5" /> Arraste a área e use o zoom — só a parte clara vai aparecer; o resto da imagem fica guardado (dá pra reajustar depois).</p>

        {/* Palco: imagem INTEIRA + retângulo do recorte por cima (fora dele = escurecido). */}
        <div className="relative mx-auto flex max-h-[60vh] items-center justify-center overflow-hidden rounded-xl bg-black/70">
          {displaySrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img ref={imgElRef} src={displaySrc} alt="" draggable={false} onLoad={medir}
              crossOrigin={file ? undefined : 'anonymous'}
              className="pointer-events-none block max-h-[60vh] max-w-full select-none" />
          )}
          {img && disp.w > 0 && (
            <div
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
              className="absolute cursor-move touch-none rounded-[2px] ring-2 ring-white ring-offset-0"
              style={{
                left: `calc(50% - ${disp.w / 2}px + ${rectPx.left}px)`,
                top: `calc(50% - ${disp.h / 2}px + ${rectPx.top}px)`,
                width: Math.max(8, rectPx.w),
                height: Math.max(8, rectPx.h),
                boxShadow: '0 0 0 100vmax rgba(0,0,0,0.6)',
              }}
            >
              {/* Régua de terços (só visual). */}
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }).map((_, i) => <div key={i} className="border border-white/25" />)}
              </div>
            </div>
          )}
          {!img && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-white/70" /></div>}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-[var(--primary)]" aria-label="Zoom" />
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
