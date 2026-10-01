'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { atualizarBanco, lerCapaMeta } from '@/app/admin/banco-questoes/actions'
import { type CapaMetaIn, type CapaViewCfg, DEFAULT_CAPA_VIEW } from '@/lib/capa-meta'
import { BANCO_CORES } from '@/lib/banco-visual'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Check, ImagePlus, Trash2, RefreshCw, Palette, Crop } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ImageCropper, type CropState } from '@/app/admin/simulados/criar/image-cropper'
import { CapaEditorPro, type CapaEditorValue } from '@/components/admin/capa-editor-pro'
import { CapaCard } from '@/components/aluno/capa-card'
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
 * imagem do CARD (editor profissional, enquadrada separadamente p/ pôster 4:5 e ticket 4:3). O card do
 * aluno fica IDÊNTICO às prévias (render não-destrutivo por CSS). */
export function BancoPersonalizar({
  banco,
  cardView = 'poster',
  titulo = 'Personalizar banco',
  subtitulo = 'Cor, ícone e imagem de capa',
  badge = 'Banco de questões',
  mostrarNome = true,
  semCabecalho = false,
  autoSalvar = false,
}: {
  banco: Banco
  cardView?: CardView
  /** Rótulos sobrepostos p/ reuso fora do Banco (ex.: aba Personalizar do simulado). */
  titulo?: string
  subtitulo?: string
  badge?: string
  /** Oculta o campo "Nome" (no simulado o nome é editado em Configurações). O nome salvo mantém o valor recebido. */
  mostrarNome?: boolean
  /** Oculta o cabeçalho interno do card (quando a área já tem um título de seção próprio). */
  semCabecalho?: boolean
  /** Salva sozinho (debounce) ao mudar cor/imagens e esconde o botão — usado na aba Configurações do simulado. */
  autoSalvar?: boolean
}) {
  const router = useRouter()
  const bannerRef = useRef<HTMLInputElement>(null)
  const [nome, setNome] = useState(banco.nome)
  const [cor, setCor] = useState<string | null>(banco.cor)
  const [capa, setCapa] = useState<string | null>(banco.capa_url)             // banner largo (capa_url)
  // Imagem do CARD — editor profissional não-destrutivo: original + enquadramento por formato.
  const [capaCard, setCapaCard] = useState<CapaEditorValue>({ orig: banco.capa_card_url ?? null, poster: { ...DEFAULT_CAPA_VIEW }, ticket: { ...DEFAULT_CAPA_VIEW } })
  const [salvando, setSalvando] = useState(false)
  // Editor de recorte do BANNER (pan&zoom) — aberto ao escolher OU ao "Ajustar".
  const [cropper, setCropper] = useState<{ file?: File; src?: string; aspect: number; titulo: string; zoom?: number; center?: { x: number; y: number } } | null>(null)
  const origBanner = useRef<File | string | null>(banco.capa_url)
  const cropBanner = useRef<CropState | null>(null)

  // Carrega o capa_meta salvo: original + enquadramento do card (pôster/ticket) e recorte do banner.
  useEffect(() => {
    lerCapaMeta(banco.id).then((meta) => {
      if (meta?.card) {
        setCapaCard((prev) => ({
          orig: meta.card?.orig ?? prev.orig,
          poster: (meta.card?.poster as CapaViewCfg | undefined) ?? prev.poster,
          ticket: (meta.card?.ticket as CapaViewCfg | undefined) ?? prev.ticket,
        }))
      }
      if (meta?.banner) { if (meta.banner.orig) origBanner.current = meta.banner.orig; if (meta.banner.crop) cropBanner.current = meta.banner.crop as CropState }
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banco.id])

  const c = cor ?? '#6d28d9'
  const dimBanner = '2740 × 400 px'
  const chipDim = 'rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal tabular-nums text-muted-foreground'
  const aspectBanner = 2740 / 400

  function abrirCropperBanner(f: File | null) {
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    origBanner.current = f; cropBanner.current = null
    setCropper({ file: f, aspect: aspectBanner, titulo: 'Ajustar imagem de capa' })
  }
  function ajustarBanner() {
    const base = origBanner.current ?? capa
    if (!base) return
    const est = cropBanner.current
    const comum = { aspect: aspectBanner, titulo: 'Ajustar imagem de capa', zoom: est?.zoom, center: est ? { x: est.cx, y: est.cy } : undefined }
    if (base instanceof File) setCropper({ file: base, ...comum })
    else setCropper({ src: base, ...comum })
  }
  function aplicarCropBanner(base64: string, state: CropState) {
    setCropper(null); setCapa(base64); cropBanner.current = state
  }

  // Monta o capa_meta (ORIGINAL + enquadramento por formato / recorte do banner) p/ reeditar depois.
  async function montarMeta(): Promise<CapaMetaIn> {
    const card = capaCard.orig ? { orig: await origParaMeta(capaCard.orig), poster: capaCard.poster, ticket: capaCard.ticket } : null
    const banner = capa ? { orig: await origParaMeta(origBanner.current), crop: cropBanner.current } : null
    return { card, banner }
  }

  const [autoStatus, setAutoStatus] = useState<'idle' | 'salvando' | 'salvo' | 'erro'>('idle')

  const pendenteRef = useRef(false) // há mudança aguardando salvar (debounce pendente)?
  async function salvar(auto = false) {
    if (!nome.trim()) { if (!auto) toast.error('Informe um nome.'); return }
    if (auto) setAutoStatus('salvando'); else setSalvando(true)
    // capa_card_url (fallback de URL p/ quem não lê o capa_meta) = a ORIGINAL; o enquadramento vem do meta.
    const r = await atualizarBanco(banco.id, nome, cor, null, capa, capaCard.orig, await montarMeta())
    if (r.ok) pendenteRef.current = false
    if (auto) {
      setAutoStatus(r.ok ? 'salvo' : 'erro')
      if (!r.ok) toast.error(r.error ?? 'Erro ao salvar')
      else router.refresh() // reflete a mudança nas prévias/board sem recarregar a página
    } else {
      setSalvando(false)
      if (r.ok) { toast.success('Personalização salva'); router.refresh() } else toast.error(r.error ?? 'Erro ao salvar')
    }
  }

  // Auto-save (debounce) ao mudar cor/imagens/nome. Não salva no meio do recorte do banner.
  const salvarRef = useRef(salvar)
  salvarRef.current = salvar
  const autoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const montadoRef = useRef(false)
  useEffect(() => {
    if (!autoSalvar) return
    if (!montadoRef.current) { montadoRef.current = true; return }
    if (cropper) return
    pendenteRef.current = true
    clearTimeout(autoTimer.current)
    autoTimer.current = setTimeout(() => void salvarRef.current(true), 800)
    return () => clearTimeout(autoTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome, cor, capa, capaCard, autoSalvar])

  // Flush no DESMONTE: se o usuário sair da aba antes do debounce, salva na hora (senão a mudança
  // se perdia → parecia "não salvou"). fire-and-forget: o server action conclui + revalida o board.
  useEffect(() => () => { if (autoSalvar && pendenteRef.current) void salvarRef.current(true) }, [autoSalvar])

  const btnOverlay = 'inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70'
  // Config do formato ATIVO (segue o toggle do console) p/ a prévia "em contexto".
  const cfgAtivo = cardView === 'ticket' ? capaCard.ticket : capaCard.poster
  const capaFallback = capaCard.orig ?? capa // sem imagem do card → cai no banner

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      {/* Formulário */}
      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        {!semCabecalho && (
          <div className="flex items-center gap-3 border-b px-5 py-3.5" style={{ background: `linear-gradient(90deg, ${c}1f, transparent 55%)` }}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: c }}><Palette className="h-5 w-5" /></span>
            <div>
              <h3 className="text-sm font-semibold leading-tight">{titulo}</h3>
              <p className="text-xs text-muted-foreground">{subtitulo}</p>
            </div>
          </div>
        )}
        <CardContent className="space-y-6 px-5 py-5">
          {mostrarNome && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nome</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)}
                className="w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
          )}

          {/* Imagem do card — editor profissional (enquadra pôster e ticket separadamente) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Imagem do card</label>
            <CapaEditorPro value={capaCard} onChange={setCapaCard} cor={c} icone={banco.icone} prepararImagem={redimensionar} />
          </div>

          {/* Capa (banner largo 16:4) — abaixo do card */}
          <div className="space-y-1.5">
            <label className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
              Imagem de capa (banner largo / capa comprida)
              <span className={chipDim}>{dimBanner}</span>
            </label>
            <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={(e) => { abrirCropperBanner(e.target.files?.[0] ?? null); e.target.value = '' }} />
            {capa ? (
              <div className="relative w-full overflow-hidden rounded-xl border" style={{ aspectRatio: String(aspectBanner) }}>
                <img src={capa} alt="Capa" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute right-2 top-2 flex gap-1.5">
                  <button type="button" onClick={ajustarBanner} className={btnOverlay}><Crop className="h-3.5 w-3.5" /> Ajustar</button>
                  <button type="button" onClick={() => bannerRef.current?.click()} className={btnOverlay}><RefreshCw className="h-3.5 w-3.5" /> Trocar</button>
                  <button type="button" onClick={() => setCapa(null)} className={cn(btnOverlay, 'hover:bg-rose-600')}><Trash2 className="h-3.5 w-3.5" /> Remover</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => bannerRef.current?.click()}
                className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
                <ImagePlus className="h-7 w-7" />
                <span className="text-sm font-medium">Adicionar imagem de capa</span>
                <span className="text-xs">Banner largo (capa comprida) — {dimBanner}. Topo do banco e fundo na trilha.</span>
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

          {autoSalvar ? (
            <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground" aria-live="polite">
              {autoStatus === 'salvando' && (<><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…</>)}
              {autoStatus === 'salvo' && (<><Check className="h-3.5 w-3.5 text-emerald-500" /> Alterações salvas automaticamente</>)}
              {autoStatus === 'erro' && (<span className="text-destructive">Não foi possível salvar a personalização.</span>)}
              {autoStatus === 'idle' && <span>As alterações são salvas automaticamente.</span>}
            </div>
          ) : (
            <div className="flex justify-end">
              <button type="button" onClick={() => salvar()} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar personalização
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pré-visualização do card "em contexto" — espelha o estilo do console (pôster × ticket). */}
      <div className="space-y-2">
        <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Prévia do card{cardView === 'ticket' ? ' · ticket' : ''}
        </p>
        {cardView === 'ticket' ? (
          <div className="relative flex h-32 w-full overflow-hidden rounded-2xl border bg-card shadow-sm sm:h-36">
            <div className="group/card relative h-full aspect-[4/3] shrink-0 overflow-hidden">
              <CapaCard capa={capaFallback} cor={c} icone={banco.icone} orig={capaCard.orig} cfg={cfgAtivo} />
              <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: `linear-gradient(110deg, transparent 45%, ${c})` }} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{badge}</p>
              <h3 className="line-clamp-2 text-sm font-bold leading-tight text-foreground sm:text-[15px]">{nome || 'Nome do banco'}</h3>
              <span className="inline-flex w-fit items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{banco.total} {banco.total === 1 ? 'questão' : 'questões'}</span>
            </div>
          </div>
        ) : (
          <div className="group/card relative aspect-[4/5] w-full overflow-hidden rounded-2xl border shadow-sm">
            <CapaCard capa={capaFallback} cor={c} icone={banco.icone} orig={capaCard.orig} cfg={cfgAtivo} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
            <div className="absolute inset-x-0 bottom-0 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-white/70">{badge}</p>
              <h3 className="mt-0.5 line-clamp-2 text-lg font-bold leading-tight text-white drop-shadow-sm">{nome || 'Nome do banco'}</h3>
              <span className="mt-2 inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur">{banco.total} {banco.total === 1 ? 'questão' : 'questões'}</span>
            </div>
          </div>
        )}
      </div>

      {cropper && <ImageCropper file={cropper.file} src={cropper.src} aspect={cropper.aspect} titulo={cropper.titulo} initialZoom={cropper.zoom} initialCenter={cropper.center} onCancel={() => setCropper(null)} onConfirm={aplicarCropBanner} />}
    </div>
  )
}
