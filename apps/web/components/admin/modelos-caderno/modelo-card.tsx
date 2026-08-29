'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MoreVertical, Copy, FolderInput, Pencil, Trash2, Folder, Loader2, ExternalLink, ClipboardList, FileText, BookOpenCheck, BarChart3, LayoutTemplate, Download, FileType2, FileSpreadsheet, X, Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { PreviaBlocos } from '@/lib/caderno-teste/previa-blocos'
import { Previa } from '@/lib/caderno-teste/previa'
import { presetDoModelo, metaDaModalidade } from '@/lib/caderno-teste/tipos'
import { duplicarModelo, renomearModelo, excluirModelo, type ModeloRow } from '@/app/admin/modelos-caderno/actions'

const SEM_QUESTOES: never[] = [] // referência estável (evita re-render em loop no PreviaBlocos)

/** Conteúdo do modelo (preset+docEdit OU doc-backed), largura natural A4 = 794px. */
function ConteudoModelo({ item }: { item: any }) {
  const preset = presetDoModelo(item?.modalidade, item?.modelo)
  return preset
    ? <PreviaBlocos presetId={preset} questoes={SEM_QUESTOES} vars={{}} titulo={metaDaModalidade(item.modalidade).nome} docOverride={item.docEdit} />
    : <Previa item={item} questoes={SEM_QUESTOES} vars={{}} />
}

/** Prévia da 1ª folha do próprio caderno (A4 real, escalado à largura do card, não-interativo). */
export function ModeloMiniPrevia({ item }: { item: any }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.28)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => { const w = el.clientWidth; if (w > 10) setScale(w / 794) }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden bg-white">
      <div style={{ width: 794, transform: `scale(${scale})`, transformOrigin: 'top left' }} className="pointer-events-none">
        <ConteudoModelo item={item} />
      </div>
    </div>
  )
}

const A4_W = 794, A4_H = 1123 // px da folha A4 (base do render)
const NIVEIS_ZOOM = [0.5, 0.75, 1, 1.25, 1.5, 2]

type InfoPagina = { top: number; height: number }

