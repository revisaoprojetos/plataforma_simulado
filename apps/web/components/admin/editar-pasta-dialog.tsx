'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { atualizarBanco, criarPastaFolder, lerCapaMeta } from '@/app/admin/banco-questoes/actions'
import { type CapaMetaIn } from '@/lib/capa-meta'
import { BANCO_CORES } from '@/lib/banco-visual'
import { Loader2, X, Check, Palette, ImagePlus, Trash2, RefreshCw, Crop } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ImageCropper, type CropState } from '@/app/admin/simulados/criar/image-cropper'
import { type CardView } from '@/lib/card-view'

export type PastaPatch = { nome: string; cor: string | null; capa: string | null; capaLarga: string | null }

/** Redimensiona a imagem ORIGINAL (a guardar p/ reeditar) em WebP q0.92 até `max` px. */
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
/** ORIGINAL (File novo → base64 redimensionado; URL existente passa direto) p/ o capa_meta. */
async function origParaMeta(o: File | string | null): Promise<string | null> {
  if (o instanceof File) return redimensionar(o)
  return o ?? null
}

/** Personaliza uma PASTA (folder) de bancos: nome, cor e DUAS imagens — a CAPA (imagem inteira,
 * usada no card pôster = capa_card_url) e a IMAGEM LARGA (banner usado na trilha e no card ticket =
 * capa_url). Cada imagem tem "Ajustar" (arraste + zoom) para posicionar o recorte. A PRÉVIA espelha
 * o estilo de card escolhido no console (pôster ou ticket). */
