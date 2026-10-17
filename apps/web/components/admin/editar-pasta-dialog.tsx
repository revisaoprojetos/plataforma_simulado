'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { atualizarBanco, criarPastaFolder, lerCapaMeta, salvarPastaCardFade } from '@/app/admin/banco-questoes/actions'
import { type CapaMetaIn } from '@/lib/capa-meta'
import { BANCO_CORES } from '@/lib/banco-visual'
import { Loader2, X, Check, Palette, ImagePlus, Trash2, RefreshCw, Crop } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ImageCropper, type CropState } from '@/app/admin/simulados/criar/image-cropper'
import { CapaEditorPro, type CapaEditorValue } from '@/components/admin/capa-editor-pro'
import { CapaCard } from '@/components/aluno/capa-card'
import { DEFAULT_CAPA_VIEW, type CapaViewCfg } from '@/lib/capa-meta'
import { type CardView } from '@/lib/card-view'
import { useRegistrarSalvavel } from '@/components/admin/config-modulo-salvar'

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
export function EditarPastaDialog({ pasta, area, paiId = null, cardView = 'poster', cardFade = null, rotulo, generoM = false, inline = false, onClose, onSaved }: {
  pasta?: { id?: string; nome?: string; cor?: string | null; capa?: string | null; capaLarga?: string | null } | null
  /** Presente = modo CRIAR: cria a pasta nesta área e já aplica a personalização. */
  area?: 'banco' | 'simulado' | 'caderno' | 'leitura' | 'jurisprudencia'
  /** Config GLOBAL do fade lateral dos cards (tema.card_fade) — editável aqui p/ simulados/bancos. */
  cardFade?: { ativo?: boolean; cor?: string | null } | null
  /** Pasta-pai — quando definido, cria uma SUBPASTA dentro dela. */
  paiId?: string | null
  /** Estilo do card definido no console (tema.card_view / card_view_admin) — a prévia o espelha. */
  cardView?: CardView
  /** Rótulo do container (default "pasta"; ex.: "módulo" na leitura) + gênero p/ concordância. */
  rotulo?: string
  generoM?: boolean
  /** inline=true renderiza o form direto (sem modal/overlay) — usado na aba "Configurações" do módulo. */
  inline?: boolean
  onClose: () => void
  onSaved: (patch?: PastaPatch) => void
}) {
  const criar = !pasta?.id
  const rot = rotulo ?? 'pasta'
  const Rot = rot.charAt(0).toUpperCase() + rot.slice(1)
  const gp = (m: string, f: string) => (generoM ? m : f) // concordância de gênero
  const largaRef = useRef<HTMLInputElement>(null)
  const [nome, setNome] = useState(pasta?.nome ?? '')
  const [cor, setCor] = useState<string | null>(pasta?.cor ?? null)
  // Capa do CARD — editor não-destrutivo (igual ao simulado): guarda a imagem ORIGINAL + enquadramento
  // por formato (pôster/ticket); o card do aluno renderiza por CSS (CapaCard), sem recortar a imagem.
  const [capaCardPro, setCapaCardPro] = useState<CapaEditorValue>({ orig: pasta?.capa ?? null, poster: { ...DEFAULT_CAPA_VIEW }, ticket: { ...DEFAULT_CAPA_VIEW } })
  const [capaLarga, setCapaLarga] = useState<string | null>(pasta?.capaLarga ?? null)
  const [salvando, setSalvando] = useState(false)
  // Fade lateral do card DESTA pasta (por-pasta, tema.card_fade_pastas[id]). Só p/ simulados/bancos.
  const mostrarFade = area == null || area === 'simulado' || area === 'banco'
  const [fadeAtivo, setFadeAtivo] = useState<boolean>((cardFade as any)?.ativo === true)
  const [fadeCor, setFadeCor] = useState<string>(typeof (cardFade as any)?.cor === 'string' ? (cardFade as any).cor : '')
  // Editor de recorte (posição + zoom) na proporção certa, aberto ao escolher OU ao "Ajustar".
  const [cropper, setCropper] = useState<{ file?: File; src?: string; alvo: 'card' | 'banner'; aspect: number; titulo: string; zoom?: number; center?: { x: number; y: number } } | null>(null)
  // Fonte ORIGINAL + estado do recorte do BANNER — p/ REEDITAR de onde parou (re-recorta do original).
  const origBanner = useRef<File | string | null>(pasta?.capaLarga ?? null)
  const cropBanner = useRef<CropState | null>(null)
  // Salvar único (aba Config do módulo): compara com o snapshot inicial p/ saber se há pendência.
  const snap = () => JSON.stringify({ nome: nome.trim(), cor, capaCard: capaCardPro, capaLarga, fadeAtivo, fadeCor })
  const baseRef = useRef(JSON.stringify({ nome: (pasta?.nome ?? '').trim(), cor: pasta?.cor ?? null, capaCard: { orig: pasta?.capa ?? null, poster: { ...DEFAULT_CAPA_VIEW }, ticket: { ...DEFAULT_CAPA_VIEW } }, capaLarga: pasta?.capaLarga ?? null, fadeAtivo: (cardFade as any)?.ativo === true, fadeCor: typeof (cardFade as any)?.cor === 'string' ? (cardFade as any).cor : '' }))
  const dirty = !criar && snap() !== baseRef.current

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Carrega o recorte salvo (imagem ORIGINAL + zoom/posição) → o "Ajustar" reabre de onde parou.
  useEffect(() => {
    if (!pasta?.id) return
    lerCapaMeta(pasta.id).then((meta) => {
      if (meta?.card) setCapaCardPro((prev) => ({
        orig: meta.card?.orig ?? prev.orig,
        poster: (meta.card?.poster as CapaViewCfg | undefined) ?? prev.poster,
        ticket: (meta.card?.ticket as CapaViewCfg | undefined) ?? prev.ticket,
      }))
      if (meta?.banner) { if (meta.banner.orig) origBanner.current = meta.banner.orig; if (meta.banner.crop) cropBanner.current = meta.banner.crop as CropState }
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasta?.id])

  const c = cor ?? '#6d28d9'
  const aspectBanner = 2740 / 400
  // Banner (capa larga) — editor de recorte (pan&zoom). O CARD usa o CapaEditorPro (não-destrutivo).
  function abrirCropperBanner(f: File | null) {
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    origBanner.current = f; cropBanner.current = null
    setCropper({ file: f, alvo: 'banner', aspect: aspectBanner, titulo: 'Ajustar imagem larga' })
  }
  function ajustarBanner() {
    const base = origBanner.current ?? capaLarga
    if (!base) return
    const est = cropBanner.current
    const comum = { alvo: 'banner' as const, aspect: aspectBanner, titulo: 'Ajustar imagem larga', zoom: est?.zoom, center: est ? { x: est.cx, y: est.cy } : undefined }
    if (base instanceof File) setCropper({ file: base, ...comum })
    else setCropper({ src: base, ...comum })
  }
  function aplicarCropBanner(base64: string, state: CropState) {
    setCropper(null); setCapaLarga(base64); cropBanner.current = state
  }

  // capa_meta: CARD = ORIGINAL + enquadramento por formato (pôster/ticket, por CSS) → nunca recorta a
  // imagem. BANNER = original + recorte (pan&zoom). Só inclui a imagem que existe.
  async function montarMeta(): Promise<CapaMetaIn> {
    const card = capaCardPro.orig ? { orig: await origParaMeta(capaCardPro.orig), poster: capaCardPro.poster, ticket: capaCardPro.ticket } : null
    const banner = capaLarga ? { orig: await origParaMeta(origBanner.current), crop: cropBanner.current } : null
    return { card, banner }
  }

  // capa_url = imagem LARGA; capa_card_url = CAPA do card (imagem inteira).
  async function salvar() {
    if (!nome.trim()) { toast.error('Informe um nome.'); return }
    setSalvando(true)
    const meta = await montarMeta()
    const cf = { ativo: fadeAtivo, cor: fadeCor.trim() || null }
    if (criar) {
      const r = await criarPastaFolder(nome.trim(), paiId, area)
      if (!r.ok || !r.id) { setSalvando(false); toast.error(r.error ?? 'Erro ao criar'); return }
      await atualizarBanco(r.id, nome.trim(), cor, null, capaLarga, capaCardPro.orig, meta)
      if (mostrarFade) await salvarPastaCardFade(r.id, cf) // fade só desta pasta
      setSalvando(false)
      toast.success(paiId ? `Sub${rot} ${gp('criado', 'criada')}` : `${Rot} ${gp('criado', 'criada')}`); onSaved(); onClose()
    } else {
      const r = await atualizarBanco(pasta!.id!, nome.trim(), cor, null, capaLarga, capaCardPro.orig, meta)
      if (mostrarFade && r.ok) await salvarPastaCardFade(pasta!.id!, cf) // fade só desta pasta
      setSalvando(false)
      if (r.ok) { toast.success(`${Rot} ${gp('atualizado', 'atualizada')}`); onSaved({ nome: nome.trim(), cor, capa: capaCardPro.orig, capaLarga }); onClose() }
      else toast.error(r.error ?? 'Erro ao salvar')
    }
  }

  // Persistência usada pelo salvar ÚNICO da aba Config: grava sem toast/onClose e atualiza o baseline.
  async function salvarRegistrado(): Promise<boolean> {
    if (criar || !pasta?.id) return true
    if (!nome.trim()) return false
    setSalvando(true)
    const meta = await montarMeta()
    const cf = { ativo: fadeAtivo, cor: fadeCor.trim() || null }
    const r = await atualizarBanco(pasta.id, nome.trim(), cor, null, capaLarga, capaCardPro.orig, meta)
    if (mostrarFade && r.ok) await salvarPastaCardFade(pasta.id, cf)
    setSalvando(false)
    // NÃO chama onSaved aqui: ele faz router.refresh() e remontaria os demais forms no meio do salvar
    // único (perdendo pendências). O estado local já reflete o salvo; a página recarrega ao navegar.
    if (r.ok) { baseRef.current = snap(); return true }
    return false
  }
  // Dentro do provider (aba Config) esconde o botão próprio e entra no salvar único; fora, sem efeito.
  const noSalvarUnico = useRegistrarSalvavel(`${pasta?.id ?? 'novo'}:pasta`, dirty, salvarRegistrado)

  const btnOverlay = 'inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70'

  const dialogo = (
      <div role="dialog" aria-modal={!inline} className={cn('relative grid grid-cols-1 overflow-hidden rounded-2xl border bg-card md:grid-cols-[1fr_340px]', inline ? '' : 'animate-pop max-h-[90vh] w-full max-w-5xl shadow-2xl grid-rows-1')}>
        {/* Form (rola internamente — min-h-0 deixa a coluna encolher dentro do max-h do diálogo). */}
        <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4" /> {criar ? (paiId ? `${gp('Novo', 'Nova')} sub${rot}` : `${gp('Novo', 'Nova')} ${rot}`) : `Personalizar ${rot}`}</h3>
            {!inline && <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"><X className="h-4 w-4" /></button>}
          </div>
          <div className="space-y-5 p-5">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Nome</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !noSalvarUnico) salvar() }} autoFocus={!inline}
                className="w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>

            {/* Capa do card — editor NÃO-DESTRUTIVO (igual ao simulado): guarda a imagem inteira e enquadra
                por formato (pôster/ticket) via CSS. A imagem fora do enquadramento NUNCA é perdida. */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Capa (imagem do card)</label>
              <CapaEditorPro value={capaCardPro} onChange={setCapaCardPro} cor={c} icone={null} prepararImagem={(f) => redimensionar(f)} />
            </div>

            {/* Imagem larga (banner 16:4 — trilha e card ticket) */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Imagem larga (banner — usada na trilha e no card ticket)</label>
              <p className="text-[11px] text-muted-foreground/70">Bem larga (~7:1, horizontal) · ex.: 2740×400px · JPG, PNG ou WebP</p>
              <input ref={largaRef} type="file" accept="image/*" className="hidden" onChange={(e) => { abrirCropperBanner(e.target.files?.[0] ?? null); e.target.value = '' }} />
              {capaLarga ? (
                // Banner largo: tira de largura total na proporção real (~2740×400) — fica baixa, nunca gigante.
                <div className="relative w-full overflow-hidden rounded-xl border" style={{ aspectRatio: String(aspectBanner) }}>
                  <img src={capaLarga} alt="Imagem larga" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute right-2 top-2 flex gap-1.5">
                    <button type="button" onClick={ajustarBanner} className={btnOverlay}><Crop className="h-3.5 w-3.5" /> Ajustar</button>
                    <button type="button" onClick={() => largaRef.current?.click()} className={btnOverlay}><RefreshCw className="h-3.5 w-3.5" /> Trocar</button>
                    <button type="button" onClick={() => setCapaLarga(null)} className={cn(btnOverlay, 'hover:bg-rose-600')}><Trash2 className="h-3.5 w-3.5" /> Remover</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => largaRef.current?.click()}
                  className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-sm font-medium">Adicionar imagem larga</span>
                  <span className="text-[11px] text-muted-foreground/70">~7:1 · ex.: 2740×400px</span>
                </button>
              )}
            </div>

            {/* Cor — todas numa linha só (pop-up mais largo) */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Cor</label>
              <div className="flex items-center gap-1.5">
                {BANCO_CORES.map((cc) => (
                  <button key={cc} type="button" onClick={() => setCor(cc)} title={cc}
                    className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110', cor === cc && 'ring-2 ring-foreground ring-offset-2 ring-offset-card')}
                    style={{ background: cc }}>
                    {cor === cc && <Check className="h-3.5 w-3.5 text-white" />}
                  </button>
                ))}
                <label className="relative inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border" title="Cor personalizada">
                  <span className="absolute inset-0" style={{ background: cor && !BANCO_CORES.includes(cor) ? cor : 'conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }} />
                  <input type="color" value={cor ?? '#6d28d9'} onChange={(e) => setCor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
              </div>
            </div>

            {/* Fade lateral do card DESTA pasta — abaixo da Cor. Desliga / troca a cor do degradê à direita. */}
            {mostrarFade && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Fade lateral do card <span className="font-normal normal-case">(só esta pasta)</span></label>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={fadeAtivo} onChange={(e) => setFadeAtivo(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                    Mostrar o fade
                  </label>
                  {fadeAtivo && (
                    <span className="inline-flex items-center gap-2">
                      <label className="relative inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border" title="Cor do fade">
                        <span className="absolute inset-0" style={{ background: fadeCor || 'conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }} />
                        <input type="color" value={fadeCor || '#6d28d9'} onChange={(e) => setFadeCor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
                      </label>
                      {fadeCor
                        ? <button type="button" onClick={() => setFadeCor('')} className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">usar a cor da pasta</button>
                        : <span className="text-xs text-muted-foreground">(cor da pasta)</span>}
                    </span>
                  )}
                </div>
              </div>
            )}

            {!noSalvarUnico && (
              <div className="flex justify-end gap-2">
                {!inline && <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>}
                <button type="button" onClick={salvar} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
                  {salvando && <Loader2 className="h-4 w-4 animate-spin" />} {criar ? (paiId ? `Criar sub${rot}` : `Criar ${rot}`) : 'Salvar'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Prévia — como o ALUNO vê: pôster + ticket (+ banner, se houver). Preenche a coluna direita. */}
        <div className="hidden min-h-0 flex-col gap-4 overflow-y-auto border-l bg-muted/20 p-4 md:flex">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Prévia · como o aluno vê</p>

          {/* Card PÔSTER (4:5) */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Card pôster</p>
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border shadow-sm">
              <CapaCard capa={capaCardPro.orig ?? capaLarga} cor={c} orig={capaCardPro.orig} cfg={capaCardPro.poster} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
              <div className="absolute inset-x-0 bottom-0 z-20 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">{Rot}</p>
                <h3 className="mt-0.5 line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm">{nome || `Nome ${gp('do', 'da')} ${rot}`}</h3>
              </div>
            </div>
          </div>

          {/* Card TICKET — IGUAL ao ticket do aluno/admin: capa 4:3 à esquerda + nome à direita. */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Card ticket</p>
            <div className="relative flex h-28 w-full overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="relative h-full aspect-[4/3] shrink-0 overflow-hidden">
                <CapaCard capa={capaCardPro.orig ?? capaLarga} cor={c} orig={capaCardPro.orig} cfg={capaCardPro.ticket} />
                {fadeAtivo && <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: `linear-gradient(110deg, transparent 45%, ${fadeCor || c})` }} />}
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{Rot}</span>
                <h3 className="line-clamp-2 text-sm font-bold leading-tight text-foreground">{nome || `Nome ${gp('do', 'da')} ${rot}`}</h3>
              </div>
            </div>
          </div>

          {/* Banner (trilha) — só quando há imagem larga. */}
          {capaLarga && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Banner (trilha)</p>
              <div className="relative w-full overflow-hidden rounded-lg border" style={{ aspectRatio: String(aspectBanner) }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={capaLarga} alt="" className="absolute inset-0 h-full w-full object-cover" />
              </div>
            </div>
          )}

          <p className="mt-auto text-[10px] leading-relaxed text-muted-foreground/70">O card do aluno fica idêntico a estas prévias — o enquadramento é por CSS, a imagem inteira fica guardada.</p>
        </div>
      </div>
  )

  const cropperEl = cropper && <ImageCropper file={cropper.file} src={cropper.src} aspect={cropper.aspect} titulo={cropper.titulo} initialZoom={cropper.zoom} initialCenter={cropper.center} onCancel={() => setCropper(null)} onConfirm={aplicarCropBanner} />

  if (inline) return <>{dialogo}{cropperEl}</>

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="animate-page absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      {dialogo}
      {cropperEl}
    </div>,
    document.body,
  )
}
