'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, ImagePlus, RefreshCw, Trash2, Check, Crop } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BANCO_CORES } from '@/lib/banco-visual'
import { hospedarImagemCapa } from '../acoes'
import { useCriar, useGuardStep } from '../criar-context'
import { ImageCropper } from '../image-cropper'
import { CapaEditorPro, type CapaEditorValue } from '@/components/admin/capa-editor-pro'
import { CapaCard } from '@/components/aluno/capa-card'
import { DEFAULT_CAPA_VIEW } from '@/lib/capa-meta'

/** Redimensiona a imagem em WebP q0.92 até `max` px (base p/ hospedar). */
async function redimensionar(file: File, max = 2400): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('canvas')
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const webp = canvas.toDataURL('image/webp', 0.92)
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.92)
}

export default function PersonalizarPage() {
  useGuardStep(0)
  const { draft, patch } = useCriar()
  const bannerRef = useRef<HTMLInputElement>(null)
  const [subBanner, setSubBanner] = useState(false)
  const [cropper, setCropper] = useState<{ file?: File; src?: string; aspect: number; titulo: string } | null>(null)

  const cor = draft.cor ?? '#6d28d9'
  const aspectBanner = 2740 / 400

  // Editor profissional do CARD (pôster + ticket, não-destrutivo). Hospeda a original na hora
  // (URL pequena no rascunho); o enquadramento por formato vai p/ o capa_meta no salvar final.
  const capaCard: CapaEditorValue = {
    orig: draft.capaCardMeta?.orig ?? draft.capaCardUrl ?? null,
    poster: draft.capaCardMeta?.poster ?? { ...DEFAULT_CAPA_VIEW },
    ticket: draft.capaCardMeta?.ticket ?? { ...DEFAULT_CAPA_VIEW },
  }
  function setCapaCard(v: CapaEditorValue) {
    patch({ capaCardMeta: v.orig ? { orig: v.orig, poster: v.poster, ticket: v.ticket } : null, capaCardUrl: v.orig })
  }
  async function prepararImagem(file: File): Promise<string> {
    const b64 = await redimensionar(file)
    const r = await hospedarImagemCapa(b64)
    if (!r.ok || !r.url) throw new Error(r.error ?? 'Falha ao enviar a imagem.')
    return r.url
  }

  // ── Banner (capa larga) — segue com o cropper pan&zoom. ──
  function abrirCropperBanner(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    setCropper({ file, aspect: aspectBanner, titulo: 'Ajustar banner' })
  }
  async function aplicarCropBanner(base64: string) {
    setCropper(null); setSubBanner(true)
    try {
      const r = await hospedarImagemCapa(base64)
      if (!r.ok || !r.url) { toast.error(r.error ?? 'Falha ao enviar a imagem.'); return }
      patch({ capaUrl: r.url })
    } catch { toast.error('Falha ao enviar a imagem.') } finally { setSubBanner(false) }
  }
  function ajustarBanner() {
    if (!draft.capaUrl) return
    setCropper({ src: draft.capaUrl, aspect: aspectBanner, titulo: 'Ajustar banner' })
  }

  return (
    <>
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {/* Nomes */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nome do banco</label>
            <input value={draft.bancoNome} onChange={(e) => patch({ bancoNome: e.target.value })} placeholder="Ex.: PGE-SP 2027 — Banco"
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nome do simulado</label>
            <input value={draft.simuladoNome} onChange={(e) => patch({ simuladoNome: e.target.value })} placeholder="Ex.: 1º Simulado PGE-SP"
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>

        {/* Imagem do card — editor profissional (enquadra pôster e ticket separadamente) */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Imagem do card</label>
          <CapaEditorPro value={capaCard} onChange={setCapaCard} cor={cor} icone={draft.icone} prepararImagem={prepararImagem} />
        </div>

        {/* Banner (capa larga / horizontal) */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Banner (capa larga / horizontal)</label>
          <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={(e) => { abrirCropperBanner(e.target.files?.[0] ?? null); e.target.value = '' }} />
          {draft.capaUrl ? (
            <div className="relative overflow-hidden rounded-xl border">
              <img src={draft.capaUrl} alt="" className="aspect-[2740/400] w-full object-cover" />
              <div className="absolute right-2 top-2 flex gap-1.5">
                <button type="button" onClick={ajustarBanner} className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70"><Crop className="h-3.5 w-3.5" /> Ajustar</button>
                <button type="button" onClick={() => bannerRef.current?.click()} className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70"><RefreshCw className="h-3.5 w-3.5" /> Trocar</button>
                <button type="button" onClick={() => patch({ capaUrl: null })} className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-rose-600"><Trash2 className="h-3.5 w-3.5" /> Remover</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => bannerRef.current?.click()} disabled={subBanner}
              className="flex aspect-[2740/400] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-3 text-center text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60">
              {subBanner ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
              <span className="text-sm font-medium">{subBanner ? 'Enviando…' : 'Adicionar banner'}</span>
              <span className="text-[11px]">Proporção larga (~2740×400) · usado nos banners/trilha, não no card.</span>
            </button>
          )}
        </div>

        {/* Cor */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Cor</label>
          <div className="flex flex-wrap items-center gap-2">
            {BANCO_CORES.map((cc) => (
              <button key={cc} type="button" onClick={() => patch({ cor: cc })} title={cc}
                className={cn('flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110', draft.cor === cc && 'ring-2 ring-foreground ring-offset-2 ring-offset-background')}
                style={{ background: cc }}>
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

      {/* Prévia do card (pôster) — WYSIWYG via CapaCard */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prévia do card</p>
        <div className="group/card relative aspect-[4/5] w-full overflow-hidden rounded-2xl border shadow-sm">
          <CapaCard capa={capaCard.orig ?? draft.capaUrl} cor={cor} icone={draft.icone} orig={capaCard.orig} cfg={capaCard.poster} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">Simulado</p>
            <h3 className="mt-0.5 line-clamp-2 text-lg font-bold leading-tight text-white drop-shadow-sm">{draft.simuladoNome || 'Nome do simulado'}</h3>
            {draft.bancoNome && <span className="mt-2 inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur">{draft.bancoNome}</span>}
          </div>
        </div>
      </div>
    </div>
    {cropper && <ImageCropper file={cropper.file} src={cropper.src} aspect={cropper.aspect} titulo={cropper.titulo} onCancel={() => setCropper(null)} onConfirm={aplicarCropBanner} />}
    </>
  )
}