export function EditarPastaDialog({ pasta, area, paiId = null, cardView = 'poster', onClose, onSaved }: {
  pasta?: { id?: string; nome?: string; cor?: string | null; capa?: string | null; capaLarga?: string | null } | null
  /** Presente = modo CRIAR: cria a pasta nesta área e já aplica a personalização. */
  area?: 'banco' | 'simulado' | 'caderno'
  /** Pasta-pai — quando definido, cria uma SUBPASTA dentro dela. */
  paiId?: string | null
  /** Estilo do card definido no console (tema.card_view / card_view_admin) — a prévia o espelha. */
  cardView?: CardView
  onClose: () => void
  onSaved: (patch?: PastaPatch) => void
}) {
  const criar = !pasta?.id
  const cardRef = useRef<HTMLInputElement>(null)
  const largaRef = useRef<HTMLInputElement>(null)
  const [nome, setNome] = useState(pasta?.nome ?? '')
  const [cor, setCor] = useState<string | null>(pasta?.cor ?? null)
  const [capaCard, setCapaCard] = useState<string | null>(pasta?.capa ?? null)
  const [capaLarga, setCapaLarga] = useState<string | null>(pasta?.capaLarga ?? null)
  const [salvando, setSalvando] = useState(false)
  // Editor de recorte (posição + zoom) na proporção certa, aberto ao escolher OU ao "Ajustar".
  const [cropper, setCropper] = useState<{ file?: File; src?: string; alvo: 'card' | 'banner'; aspect: number; titulo: string; zoom?: number; center?: { x: number; y: number } } | null>(null)
  // Fonte ORIGINAL + estado do recorte por imagem — p/ REEDITAR de onde parou (re-recorta do original).
  const origCard = useRef<File | string | null>(pasta?.capa ?? null)
  const origBanner = useRef<File | string | null>(pasta?.capaLarga ?? null)
  const cropCard = useRef<CropState | null>(null)
  const cropBanner = useRef<CropState | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Carrega o recorte salvo (imagem ORIGINAL + zoom/posição) → o "Ajustar" reabre de onde parou.
  useEffect(() => {
    if (!pasta?.id) return
    lerCapaMeta(pasta.id).then((meta) => {
      if (meta?.card) { if (meta.card.orig) origCard.current = meta.card.orig; if (meta.card.crop) cropCard.current = meta.card.crop as CropState }
      if (meta?.banner) { if (meta.banner.orig) origBanner.current = meta.banner.orig; if (meta.banner.crop) cropBanner.current = meta.banner.crop as CropState }
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasta?.id])

  const c = cor ?? '#6d28d9'
  const tituloCrop = (alvo: 'card' | 'banner') => (alvo === 'banner' ? 'Ajustar imagem larga' : 'Ajustar capa do card')
  // O recorte segue o CARD VIEW ATIVO: em TICKET tudo é PAISAGEM (4:3, como o card ticket exibe a
  // imagem deitada); em PÔSTER a imagem larga fica 16:4 e a capa do card 4:5. Assim o "Ajustar" bate
  // com o formato realmente exibido.
  // O BANNER (capa larga) é SEMPRE largo (~2740×400) — usado na trilha/banners, nunca no card/ticket,
  // então NÃO segue o toggle. Só a imagem do CARD adapta: ticket = paisagem (4:3), pôster = 4:5.
  const aspectDe = (alvo: 'card' | 'banner') => (alvo === 'banner' ? 2740 / 400 : cardView === 'ticket' ? 4 / 3 : 4 / 5)

  // Escolher um arquivo novo → vira o original desta imagem, zera o estado e abre o recorte.
  function abrirCropper(f: File | null, alvo: 'card' | 'banner') {
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    if (alvo === 'card') { origCard.current = f; cropCard.current = null } else { origBanner.current = f; cropBanner.current = null }
    setCropper({ file: f, alvo, aspect: aspectDe(alvo), titulo: tituloCrop(alvo) })
  }
  // "Ajustar": reabre a partir do ORIGINAL + o zoom/posição salvos → continua de onde parou (sem perda).
  function ajustarAtual(alvo: 'card' | 'banner') {
    const base = (alvo === 'card' ? origCard.current : origBanner.current) ?? (alvo === 'card' ? capaCard : capaLarga)
    if (!base) return
    const est = alvo === 'card' ? cropCard.current : cropBanner.current
    const comum = { alvo, aspect: aspectDe(alvo), titulo: tituloCrop(alvo), zoom: est?.zoom, center: est ? { x: est.cx, y: est.cy } : undefined }
    if (base instanceof File) setCropper({ file: base, ...comum })
    else setCropper({ src: base, ...comum })
  }
  // Recorte (base64) + estado voltam do editor → guarda o recorte e o estado; NÃO mexe no original.
  function aplicarCrop(base64: string, state: CropState) {
    const alvo = cropper?.alvo
    setCropper(null)
    if (alvo === 'card') { setCapaCard(base64); cropCard.current = state }
    else if (alvo === 'banner') { setCapaLarga(base64); cropBanner.current = state }
  }

  // Monta o capa_meta (ORIGINAL + params de recorte) p/ reeditar depois. Só inclui a imagem que existe.
  async function montarMeta(): Promise<CapaMetaIn> {
    const card = capaCard ? { orig: await origParaMeta(origCard.current), crop: cropCard.current } : null
    const banner = capaLarga ? { orig: await origParaMeta(origBanner.current), crop: cropBanner.current } : null
    return { card, banner }
  }

  // capa_url = imagem LARGA; capa_card_url = CAPA do card (imagem inteira).
  async function salvar() {
    if (!nome.trim()) { toast.error('Informe um nome.'); return }
    setSalvando(true)
    const meta = await montarMeta()
    if (criar) {
      const r = await criarPastaFolder(nome.trim(), paiId, area)
      if (!r.ok || !r.id) { setSalvando(false); toast.error(r.error ?? 'Erro ao criar'); return }
      await atualizarBanco(r.id, nome.trim(), cor, null, capaLarga, capaCard, meta)
      setSalvando(false)
      toast.success(paiId ? 'Subpasta criada' : 'Pasta criada'); onSaved(); onClose()
    } else {
      const r = await atualizarBanco(pasta!.id!, nome.trim(), cor, null, capaLarga, capaCard, meta)
      setSalvando(false)
      if (r.ok) { toast.success('Pasta atualizada'); onSaved({ nome: nome.trim(), cor, capa: capaCard, capaLarga }); onClose() }
      else toast.error(r.error ?? 'Erro ao salvar')
    }
  }

  const btnOverlay = 'inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70'

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="animate-page absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="animate-pop relative grid max-h-[88vh] w-full max-w-2xl grid-cols-1 overflow-hidden rounded-2xl border bg-card shadow-2xl md:grid-cols-[1fr_260px]">
        {/* Form */}
        <div className="min-w-0 overflow-auto">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4" /> {criar ? (paiId ? 'Nova subpasta' : 'Nova pasta') : 'Personalizar pasta'}</h3>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-5 p-5">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nome</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') salvar() }} autoFocus
                className="w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>

            {/* Capa do card (imagem inteira, 4:5) */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Capa (imagem inteira — usada no card)</label>
              <input ref={cardRef} type="file" accept="image/*" className="hidden" onChange={(e) => { abrirCropper(e.target.files?.[0] ?? null, 'card'); e.target.value = '' }} />
              {capaCard ? (
                // Miniatura na PROPORÇÃO do card do modo ativo (pôster 4:5 / ticket 4:3), altura fixa
                // (um pouco maior p/ os botões do topo não cobrirem a imagem).
                <div className="relative mx-auto max-w-full overflow-hidden rounded-xl border" style={{ aspectRatio: String(aspectDe('card')), height: 210 }}>
                  <img src={capaCard} alt="Capa" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute right-2 top-2 flex gap-1.5">
                    <button type="button" onClick={() => ajustarAtual('card')} className={btnOverlay}><Crop className="h-3.5 w-3.5" /> Ajustar</button>
                    <button type="button" onClick={() => cardRef.current?.click()} className={btnOverlay}><RefreshCw className="h-3.5 w-3.5" /> Trocar</button>
                    <button type="button" onClick={() => setCapaCard(null)} className={cn(btnOverlay, 'hover:bg-rose-600')}><Trash2 className="h-3.5 w-3.5" /> Remover</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => cardRef.current?.click()}
                  className="flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-sm font-medium">Adicionar capa do card</span>
                </button>
              )}
            </div>

            {/* Imagem larga (banner 16:4 — trilha e card ticket) */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Imagem larga (banner — usada na trilha e no card ticket)</label>
              <input ref={largaRef} type="file" accept="image/*" className="hidden" onChange={(e) => { abrirCropper(e.target.files?.[0] ?? null, 'banner'); e.target.value = '' }} />
              {capaLarga ? (
                // Banner largo: tira de largura total na proporção real (~2740×400) — fica baixa, nunca gigante.
                <div className="relative w-full overflow-hidden rounded-xl border" style={{ aspectRatio: String(aspectDe('banner')) }}>
                  <img src={capaLarga} alt="Imagem larga" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute right-2 top-2 flex gap-1.5">
                    <button type="button" onClick={() => ajustarAtual('banner')} className={btnOverlay}><Crop className="h-3.5 w-3.5" /> Ajustar</button>
                    <button type="button" onClick={() => largaRef.current?.click()} className={btnOverlay}><RefreshCw className="h-3.5 w-3.5" /> Trocar</button>
                    <button type="button" onClick={() => setCapaLarga(null)} className={cn(btnOverlay, 'hover:bg-rose-600')}><Trash2 className="h-3.5 w-3.5" /> Remover</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => largaRef.current?.click()}
                  className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-sm font-medium">Adicionar imagem larga</span>
                </button>
              )}
            </div>

            {/* Cor */}
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
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />} {criar ? (paiId ? 'Criar subpasta' : 'Criar pasta') : 'Salvar'}
              </button>
            </div>
          </div>
        </div>

        {/* Prévia do card da pasta — espelha o estilo do console (pôster × ticket). */}
        <div className="hidden flex-col gap-2 border-l bg-muted/20 p-4 md:flex">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Prévia{cardView === 'ticket' ? ' · ticket' : ''}</p>
          {cardView === 'ticket' ? (
            // Ticket: imagem deitada à esquerda + nome à direita. Usa a CAPA (capa_card_url) primeiro,
            // igual ao card ticket do admin (que exibe a capa deitada), caindo p/ a imagem larga.
            <div className="relative flex h-28 w-full overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="relative h-full aspect-[4/3] shrink-0 overflow-hidden">
                {(capaCard ?? capaLarga) ? (
                  <img src={(capaCard ?? capaLarga)!} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />
                )}
                <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: `linear-gradient(110deg, transparent 45%, ${c})` }} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Pasta</span>
                <h3 className="line-clamp-2 text-sm font-bold leading-tight text-foreground">{nome || 'Nome da pasta'}</h3>
              </div>
            </div>
          ) : (
            // Pôster (4:5): a imagem do card (capa inteira) preenche tudo, com o nome sobreposto.
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border shadow-sm">
              {(capaCard ?? capaLarga) ? (
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
          )}
        </div>
      </div>

      {cropper && <ImageCropper file={cropper.file} src={cropper.src} aspect={cropper.aspect} titulo={cropper.titulo} initialZoom={cropper.zoom} initialCenter={cropper.center} onCancel={() => setCropper(null)} onConfirm={aplicarCrop} />}
    </div>,
    document.body,
  )
}