/** Uma folha A4 mostrando a fatia (top/height MEDIDOS da folha real) do documento, escalada por `escala`. */
function PaginaModelo({ item, info, escala }: { item: any; info: InfoPagina; escala: number }) {
  return (
    <div className="relative overflow-hidden bg-white shadow-lg ring-1 ring-black/30" style={{ width: A4_W * escala, height: info.height * escala }}>
      <div className="pointer-events-none absolute left-0" style={{ top: -info.top * escala, width: A4_W, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
        <ConteudoModelo item={item} />
      </div>
    </div>
  )
}

/** Visualizador estilo Drive: miniaturas das páginas à esquerda + zoom + numeração + páginas roláveis. */
export function VisualizadorModelo({ item, onFechar }: { item: any; onFechar: () => void }) {
  const [zoom, setZoom] = useState(1)
  const [pagina, setPagina] = useState(1)
  // Medição das FOLHAS REAIS (o Previa/PreviaBlocos paginam em A4 com gap de 22px e folhas que podem
  // crescer) → top/height reais de cada folha, evitando página fantasma e desalinhamento por gap.
  const [paginas, setPaginas] = useState<InfoPagina[]>([{ top: 0, height: A4_H }])
  const medRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const el = medRef.current; if (!el) return
    const medir = () => {
      const cont = el.querySelector('.caderno-pronto') as HTMLElement | null
      const folhas = Array.from((cont ?? el).children).filter((c) => !(c as HTMLElement).getAttribute('aria-hidden')) as HTMLElement[]
      if (!folhas.length) return
      const base = (cont ?? el).getBoundingClientRect().top
      const info = folhas.map((f) => { const r = f.getBoundingClientRect(); return { top: Math.round(r.top - base), height: Math.round(r.height) } }).filter((p) => p.height > 10)
      if (info.length) setPaginas((prev) => (JSON.stringify(prev) === JSON.stringify(info) ? prev : info))
    }
    medir()
    const ro = new ResizeObserver(medir); ro.observe(el)
    const mo = new MutationObserver(medir); mo.observe(el, { childList: true, subtree: true, attributes: true })
    return () => { ro.disconnect(); mo.disconnect() }
  }, [item])
  const numPaginas = paginas.length

  // Página atual conforme o scroll.
  useEffect(() => {
    const sc = canvasRef.current; if (!sc) return
    const onScroll = () => {
      const sr = sc.getBoundingClientRect(); let atual = 1
      pageRefs.current.forEach((p, i) => { if (p && p.getBoundingClientRect().top - sr.top <= sr.height * 0.45) atual = i + 1 })
      setPagina(atual)
    }
    sc.addEventListener('scroll', onScroll)
    return () => sc.removeEventListener('scroll', onScroll)
  }, [numPaginas])

  const irPagina = (n: number) => { pageRefs.current[n - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setPagina(n) }
  const idxZoom = NIVEIS_ZOOM.indexOf(zoom) < 0 ? 2 : NIVEIS_ZOOM.indexOf(zoom)
  const btn = 'flex h-7 w-7 items-center justify-center rounded-md text-neutral-200 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Medidor oculto (largura A4 real) — pagina como na tela p/ medir as folhas reais. */}
      <div className="pointer-events-none fixed -left-[9999px] top-0 opacity-0" aria-hidden>
        <div ref={medRef} style={{ width: A4_W }}><ConteudoModelo item={item} /></div>
      </div>

      {/* Toolbar: numeração de página + zoom */}
      <div className="flex h-11 shrink-0 items-center justify-center gap-4 border-b border-white/10 bg-neutral-950/80 px-3 text-neutral-100">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-neutral-400">Página</span>
          <span className="min-w-[1.75rem] rounded bg-white/10 px-2 py-0.5 text-center font-medium">{pagina}</span>
          <span className="text-neutral-400">/ {numPaginas}</span>
        </div>
        <div className="h-5 w-px bg-white/15" />
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setZoom(NIVEIS_ZOOM[Math.max(0, idxZoom - 1)])} disabled={idxZoom <= 0} className={btn} aria-label="Reduzir zoom"><Minus className="h-4 w-4" /></button>
          <span className="w-14 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom(NIVEIS_ZOOM[Math.min(NIVEIS_ZOOM.length - 1, idxZoom + 1)])} disabled={idxZoom >= NIVEIS_ZOOM.length - 1} className={btn} aria-label="Aumentar zoom"><Plus className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Corpo: miniaturas + páginas */}
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-40 shrink-0 overflow-auto border-r border-white/10 bg-neutral-950/50 p-3 md:block">
          <div className="flex flex-col items-center gap-3">
            {paginas.map((info, i) => (
              <button key={i} type="button" onClick={() => irPagina(i + 1)} className="flex flex-col items-center gap-1 outline-none">
                <div className={cn('overflow-hidden rounded transition', pagina === i + 1 ? 'ring-2 ring-primary' : 'ring-1 ring-white/20 hover:ring-white/50')}>
                  <PaginaModelo item={item} info={info} escala={110 / A4_W} />
                </div>
                <span className={cn('text-[11px]', pagina === i + 1 ? 'font-semibold text-white' : 'text-neutral-400')}>{i + 1}</span>
              </button>
            ))}
          </div>
        </div>

        <div ref={canvasRef} className="min-h-0 flex-1 overflow-auto p-6" onClick={onFechar}>
          <div className="mx-auto flex w-fit flex-col items-center gap-5" onClick={(e) => e.stopPropagation()}>
            {paginas.map((info, i) => (
              <div key={i} ref={(el) => { pageRefs.current[i] = el }}>
                <PaginaModelo item={item} info={info} escala={zoom} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export const MODALIDADE_META: Record<string, { label: string; icon: typeof FileText }> = {
  folha_respostas: { label: 'Folha de respostas', icon: ClipboardList },
  caderno_questoes: { label: 'Caderno de enunciado', icon: FileText },
  caderno_completo: { label: 'Caderno completo', icon: BookOpenCheck },
  diagnostico: { label: 'Diagnóstico', icon: BarChart3 },
}

/** Pop-up de download do caderno: escolha entre Word e Excel. Portaled (o card fica sob `animate-page`). */
function BaixarCadernoDialog({ modeloId, nome, onFechar }: { modeloId: string; nome: string; onFechar: () => void }) {
  const [montado, setMontado] = useState(false)
  useEffect(() => { setMontado(true) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onFechar])

  function baixar(formato: 'word' | 'excel' | 'pdf') {
    if (formato === 'pdf') {
      // PDF: página de impressão (render fiel do sistema) + auto-print → salvar como PDF.
      window.open(`/imprimir/modelo/${encodeURIComponent(modeloId)}?auto=1`, '_blank', 'noopener')
      onFechar()
      return
    }
    // Word (.docx nativo no diagnóstico) e Excel: gerados na rota, download direto.
    const a = document.createElement('a')
    a.href = `/api/admin/modelos-caderno/exportar?id=${encodeURIComponent(modeloId)}&formato=${formato}`
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    onFechar()
  }

  if (!montado) return null
  const opcoes = [
    { fmt: 'pdf' as const, titulo: 'PDF', desc: 'Fiel à prévia (A4)', Icone: FileText, cor: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10', ring: 'group-hover:ring-rose-500/40' },
    { fmt: 'word' as const, titulo: 'Word', desc: 'Documento .doc', Icone: FileType2, cor: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/10', ring: 'group-hover:ring-sky-500/40' },
    { fmt: 'excel' as const, titulo: 'Excel', desc: 'Planilha .xlsx', Icone: FileSpreadsheet, cor: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', ring: 'group-hover:ring-emerald-500/40' },
  ]
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onFechar}>
      <div className="animate-pop w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold"><Download className="h-4 w-4 text-primary" /> Baixar caderno</h2>
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{nome}</p>
          </div>
          <button type="button" onClick={onFechar} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 mt-2 text-xs text-muted-foreground">Escolha o formato do arquivo:</p>
        <div className="grid grid-cols-3 gap-3">
          {opcoes.map(({ fmt, titulo, desc, Icone, cor, bg, ring }) => (
            <button
              key={fmt}
              type="button"
              onClick={() => baixar(fmt)}
              className={cn('group flex flex-col items-center gap-2 rounded-xl border bg-background p-4 text-center outline-none ring-1 ring-transparent transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/50', ring)}
            >
              <span className={cn('flex h-12 w-12 items-center justify-center rounded-xl', bg)}>
                <Icone className={cn('h-6 w-6', cor)} />
              </span>
              <span className="text-sm font-semibold">{titulo}</span>
              <span className="text-[11px] text-muted-foreground">{desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Item do menu inline da prévia (sem dropdown portalado, p/ ficar acima do visualizador). */
function ItemMenu({ icon: Icone, label, onClick, destrutivo }: { icon: typeof FileText; label: string; onClick: () => void; destrutivo?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground', destrutivo && 'text-destructive hover:bg-destructive/10 hover:text-destructive')}>
      <Icone className="h-4 w-4 shrink-0" /> {label}
    </button>
  )
}

/** Pop-up de prévia (estilo Google Drive): mostra a 1ª folha em grande + ações (editor/menu). */
function PreviaModeloDialog({ modelo, item, onFechar, onEditar, onRenomear, onDuplicar, onMover, onExcluir, onBaixar }: {
  modelo: ModeloRow; item: any; onFechar: () => void; onEditar: () => void
  onRenomear: () => void; onDuplicar: () => void; onMover?: () => void; onExcluir: () => void; onBaixar: () => void
}) {
  const [montado, setMontado] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)
  useEffect(() => { setMontado(true) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (menuAberto) setMenuAberto(false); else onFechar() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onFechar, menuAberto])
  if (!montado) return null
  const meta = MODALIDADE_META[modelo.modalidade ?? ''] ?? { label: 'Modelo', icon: LayoutTemplate }
  const Icone = meta.icon
  const temPrevia = !!item?.modalidade
  const fechaEExecuta = (fn: () => void) => () => { onFechar(); fn() }
  // Visualizador em tela cheia, estilo Drive: barra escura no topo + documento grande num fundo escuro.
  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-neutral-900/70 backdrop-blur-sm">
      {/* Barra superior */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 bg-neutral-950/90 px-3 text-neutral-100">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={onFechar} className="rounded-full p-2 text-neutral-300 transition-colors hover:bg-white/10 hover:text-white" aria-label="Fechar"><X className="h-5 w-5" /></button>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/25 text-primary-foreground"><Icone className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">{modelo.nome}</p>
            <p className="truncate text-[11px] leading-tight text-neutral-400">{meta.label}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onEditar} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
            <ExternalLink className="h-4 w-4" /> Abrir no editor
          </button>
          {/* Menu inline (sem portal) → fica dentro do visualizador (z-120), abre por cima e não por trás. */}
          <div className="relative">
            <button type="button" onClick={() => setMenuAberto((v) => !v)} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-200 outline-none ring-1 ring-white/15 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-primary/60" aria-label="Ações do modelo">
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuAberto && (
              <>
                <button type="button" aria-hidden className="fixed inset-0 z-[125] cursor-default" onClick={(e) => { e.stopPropagation(); setMenuAberto(false) }} />
                <div className="animate-pop absolute right-0 top-full z-[130] mt-1 w-48 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl ring-1 ring-foreground/10">
                  <ItemMenu icon={ExternalLink} label="Abrir / editar" onClick={onEditar} />
                  <ItemMenu icon={Download} label="Baixar caderno" onClick={onBaixar} />
                  <div className="my-1 h-px bg-border" />
                  <ItemMenu icon={Pencil} label="Renomear" onClick={fechaEExecuta(onRenomear)} />
                  <ItemMenu icon={Copy} label="Duplicar" onClick={fechaEExecuta(onDuplicar)} />
                  {onMover && <ItemMenu icon={FolderInput} label="Mover para pasta" onClick={fechaEExecuta(onMover)} />}
                  <div className="my-1 h-px bg-border" />
                  <ItemMenu icon={Trash2} label="Excluir" onClick={fechaEExecuta(onExcluir)} destrutivo />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Visualizador: miniaturas + zoom + numeração; clicar na área cinza (fora da folha) fecha. */}
      {temPrevia
        ? <VisualizadorModelo item={item} onFechar={onFechar} />
        : <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-neutral-400">Sem prévia</div>}
    </div>,
    document.body,
  )
}

export function ModeloCard({ modelo, onMover }: { modelo: ModeloRow; onMover?: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [baixarAberto, setBaixarAberto] = useState(false)
  const [previewAberto, setPreviewAberto] = useState(false)
  // 1 clique = prévia; clique duplo rápido = editor. O timer distingue os dois (o dblclick cancela a prévia).
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (clickTimer.current) clearTimeout(clickTimer.current) }, [])
  const abrirEditor = () => router.push(`/admin/modelos-caderno/${modelo.id}`)
  const c = modelo.cor ?? '#6d28d9'
  const capa = modelo.capa_card_url ?? modelo.capa_url
  const meta = MODALIDADE_META[modelo.modalidade ?? ''] ?? { label: 'Modelo', icon: LayoutTemplate }
  const Icone = meta.icon
  // Prévia da 1ª folha do próprio caderno (a partir do config salvo). Fallback: capa/gradiente.
  const item = (modelo.config as { item?: any } | null | undefined)?.item
  const temPrevia = !!item?.modalidade

  function duplicar() {
    start(async () => {
      const r = await duplicarModelo(modelo.id)
      if (r.ok) { toast.success('Modelo duplicado'); router.refresh() } else toast.error(r.error ?? 'Erro')
    })
  }
  async function renomear() {
    const nome = window.prompt('Novo nome do modelo:', modelo.nome)
    if (nome == null || !nome.trim()) return
    start(async () => {
      const r = await renomearModelo(modelo.id, nome)
      if (r.ok) { toast.success('Renomeado'); router.refresh() } else toast.error(r.error ?? 'Erro')
    })
  }
  async function excluir() {
    if (!(await confirmar({ titulo: 'Excluir modelo?', mensagem: `"${modelo.nome}" irá para a lixeira.`, confirmar: 'Excluir', destrutivo: true }))) return
    start(async () => {
      const r = await excluirModelo(modelo.id)
      if (r.ok) { toast.success('Modelo excluído'); router.refresh() } else toast.error(r.error ?? 'Erro')
    })
  }

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-1 hover:border-primary/50 hover:shadow-md hover:ring-1 hover:ring-primary/20">
      {/* Prévia da 1ª folha (como no pop-up de seleção) — moldura clara com o A4 real. */}
      <div className="relative aspect-[3/4] overflow-hidden border-b bg-muted/40">
        {temPrevia ? (
          <ModeloMiniPrevia item={item} />
        ) : capa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />
            <Icone className="absolute -right-6 -top-6 h-32 w-32 text-white/10" />
          </>
        )}
        {/* brilho sutil no hover */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/[0.04] to-transparent transition-opacity group-hover:from-black/[0.08]" />

        <div className="absolute right-2 top-2 z-30">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg bg-background/80 text-foreground outline-none shadow-sm ring-1 ring-border backdrop-blur-sm transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-primary/50" aria-label="Ações do modelo">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuItem render={<Link href={`/admin/modelos-caderno/${modelo.id}`} />}><ExternalLink className="mr-2 h-4 w-4" /> Abrir / editar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBaixarAberto(true)}><Download className="mr-2 h-4 w-4" /> Baixar caderno</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={renomear}><Pencil className="mr-2 h-4 w-4" /> Renomear</DropdownMenuItem>
              <DropdownMenuItem onClick={duplicar}><Copy className="mr-2 h-4 w-4" /> Duplicar</DropdownMenuItem>
              {onMover && <DropdownMenuItem onClick={onMover}><FolderInput className="mr-2 h-4 w-4" /> Mover para pasta</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={excluir} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Info do modelo */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
          <Icone className="h-3 w-3" /> {meta.label}
        </span>
        <h3 className="line-clamp-2 text-sm font-bold leading-tight">{modelo.nome}</h3>
      </div>

      {/* Cobre o card (o menu tem z maior): 1 clique = prévia; clique duplo rápido = editor. */}
      <button
        type="button"
        aria-label={modelo.nome}
        className="absolute inset-0 z-10 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        onClick={() => { if (clickTimer.current) return; clickTimer.current = setTimeout(() => { clickTimer.current = null; setPreviewAberto(true) }, 220) }}
        onDoubleClick={() => { if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null } abrirEditor() }}
      />

      {previewAberto && (
        <PreviaModeloDialog
          modelo={modelo}
          item={item}
          onFechar={() => setPreviewAberto(false)}
          onEditar={abrirEditor}
          onRenomear={renomear}
          onDuplicar={duplicar}
          onMover={onMover}
          onExcluir={excluir}
          onBaixar={() => { setPreviewAberto(false); setBaixarAberto(true) }}
        />
      )}
      {baixarAberto && <BaixarCadernoDialog modeloId={modelo.id} nome={modelo.nome} onFechar={() => setBaixarAberto(false)} />}
    </div>
  )
}

/** Card de pasta (folder) — chip compacto estilo Drive: ícone + nome + menu, numa linha. */
export function PastaModeloCard({ pasta, onAbrir, onPersonalizar, onExcluir, count }: {
  pasta: { id: string; nome: string; cor?: string | null; capa?: string | null }
  onAbrir: () => void; onPersonalizar: () => void; onExcluir: () => void; count: number
}) {
  const c = pasta.cor ?? '#6d28d9'
  return (
    <div className="group relative flex items-center gap-2.5 rounded-xl border bg-muted/40 px-3 py-2.5 transition-all hover:border-primary/50 hover:bg-primary/10 hover:shadow-sm">
      {/* Botão que cobre o card inteiro → clicar em qualquer lugar abre a pasta (menu fica por cima). */}
      <button type="button" onClick={onAbrir} className="absolute inset-0 z-10 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50" aria-label={`Abrir ${pasta.nome}`} />
      <Folder className="h-5 w-5 shrink-0" style={{ color: c }} fill={c} fillOpacity={0.9} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium" title={`${pasta.nome} · ${count} modelo(s)`}>{pasta.nome}</span>
      <div className="relative z-20 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50" aria-label="Ações da pasta">
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem onClick={onAbrir}><ExternalLink className="mr-2 h-4 w-4" /> Abrir</DropdownMenuItem>
            <DropdownMenuItem onClick={onPersonalizar}><Pencil className="mr-2 h-4 w-4" /> Personalizar</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onExcluir} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir pasta</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
