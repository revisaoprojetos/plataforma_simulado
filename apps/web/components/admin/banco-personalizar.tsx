'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { atualizarBanco, lerCapaMeta } from '@/app/admin/banco-questoes/actions'
import { type CapaMetaIn } from '@/lib/capa-meta'
import { BANCO_CORES } from '@/lib/banco-visual'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Check, ImagePlus, Trash2, RefreshCw, Palette, Crop } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ImageCropper, type CropState } from '@/app/admin/simulados/criar/image-cropper'
import { type CardView } from '@/lib/card-view'

type Banco = { id: string; nome: string; cor: string | null; icone: string | null; capa_url: string | null; capa_card_url: string | null; total: number }

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
async function origParaMeta(o: File | string | null): Promise<string | null> {
  if (o instanceof File) return redimensionar(o)
  return o ?? null
}

/** Aba "Personalizar" de um banco: nome, cor e duas imagens — a CAPA/banner (capa_url, horizontal) e a
 * imagem do CARD (capa_card_url). Cada uma tem "Ajustar" (arraste + zoom). A PRÉVIA e o aspecto do
 * recorte da imagem do card seguem o estilo escolhido no console (pôster 4:5 × ticket paisagem). */
export function BancoPersonalizar({ banco, cardView = 'poster' }: { banco: Banco; cardView?: CardView }) {
  const router = useRouter()
  const bannerRef = useRef<HTMLInputElement>(null)
  const cardInputRef = useRef<HTMLInputElement>(null)
  const [nome, setNome] = useState(banco.nome)
  const [cor, setCor] = useState<string | null>(banco.cor)
  const [capa, setCapa] = useState<string | null>(banco.capa_url)             // banner largo (capa_url)
  const [capaCard, setCapaCard] = useState<string | null>(banco.capa_card_url) // imagem do card (capa_card_url)
  const [salvando, setSalvando] = useState(false)
  // Editor de recorte (posição + zoom) na proporção certa — aberto ao escolher OU ao "Ajustar".
  const [cropper, setCropper] = useState<{ file?: File; src?: string; alvo: 'card' | 'banner'; aspect: number; titulo: string; zoom?: number; center?: { x: number; y: number } } | null>(null)
  // Fonte ORIGINAL (não recortada) + estado do recorte por imagem — p/ REEDITAR de onde parou sem
  // perda progressiva (cada ajuste re-recorta do original). Inicia com a imagem salva.
  const origCard = useRef<File | string | null>(banco.capa_card_url)
  const origBanner = useRef<File | string | null>(banco.capa_url)
  const cropCard = useRef<CropState | null>(null)
  const cropBanner = useRef<CropState | null>(null)

  // Carrega o recorte salvo (imagem ORIGINAL + zoom/posição) → o "Ajustar" reabre de onde parou.
  useEffect(() => {
    lerCapaMeta(banco.id).then((meta) => {
      if (meta?.card) { if (meta.card.orig) origCard.current = meta.card.orig; if (meta.card.crop) cropCard.current = meta.card.crop as CropState }
      if (meta?.banner) { if (meta.banner.orig) origBanner.current = meta.banner.orig; if (meta.banner.crop) cropBanner.current = meta.banner.crop as CropState }
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banco.id])

  const c = cor ?? '#6d28d9'
  // O card usa a imagem própria (capa_card_url); se vazia, cai para o banner (capa_url).
  const imgCard = capaCard ?? capa
  const tituloCrop = (alvo: 'card' | 'banner') => (alvo === 'banner' ? 'Ajustar imagem de capa' : 'Ajustar imagem do card')
  // O recorte segue o CARD VIEW ATIVO: em TICKET tudo é PAISAGEM (4:3, deitado, como o card ticket
  // exibe a imagem); em PÔSTER o banner fica largo (16:4) e a imagem do card 4:5.
  // O BANNER (capa_url) é SEMPRE largo (~2740×400) — é usado nos banners/trilha, nunca no card/ticket,
  // então NÃO segue o toggle. Só a imagem do CARD adapta: ticket = paisagem (4:3), pôster = 4:5.
  const aspectDe = (alvo: 'card' | 'banner') => (alvo === 'banner' ? 2740 / 400 : cardView === 'ticket' ? 4 / 3 : 4 / 5)

  function abrirCropper(f: File | null, alvo: 'card' | 'banner') {
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    // Arquivo NOVO → vira o original desta imagem e zera o estado de recorte.
    if (alvo === 'card') { origCard.current = f; cropCard.current = null } else { origBanner.current = f; cropBanner.current = null }
    setCropper({ file: f, alvo, aspect: aspectDe(alvo), titulo: tituloCrop(alvo) })
  }
  function ajustarAtual(alvo: 'card' | 'banner') {
    // Reabre a partir do ORIGINAL (não do recorte anterior) + o zoom/posição salvos → continua de onde parou.
    const base = (alvo === 'card' ? origCard.current : origBanner.current) ?? (alvo === 'card' ? capaCard : capa)
    if (!base) return
    const est = alvo === 'card' ? cropCard.current : cropBanner.current
    const comum = { alvo, aspect: aspectDe(alvo), titulo: tituloCrop(alvo), zoom: est?.zoom, center: est ? { x: est.cx, y: est.cy } : undefined }
    if (base instanceof File) setCropper({ file: base, ...comum })
    else setCropper({ src: base, ...comum })
  }
  function aplicarCrop(base64: string, state: CropState) {
    const alvo = cropper?.alvo
    setCropper(null)
    // Guarda o recorte (p/ exibir/salvar) + o estado (p/ reeditar); NÃO mexe no original.
    if (alvo === 'card') { setCapaCard(base64); cropCard.current = state }
    else if (alvo === 'banner') { setCapa(base64); cropBanner.current = state }
  }

  // Monta o capa_meta (ORIGINAL + params) p/ reeditar depois. `capa` = banner, `capaCard` = card.
  async function montarMeta(): Promise<CapaMetaIn> {
    const card = capaCard ? { orig: await origParaMeta(origCard.current), crop: cropCard.current } : null
    const banner = capa ? { orig: await origParaMeta(origBanner.current), crop: cropBanner.current } : null
    return { card, banner }
  }

  async function salvar() {
    if (!nome.trim()) { toast.error('Informe um nome.'); return }
    setSalvando(true)
    const r = await atualizarBanco(banco.id, nome, cor, null, capa, capaCard, await montarMeta())
    setSalvando(false)
    if (r.ok) { toast.success('Personalização salva'); router.refresh() } else toast.error(r.error ?? 'Erro ao salvar')
  }

  const btnOverlay = 'inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70'

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      {/* Formulário */}
      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <div className="flex items-center gap-3 border-b px-5 py-3.5" style={{ background: `linear-gradient(90deg, ${c}1f, transparent 55%)` }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: c }}><Palette className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-semibold leading-tight">Personalizar banco</h3>
            <p className="text-xs text-muted-foreground">Cor, ícone e imagem de capa</p>
          </div>
        </div>
        <CardContent className="space-y-6 px-5 py-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>

          {/* Capa (banner largo 16:4) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Imagem de capa (banner largo / capa comprida)</label>
            <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={(e) => { abrirCropper(e.target.files?.[0] ?? null, 'banner'); e.target.value = '' }} />
            {capa ? (
              // Banner largo: tira de largura total na proporção real (~2740×400) — fica baixa, nunca gigante.
              <div className="relative w-full overflow-hidden rounded-xl border" style={{ aspectRatio: String(aspectDe('banner')) }}>
                <img src={capa} alt="Capa" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute right-2 top-2 flex gap-1.5">
                  <button type="button" onClick={() => ajustarAtual('banner')} className={btnOverlay}><Crop className="h-3.5 w-3.5" /> Ajustar</button>
                  <button type="button" onClick={() => bannerRef.current?.click()} className={btnOverlay}><RefreshCw className="h-3.5 w-3.5" /> Trocar</button>
                  <button type="button" onClick={() => setCapa(null)} className={cn(btnOverlay, 'hover:bg-rose-600')}><Trash2 className="h-3.5 w-3.5" /> Remover</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => bannerRef.current?.click()}
                className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
                <ImagePlus className="h-7 w-7" />
                <span className="text-sm font-medium">Adicionar imagem de capa</span>
                <span className="text-xs">Banner largo (capa comprida) — topo do banco e fundo na trilha. Alta resolução.</span>
              </button>
            )}
          </div>

          {/* Imagem do card — pôster (4:5) ou ticket (paisagem), conforme o console */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Imagem do card ({cardView === 'ticket' ? 'ticket' : 'pôster'})</label>
            <input ref={cardInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { abrirCropper(e.target.files?.[0] ?? null, 'card'); e.target.value = '' }} />
            {capaCard ? (
              // Miniatura na PROPORÇÃO do card do modo ativo (pôster 4:5 / ticket 4:3), altura fixa
              // (um pouco maior p/ os botões do topo não cobrirem a imagem).
              <div className="relative mx-auto max-w-full overflow-hidden rounded-xl border" style={{ aspectRatio: String(aspectDe('card')), height: 210 }}>
                <img src={capaCard} alt="Imagem do card" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute right-2 top-2 flex gap-1.5">
                  <button type="button" onClick={() => ajustarAtual('card')} className={btnOverlay}><Crop className="h-3.5 w-3.5" /> Ajustar</button>
                  <button type="button" onClick={() => cardInputRef.current?.click()} className={btnOverlay}><RefreshCw className="h-3.5 w-3.5" /> Trocar</button>
                  <button type="button" onClick={() => setCapaCard(null)} className={cn(btnOverlay, 'hover:bg-rose-600')}><Trash2 className="h-3.5 w-3.5" /> Remover</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => cardInputRef.current?.click()}
                className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
                <ImagePlus className="h-7 w-7" />
                <span className="text-sm font-medium">Adicionar imagem do card</span>
                <span className="text-xs">{cardView === 'ticket' ? 'Ideal deitada (paisagem). Se vazio, usa a capa do banner.' : 'Ideal vertical (pôster 4:5). Se vazio, usa a capa do banner.'}</span>
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

          <div className="flex justify-end">
            <button type="button" onClick={salvar} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar personalização
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Pré-visualização do card — espelha o estilo do console (pôster × ticket). */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prévia do card{cardView === 'ticket' ? ' · ticket' : ''}</p>
        {cardView === 'ticket' ? (
          // Ticket: imagem deitada à esquerda + infos à direita (usa a imagem do card, deitada).
          <div className="relative flex h-32 w-full overflow-hidden rounded-2xl border bg-card shadow-sm sm:h-36">
            <div className="relative h-full aspect-[4/3] shrink-0 overflow-hidden">
              {imgCard ? (
                <img src={imgCard} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
              ) : (
                <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />
              )}
              <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: `linear-gradient(110deg, transparent 45%, ${c})` }} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Banco de questões</p>
              <h3 className="line-clamp-2 text-sm font-bold leading-tight text-foreground sm:text-[15px]">{nome || 'Nome do banco'}</h3>
              <span className="inline-flex w-fit items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{banco.total} {banco.total === 1 ? 'questão' : 'questões'}</span>
            </div>
          </div>
        ) : (
          // Pôster (4:5): a imagem do card preenche tudo, com o nome sobreposto.
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border shadow-sm">
            {imgCard ? (
              <img src={imgCard} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
            <div className="absolute inset-x-0 bottom-0 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">Banco de questões</p>
              <h3 className="mt-0.5 line-clamp-2 text-lg font-bold leading-tight text-white drop-shadow-sm">{nome || 'Nome do banco'}</h3>
              <span className="mt-2 inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur">{banco.total} {banco.total === 1 ? 'questão' : 'questões'}</span>
            </div>
          </div>
        )}
      </div>

      {cropper && <ImageCropper file={cropper.file} src={cropper.src} aspect={cropper.aspect} titulo={cropper.titulo} initialZoom={cropper.zoom} initialCenter={cropper.center} onCancel={() => setCropper(null)} onConfirm={aplicarCrop} />}
    </div>
  )
}
