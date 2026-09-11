'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Loader2, X, ImagePlus, RefreshCw, Trash2, Check, Move } from 'lucide-react'
import { cn } from '@/lib/utils'
import { atualizarDocumento } from '@/app/admin/leitura/actions'
import { capaComPos, posNumerica, comPosicao } from '@/lib/leitura/capa-pos'

const CORES = ['#6d28d9', '#2563eb', '#0891b2', '#059669', '#ca8a04', '#dc2626', '#db2777', '#475569']

/** Redimensiona a imagem para WebP q0.9 até `max` px (data-URL, como o editor de leitura). */
async function redimensionarImagem(file: File, max = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('canvas')
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const webp = canvas.toDataURL('image/webp', 0.9)
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.9)
}

/**
 * Personaliza a AULA (documento): nome, descrição, capa e cor. Abre ao criar uma aula nova
 * (fluxo do banco de aulas) e a partir do "Personalizar" na tabela. Salva via atualizarDocumento.
 */
export function PersonalizarAulaDialog({ aula, onClose, onSaved }: {
  aula: { id: string; titulo: string; descricao: string | null; capa_url: string | null; cor: string | null }
  onClose: () => void
  onSaved: () => void
}) {
  const capaRef = useRef<HTMLInputElement>(null)
  const [titulo, setTitulo] = useState(aula.titulo ?? '')
  const [descricao, setDescricao] = useState(aula.descricao ?? '')
  // `capa` guarda só a URL BASE (sem o fragmento de posição); `pos` é o object-position (0–100).
  const [capa, setCapa] = useState<string | null>(() => capaComPos(aula.capa_url).src)
  const [pos, setPos] = useState(() => posNumerica(aula.capa_url))
  const [cor, setCor] = useState<string | null>(aula.cor ?? null)
  const [processando, setProcessando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const arrasteRef = useRef<{ px: number; py: number; x: number; y: number; w: number; h: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function enviarCapa(file: File | null) {
    if (!file) return
    setProcessando(true)
    try { setCapa(await redimensionarImagem(file)); setPos({ x: 50, y: 50 }) } catch { toast.error('Falha ao processar a imagem.') } finally { setProcessando(false) }
  }

  // Arrastar a imagem dentro do quadro → ajusta object-position (invertido: puxar p/ baixo revela o topo).
  function onArrastarInicio(e: React.PointerEvent<HTMLDivElement>) {
    if (!capa) return
    const r = e.currentTarget.getBoundingClientRect()
    arrasteRef.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y, w: r.width, h: r.height }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onArrastarMover(e: React.PointerEvent<HTMLDivElement>) {
    const a = arrasteRef.current; if (!a) return
    const nx = a.x - ((e.clientX - a.px) / a.w) * 100
    const ny = a.y - ((e.clientY - a.py) / a.h) * 100
    setPos({ x: Math.max(0, Math.min(100, Math.round(nx))), y: Math.max(0, Math.min(100, Math.round(ny))) })
  }
  function onArrastarFim() { arrasteRef.current = null }

  async function salvar() {
    const t = titulo.trim()
    if (!t) { toast.error('Informe um nome para a aula.'); return }
    setSalvando(true)
    const capaFinal = capa ? comPosicao(capa, pos.x, pos.y) : null
    const r = await atualizarDocumento(aula.id, { titulo: t, descricao: descricao.trim() || null, capa_url: capaFinal, cor })
    setSalvando(false)
    if (r.ok) { toast.success('Aula personalizada'); onSaved() } else toast.error(r.error ?? 'Erro ao salvar')
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="text-sm font-semibold">Personalizar aula</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
          {/* Capa */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Capa da aula</label>
            <input ref={capaRef} type="file" accept="image/*" className="hidden" onChange={(e) => { enviarCapa(e.target.files?.[0] ?? null); e.target.value = '' }} />
            {capa ? (
              <div className="relative overflow-hidden rounded-xl border">
                <div
                  className="h-32 w-full cursor-move touch-none select-none"
                  onPointerDown={onArrastarInicio} onPointerMove={onArrastarMover} onPointerUp={onArrastarFim} onPointerCancel={onArrastarFim}
                  title="Arraste para ajustar a posição da imagem"
                >
                  <img src={capa} alt="Capa" draggable={false} className="pointer-events-none h-full w-full object-cover" style={{ objectPosition: `${pos.x}% ${pos.y}%` }} />
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-black/55 to-transparent px-2 py-1 text-[11px] font-medium text-white">
                  <Move className="h-3 w-3" /> arraste para posicionar
                </div>
                <div className="absolute right-1.5 top-1.5 flex gap-1">
                  <button type="button" onClick={() => capaRef.current?.click()} className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70"><RefreshCw className="h-3 w-3" /> Trocar</button>
                  <button type="button" onClick={() => { setCapa(null); setPos({ x: 50, y: 50 }) }} className="inline-flex items-center rounded-md bg-black/60 px-1.5 py-1 text-xs text-white backdrop-blur hover:bg-rose-600" aria-label="Remover capa"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => capaRef.current?.click()} disabled={processando}
                className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60">
                {processando ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                <span className="text-xs font-medium">{processando ? 'Processando…' : 'Adicionar capa'}</span>
              </button>
            )}
          </div>
          {/* Nome */}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Nome da aula</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus className="w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
          </div>
          {/* Descrição */}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Descrição</label>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="w-full resize-none rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
          </div>
          {/* Cor */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Cor</label>
            <div className="flex flex-wrap gap-1.5">
              {CORES.map((cc) => (
                <button key={cc} type="button" onClick={() => setCor(cc)} className={cn('h-7 w-7 rounded-full border-2 transition', cor === cc ? 'border-foreground' : 'border-transparent')} style={{ background: cc }} aria-label={cc} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
