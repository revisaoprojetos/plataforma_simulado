'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { criarPastaModelo, atualizarPastaModelo } from '@/app/admin/modelos-caderno/actions'
import { BANCO_CORES } from '@/lib/banco-visual'
import { Loader2, X, Check, Palette, ImagePlus, Trash2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

async function redimensionar(file: File, max = 2800): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('canvas')
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  const webp = canvas.toDataURL('image/webp', 0.92)
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.92)
}

export type PastaModeloPatch = { nome: string; cor: string | null; capa: string | null; capaLarga: string | null }

/** Cria/personaliza uma PASTA da área de Modelos de Caderno (folder_area='caderno_modelo'). */
export function EditarPastaModeloDialog({ pasta, criarEmPai = null, criar = false, onClose, onSaved }: {
  pasta?: { id?: string; nome?: string; cor?: string | null; capa?: string | null; capaLarga?: string | null } | null
  /** Modo criar: pasta-pai (null = raiz). */
  criarEmPai?: string | null
  criar?: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const ehCriar = criar || !pasta?.id
  const cardRef = useRef<HTMLInputElement>(null)
  const largaRef = useRef<HTMLInputElement>(null)
  const [nome, setNome] = useState(pasta?.nome ?? '')
  const [cor, setCor] = useState<string | null>(pasta?.cor ?? null)
  const [capaCard, setCapaCard] = useState<string | null>(pasta?.capa ?? null)
  const [capaLarga, setCapaLarga] = useState<string | null>(pasta?.capaLarga ?? null)
  const [salvando, setSalvando] = useState(false)
  const [procCard, setProcCard] = useState(false)
  const [procLarga, setProcLarga] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const c = cor ?? '#6d28d9'

  async function onImg(f: File | null, setter: (v: string) => void, setProc: (v: boolean) => void, max: number) {
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    setProc(true)
    try { setter(await redimensionar(f, max)) } catch { toast.error('Falha ao processar a imagem.') } finally { setProc(false) }
  }

  async function salvar() {
    if (!nome.trim()) { toast.error('Informe um nome.'); return }
    setSalvando(true)
    try {
      let id = pasta?.id
      if (ehCriar) {
        const r = await criarPastaModelo(nome.trim(), criarEmPai)
        if (!r.ok || !r.id) { toast.error(r.error ?? 'Erro ao criar'); return }
        id = r.id
      }
      const r2 = await atualizarPastaModelo(id!, nome.trim(), cor, capaLarga, capaCard)
      if (!r2.ok) { toast.error(r2.error ?? 'Erro ao salvar'); return }
      toast.success(ehCriar ? (criarEmPai ? 'Subpasta criada' : 'Pasta criada') : 'Pasta atualizada')
      onSaved(); onClose()
    } finally { setSalvando(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative grid max-h-[88vh] w-full max-w-2xl grid-cols-1 overflow-hidden rounded-2xl border bg-card shadow-2xl md:grid-cols-[1fr_260px]">
        <div className="min-w-0 overflow-auto">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4" /> {ehCriar ? (criarEmPai ? 'Nova subpasta' : 'Nova pasta') : 'Personalizar pasta'}</h3>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-5 p-5">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nome</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') salvar() }} autoFocus
                className="w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Capa (imagem inteira — usada no card)</label>
              <input ref={cardRef} type="file" accept="image/*" className="hidden" onChange={(e) => onImg(e.target.files?.[0] ?? null, setCapaCard, setProcCard, 2000)} />
              {capaCard ? (
                <div className="relative overflow-hidden rounded-xl border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={capaCard} alt="Capa" className="h-32 w-full object-cover" />
                  <div className="absolute right-2 top-2 flex gap-1.5">
                    <button type="button" onClick={() => cardRef.current?.click()} className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70"><RefreshCw className="h-3.5 w-3.5" /> Trocar</button>
                    <button type="button" onClick={() => setCapaCard(null)} className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-rose-600"><Trash2 className="h-3.5 w-3.5" /> Remover</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => cardRef.current?.click()} disabled={procCard}
                  className="flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60">
                  {procCard ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
                  <span className="text-sm font-medium">{procCard ? 'Processando…' : 'Adicionar capa do card'}</span>
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Cor</label>
              <div className="flex flex-wrap items-center gap-2">
                {BANCO_CORES.map((cc) => (
                  <button key={cc} type="button" onClick={() => setCor(cc)} title={cc}
                    className={cn('flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110', cor === cc && 'ring-2 ring-foreground ring-offset-2 ring-offset-card')}
                    style={{ background: cc }}>
                    {cor === cc && <Check className="h-4 w-4 text-white" />}
                  </button>
                ))}
                <label className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border" title="Cor personalizada">
                  <span className="absolute inset-0" style={{ background: cor && !BANCO_CORES.includes(cor) ? cor : 'conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }} />
                  <input type="color" value={cor ?? '#6d28d9'} onChange={(e) => setCor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
              <button type="button" onClick={salvar} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />} {ehCriar ? (criarEmPai ? 'Criar subpasta' : 'Criar pasta') : 'Salvar'}
              </button>
            </div>
          </div>
        </div>

        <div className="hidden flex-col gap-2 border-l bg-muted/20 p-4 md:flex">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Prévia</p>
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border shadow-sm">
            {(capaCard ?? capaLarga) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={(capaCard ?? capaLarga)!} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
            <div className="absolute inset-x-0 bottom-0 z-20 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">Pasta</p>
              <h3 className="mt-0.5 line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm">{nome || 'Nome da pasta'}</h3>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
