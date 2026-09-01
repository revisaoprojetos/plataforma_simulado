'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, ImagePlus, RefreshCw, Trash2, Check, Crop } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BANCO_CORES } from '@/lib/banco-visual'
import { hospedarImagemCapa, cardViewAtual } from '../acoes'
import { useCriar, useGuardStep } from '../criar-context'
import { ImageCropper } from '../image-cropper'
import type { CardView } from '@/lib/card-view'

export default function PersonalizarPage() {
  useGuardStep(0)
  const { draft, patch } = useCriar()
  const bannerRef = useRef<HTMLInputElement>(null)
  const cardRef = useRef<HTMLInputElement>(null)
  const [subBanner, setSubBanner] = useState(false)
  const [subCard, setSubCard] = useState(false)
  const [cropper, setCropper] = useState<{ file?: File; src?: string; alvo: 'banner' | 'card'; aspect: number; titulo: string } | null>(null)
  // Estilo de card do console: em TICKET o recorte da capa é PAISAGEM (4:3), não o card 4:5.
  const [cardView, setCardView] = useState<CardView>('poster')
  useEffect(() => { cardViewAtual().then(setCardView).catch(() => {}) }, [])
  const aspectDe = (alvo: 'banner' | 'card') => (cardView === 'ticket' ? 4 / 3 : alvo === 'banner' ? 16 / 4 : 4 / 5)

  const cor = draft.cor ?? '#6d28d9'
  const imgCard = draft.capaCardUrl ?? draft.capaUrl

  // Ao escolher um arquivo, abre o editor de recorte (posição + zoom) na proporção certa.
  function abrirCropper(file: File | null, alvo: 'banner' | 'card') {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    setCropper({ file, alvo, aspect: aspectDe(alvo), titulo: alvo === 'banner' ? 'Ajustar banner' : 'Ajustar card' })
  }

  // Recebe o recorte já enquadrado (base64) → hospeda e guarda a URL.
  async function aplicarCrop(base64: string) {
    const alvo = cropper?.alvo
    setCropper(null)
    if (!alvo) return
    const setSub = alvo === 'banner' ? setSubBanner : setSubCard
    setSub(true)
    try {
      const r = await hospedarImagemCapa(base64)
      if (!r.ok || !r.url) { toast.error(r.error ?? 'Falha ao enviar a imagem.'); return }
      patch(alvo === 'banner' ? { capaUrl: r.url } : { capaCardUrl: r.url })
    } catch {
      toast.error('Falha ao enviar a imagem.')
    } finally {
      setSub(false)
    }
  }

  // Reabre o editor na imagem JÁ enviada (reajustar posição/zoom).
  function ajustarAtual(alvo: 'banner' | 'card') {
    const url = alvo === 'banner' ? draft.capaUrl : draft.capaCardUrl
    if (!url) return
    setCropper({ src: url, alvo, aspect: aspectDe(alvo), titulo: alvo === 'banner' ? 'Ajustar banner' : 'Ajustar card' })
  }

  return (
    <>
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {/* Nomes */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nome do banco</label>
            <input
              value={draft.bancoNome}
              onChange={(e) => patch({ bancoNome: e.target.value })}
              placeholder="Ex.: PGE-SP 2027 — Banco"
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nome do simulado</label>
            <input
              value={draft.simuladoNome}
              onChange={(e) => patch({ simuladoNome: e.target.value })}
              placeholder="Ex.: 1º Simulado PGE-SP"
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Imagens — cada área NA PROPORÇÃO real (banner largo × card 4:5 vertical) p/ não confundir. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <Dropzone
              label="Banner (capa larga / horizontal)"
              hint="Proporção 16:4 (horizontal) · ideal 1600×400 px."
              aspect="aspect-[16/4]"
              img={draft.capaUrl}
              processando={subBanner}
              inputRef={bannerRef}
              onPick={(f) => abrirCropper(f, 'banner')}
              onRemove={() => patch({ capaUrl: null })}
              onAjustar={() => ajustarAtual('banner')}
            />
          </div>
          <div className="w-full sm:w-56">
            <Dropzone
              label="Card (pôster vertical 4:5)"
              hint="Proporção 4:5 (vertical) · ideal 1280×1600 px."
              aspect="aspect-[4/5]"
              img={draft.capaCardUrl}
              processando={subCard}
              inputRef={cardRef}
              onPick={(f) => abrirCropper(f, 'card')}
              onRemove={() => patch({ capaCardUrl: null })}
              onAjustar={() => ajustarAtual('card')}
            />
          </div>
        </div>

        {/* Cor */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Cor</label>
          <div className="flex flex-wrap items-center gap-2">
            {BANCO_CORES.map((cc) => (
              <button
                key={cc}
                type="button"
                onClick={() => patch({ cor: cc })}
                title={cc}
                className={cn('flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110', draft.cor === cc && 'ring-2 ring-foreground ring-offset-2 ring-offset-background')}
                style={{ background: cc }}
              >
                {draft.cor === cc && <Check className="h-4 w-4 text-white" />}
              </button>
            ))}
            <label className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border" title="Cor personalizada">
              <span className="absolute inset-0" style={{ background: draft.cor && !BANCO_CORES.includes(draft.cor) ? draft.cor : 'conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }} />
              <input type="color" value={draft.cor ?? '#6d28d9'} onChange={(e) => patch({ cor: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>
        </div>
      </div>

      {/* Prévia do card */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prévia do card</p>
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border shadow-sm">
          {imgCard ? (
            <img src={imgCard} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">Simulado</p>
            <h3 className="mt-0.5 line-clamp-2 text-lg font-bold leading-tight text-white drop-shadow-sm">{draft.simuladoNome || 'Nome do simulado'}</h3>
            {draft.bancoNome && <span className="mt-2 inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur">{draft.bancoNome}</span>}
          </div>
        </div>
      </div>
    </div>
    {cropper && <ImageCropper file={cropper.file} src={cropper.src} aspect={cropper.aspect} titulo={cropper.titulo} onCancel={() => setCropper(null)} onConfirm={aplicarCrop} />}
    </>
  )
}

function Dropzone({ label, hint, aspect, img, processando, inputRef, onPick, onRemove, onAjustar }: {
  label: string
  hint: string
  aspect: string
  img: string | null
  processando: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  onPick: (f: File | null) => void
  onRemove: () => void
  onAjustar: () => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      {img ? (
        <div className="relative overflow-hidden rounded-xl border">
          <img src={img} alt="" className={cn('w-full object-cover', aspect)} />
          <div className="absolute right-2 top-2 flex gap-1.5">
            <button type="button" onClick={onAjustar} className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70"><Crop className="h-3.5 w-3.5" /> Ajustar</button>
            <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70"><RefreshCw className="h-3.5 w-3.5" /> Trocar</button>
            <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-rose-600"><Trash2 className="h-3.5 w-3.5" /> Remover</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={processando}
          className={cn('flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-3 text-center text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60', aspect)}
        >
          {processando ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
          <span className="text-sm font-medium">{processando ? 'Enviando…' : 'Adicionar imagem'}</span>
          <span className="text-[11px]">{hint}</span>
        </button>
      )}
    </div>
  )
}
