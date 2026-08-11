'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Loader2, Trash2, Eye, EyeOff, Megaphone, MessageSquareWarning, ImageIcon, Upload, X, Crop, Settings, Clapperboard, GripVertical } from 'lucide-react'
import { redimensionarImagem } from '@/lib/imagem'
import { BannerCropper } from '@/components/admin/banner-cropper'
import { BannerEditModal } from '@/components/admin/banner-edit-modal'
import { PopupCard, type PopupEstilo, type PopupPontas, type BannerTextoPos, type BannerTextoCor, type BannerTextoTam } from '@/components/aluno/banners-portal'

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f) })
}
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Switch } from '@/components/ui/switch'
import { criarBannerAction, toggleBannerAction, excluirBannerAction, reordenarBannersAction, toggleBannerDesempenhoAction } from '@/app/admin/configuracoes/banners/actions'

export type Banner = {
  id: string; tipo: 'banner' | 'popup' | 'hero'; titulo: string | null; mensagem: string | null
  imagem_url: string | null; link: string | null; cor: string | null; ativo: boolean; ordem: number
}

const TIPO_LABEL: Record<string, string> = { banner: 'banner', popup: 'pop-up', hero: 'destaque' }

const TABS = [
  { t: 'banner', label: 'Banner', Icon: Megaphone, vazio: 'Nenhum banner ainda (texto/link ou simulado).' },
  { t: 'popup', label: 'Pop-up', Icon: MessageSquareWarning, vazio: 'Nenhum pop-up ainda.' },
  { t: 'hero', label: 'Destaque', Icon: ImageIcon, vazio: 'Nenhum banner de destaque ainda.' },
] as const

/** Um banner de destaque que aponta para um simulado (/simulado/token) OU uma pasta de simulados
 *  (…?pasta=id) usa o FUNDO do simulado/pasta e ganha CTA na home do aluno (com contagem, no caso de pasta). */
export const ehBannerSimulado = (b: { tipo: string; link: string | null }) => b.tipo === 'hero' && !!b.link && (b.link.startsWith('/simulado/') || /[?&]pasta=/.test(b.link))

export type DestinoBanner = { label: string; href: string; grupo?: string }

export type DestaqueMap = Record<string, { ativo?: boolean; texto?: string; fadeAtivo?: boolean; fadeNivel?: number; popupEstilo?: PopupEstilo; popupPontas?: PopupPontas; bannerTextoPos?: BannerTextoPos; bannerTextoCor?: BannerTextoCor; bannerTextoTam?: BannerTextoTam; bannerOcultarTitulo?: boolean; bannerOcultarMensagem?: boolean }>

export function BannersManager({ banners, tenantId, destinos, desempenhoAtivo = false, destaques = {} }: { banners: Banner[]; tenantId?: string; destinos?: DestinoBanner[]; desempenhoAtivo?: boolean; destaques?: DestaqueMap }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [desempenho, setDesempenho] = useState(desempenhoAtivo)
  useEffect(() => { setDesempenho(desempenhoAtivo) }, [desempenhoAtivo])
  function alternarDesempenho(v: boolean) {
    setDesempenho(v) // otimista
    start(async () => {
      const r = await toggleBannerDesempenhoAction(v, tenantId)
      if (!r.ok) { toast.error(r.error ?? 'Falha ao salvar.'); setDesempenho(!v); return }
      toast.success(v ? 'Desempenho no banner ativado.' : 'Desempenho no banner desativado.')
      router.refresh()
    })
  }
  const [alvo, setAlvo] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)
  const [uiTipo, setUiTipo] = useState<'banner' | 'popup' | 'hero' | 'simulado'>('banner')
  const tipo: 'banner' | 'popup' | 'hero' = uiTipo === 'simulado' ? 'hero' : uiTipo
  const [titulo, setTitulo] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [imagem, setImagem] = useState('')
  const [link, setLink] = useState('')
  const [cor, setCor] = useState('#6366f1')
  const [destaqueAtivoN, setDestaqueAtivoN] = useState(true)
  const [destaqueTextoN, setDestaqueTextoN] = useState('')
  const [fadeAtivoN, setFadeAtivoN] = useState(true)
  const [fadeNivelN, setFadeNivelN] = useState(100)
  const [enviando, setEnviando] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const [editando, setEditando] = useState<Banner | null>(null)
  const [lista, setLista] = useState<Banner[]>(banners)
  useEffect(() => { setLista(banners) }, [banners])
  // Fecha o modal de criação no Esc.
  useEffect(() => {
    if (!criando) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCriando(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [criando])
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function persistirOrdem(nova: Banner[]) {
    setLista(nova) // otimista
    setAlvo('ordem')
    start(async () => {
      const r = await reordenarBannersAction(nova.map((b, i) => ({ id: b.id, ordem: i })), tenantId)
      setAlvo(null)
      if (!r.ok) { toast.error(r.error ?? 'Falha ao reordenar.'); setLista(banners); return }
      router.refresh()
    })
  }
  function soltarEm(destino: number) {
    if (dragIdx === null || dragIdx === destino) { setDragIdx(null); setOverIdx(null); return }
    // dragIdx/destino são índices na lista VISÍVEL (da aba). Reordena só a aba e recompõe a lista completa.
    const novaAba = [...visiveis]
    const [it] = novaAba.splice(dragIdx, 1)
    novaAba.splice(destino, 0, it)
    setDragIdx(null); setOverIdx(null)
    let k = 0
    const full = lista.map((b) => (pertenceAAba(b) ? novaAba[k++] : b))
    persistirOrdem(full)
  }

  async function onArquivo(f: File | null) {
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    // Pop-up: resize direto. Banner/Destaque: abre o RECORTADOR (molde 1920×500) com a original.
    if (tipo === 'popup') {
      setEnviando(true)
      try { setImagem(await redimensionarImagem(f, 900, 0.72)) }
      catch { toast.error('Falha ao processar a imagem.') }
      finally { setEnviando(false); if (fileRef.current) fileRef.current.value = '' }
      return
    }
    setEnviando(true)
    try { const url = await fileToDataUrl(f); setCropSrc(url); setCropOpen(true) }
    catch { toast.error('Falha ao ler a imagem.') }
    finally { setEnviando(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const simulados = (destinos ?? []).filter((d) => (d.grupo ?? 'Simulados') === 'Simulados')
  const pastasDest = (destinos ?? []).filter((d) => d.grupo === 'Pastas')
  const destSim = [...pastasDest, ...simulados] // opções da aba "Simulado": pasta (com contagem) ou simulado

  // Aba "Banner" agrupa banners de TEXTO/LINK e de SIMULADO (a sub-opção troca o uiTipo).
  // "Destaque" = hero sem link de simulado.
  const aba: 'banner' | 'popup' | 'hero' = uiTipo === 'simulado' ? 'banner' : uiTipo
  const pertenceAAba = (b: Banner, a: 'banner' | 'popup' | 'hero' = aba) =>
    a === 'banner' ? (b.tipo === 'banner' || ehBannerSimulado(b))
      : a === 'hero' ? (b.tipo === 'hero' && !ehBannerSimulado(b))
        : b.tipo === a
  const contaTab = (a: 'banner' | 'popup' | 'hero') => lista.filter((b) => pertenceAAba(b, a)).length
  const visiveis = lista.filter((b) => pertenceAAba(b))
  const tabAtual = TABS.find((x) => x.t === aba)!

  function criar(e: React.FormEvent) {
    e.preventDefault()
    if (uiTipo === 'simulado' && !link.trim()) { toast.error('Escolha o simulado deste banner.'); return }
    if (uiTipo !== 'simulado' && !titulo.trim() && !mensagem.trim() && !imagem.trim()) { toast.error('Preencha ao menos um título, mensagem ou imagem.'); return }
    setAlvo('novo')
    start(async () => {
      const r = await criarBannerAction({ tipo, titulo, mensagem, imagem_url: imagem, link, cor, ativo: true, destaqueAtivo: destaqueAtivoN, destaqueTexto: destaqueTextoN, fadeAtivo: fadeAtivoN, fadeNivel: fadeNivelN }, tenantId)
      setAlvo(null)
      if (!r.ok) { toast.error(r.error ?? 'Falha ao criar.'); return }
      toast.success('Criado!'); setTitulo(''); setMensagem(''); setImagem(''); setLink(''); setDestaqueTextoN(''); setDestaqueAtivoN(true); setFadeAtivoN(true); setFadeNivelN(100); setCriando(false)
      router.refresh()
    })
  }

  function toggle(b: Banner) {
    setAlvo(b.id)
    start(async () => {
      const r = await toggleBannerAction(b.id, !b.ativo, tenantId)
      setAlvo(null)
      if (!r.ok) { toast.error(r.error ?? 'Falha.'); return }
      router.refresh()
    })
  }

  async function excluir(b: Banner) {
    if (!(await confirmar({ titulo: 'Excluir', mensagem: `Excluir este ${b.tipo === 'popup' ? 'pop-up' : 'banner'}?`, confirmar: 'Excluir', destrutivo: true }))) return
    setAlvo(b.id)
    start(async () => {
      const r = await excluirBannerAction(b.id, tenantId)
      setAlvo(null)
      if (!r.ok) { toast.error(r.error ?? 'Falha.'); return }
      toast.success('Excluído.'); router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      {/* Abas por tipo de aviso */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl border bg-card p-1.5 shadow-sm">
        {TABS.map(({ t, label, Icon }) => (
          <button key={t} type="button" onClick={() => { if (t !== aba) setUiTipo(t) }}
            className={cn('flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition', aba === t ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted')}>
            <Icon className="h-4 w-4" /> {label}
            <span className={cn('ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', aba === t ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted-foreground/15 text-muted-foreground')}>{contaTab(t)}</span>
          </button>
        ))}
      </div>

      {/* Modal de criação (abre pelo botão "Adicionar") */}
      {criando && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setCriando(false)}>
          <div className="flex max-h-[90vh] w-full max-w-md animate-in fade-in zoom-in-95 flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl duration-200" onClick={(e) => e.stopPropagation()}>
            <header className="flex shrink-0 items-center justify-between border-b px-5 py-3.5">
              <span className="flex items-center gap-2 text-sm font-semibold"><tabAtual.Icon className="h-4 w-4 text-primary" /> Novo {tabAtual.label.toLowerCase()}</span>
              <button type="button" onClick={() => setCriando(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </header>
            <form onSubmit={criar} className="scroll-claro min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
        {aba === 'banner' && (
          <div className="grid grid-cols-2 gap-2">
            {([
              { v: 'banner', label: 'Texto / Link', Icon: Megaphone },
              { v: 'simulado', label: 'Simulado', Icon: Clapperboard },
            ] as const).map(({ v, label, Icon }) => (
              <button key={v} type="button" onClick={() => setUiTipo(v)}
                className={cn('flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition', uiTipo === v ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted')}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        )}
        {uiTipo === 'hero' && <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Banner de <strong>destaque</strong> aparece no topo da home do aluno, em carrossel. Use uma <strong>imagem larga</strong> (ex.: 1920×600). O link é opcional. A ordem segue a criação.</p>}
        {uiTipo === 'simulado' && (
          <div className="space-y-1.5 rounded-lg bg-muted/50 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Banner que promove um <strong>simulado</strong> (ou uma <strong>pasta de simulados</strong>) no topo da home, usando o <strong>fundo do próprio simulado/pasta</strong>. Pasta mostra a <strong>quantidade de simulados</strong>. Escolha:</p>
            <select value={destSim.some((d) => d.href === link) ? link : ''}
              onChange={(e) => { const d = destSim.find((x) => x.href === e.target.value); setLink(e.target.value); if (d && !titulo.trim()) setTitulo(d.label) }}
              className="h-9 w-full rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Selecione um simulado ou pasta…</option>
              {pastasDest.length > 0 && <optgroup label="Pastas (grupos de simulados)">{pastasDest.map((d) => <option key={d.href} value={d.href}>{d.label}</option>)}</optgroup>}
              {simulados.length > 0 && <optgroup label="Simulados">{simulados.map((d) => <option key={d.href} value={d.href}>{d.label}</option>)}</optgroup>}
            </select>
            {destSim.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhum simulado ou pasta disponível ainda.</p>}
            {/* Rótulo "Em destaque para você" (por banner): ligar/desligar + trocar o texto. */}
            <div className="space-y-1.5 rounded-lg border bg-background px-3 py-2.5">
              <div className="flex items-start gap-3">
                <Switch checked={destaqueAtivoN} onCheckedChange={setDestaqueAtivoN} />
                <div className="min-w-0">
                  <p className="text-xs font-medium">Rótulo em destaque (acima do título)</p>
                  <p className="text-[11px] text-muted-foreground">A tarja verde “Em destaque para você”. Desligue para ocultá-la.</p>
                </div>
              </div>
              {destaqueAtivoN && <Input value={destaqueTextoN} onChange={(e) => setDestaqueTextoN(e.target.value)} placeholder="Em destaque para você" className="h-8 text-xs" />}
            </div>
            {/* Degradê escuro sobre a imagem: liga/desliga + intensidade (0–150; 100 = padrão). */}
            <div className="space-y-1.5 rounded-lg border bg-background px-3 py-2.5">
              <div className="flex items-start gap-3">
                <Switch checked={fadeAtivoN} onCheckedChange={setFadeAtivoN} />
                <div className="min-w-0">
                  <p className="text-xs font-medium">Degradê sobre a imagem</p>
                  <p className="text-[11px] text-muted-foreground">Escurecimento à esquerda que dá legibilidade ao texto.</p>
                </div>
              </div>
              {fadeAtivoN && (
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="w-10 shrink-0">Fade</span>
                  <input type="range" min={0} max={150} step={5} value={fadeNivelN} onChange={(e) => setFadeNivelN(Number(e.target.value))} className="h-1.5 flex-1 cursor-pointer accent-primary" />
                  <span className="w-8 shrink-0 text-right tabular-nums">{fadeNivelN}%</span>
                </label>
              )}
            </div>
            {/* Configuração GERAL (vale para todos os banners de simulado deste tenant): mostrar ou não
                o painel de desempenho do aluno (Simulados/Nota média/Melhor nota) no canto inferior direito.
                Vem DESATIVADO por padrão. */}
            <div className="flex items-start gap-3 rounded-lg border bg-background px-3 py-2.5">
              <Switch checked={desempenho} onCheckedChange={alternarDesempenho} disabled={pending} />
              <div className="min-w-0">
                <p className="text-xs font-medium">Mostrar desempenho do aluno no banner</p>
                <p className="text-[11px] text-muted-foreground">Painel com Simulados/Nota média/Melhor nota no canto inferior direito. Vale para <strong>todos</strong> os banners de simulado. Desativado por padrão.</p>
              </div>
            </div>
          </div>
        )}
        {uiTipo === 'popup' && (
          <div className="rounded-xl border bg-neutral-200/60 p-3 dark:bg-neutral-900/50">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Prévia ao vivo</p>
            <PopupCard banner={{ titulo: titulo || null, mensagem: mensagem || null, imagem_url: imagem || null, cor, link: link || null }} preview />
            <p className="mt-2 text-[11px] text-muted-foreground">Os <strong>estilos</strong> (sobre a imagem, compacto, pontas…) você ajusta depois em <strong>Configurar</strong> ⚙️.</p>
          </div>
        )}
        <div className="space-y-1"><label className="text-xs text-muted-foreground">Título</label>
          <textarea value={titulo} onChange={(e) => setTitulo(e.target.value)} rows={2} placeholder="Ex.: Novo simulado disponível! (Enter = nova linha)" className="w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1"><label className="text-xs text-muted-foreground">Mensagem</label>
          <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} placeholder="Texto do aviso…" className="w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Imagem {tipo === 'popup' ? '(opcional)' : uiTipo === 'simulado' ? '(opcional — padrão: fundo do simulado)' : '(molde 1920×500 — largura total)'}</label>
          <div className="flex gap-2">
            <Input value={imagem.startsWith('data:') ? '' : imagem} onChange={(e) => setImagem(e.target.value)} placeholder="Cole uma URL ou envie um arquivo →" className="flex-1" />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onArquivo(e.target.files?.[0] ?? null)} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={enviando} title="Enviar imagem do computador"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted disabled:opacity-50">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            </button>
          </div>
          {imagem && (
            <div className="relative overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagem} alt="" className={cn('w-full object-cover', tipo === 'popup' ? 'h-20' : 'aspect-[1920/500]')} />
              <div className="absolute right-1.5 top-1.5 flex gap-1.5">
                {tipo !== 'popup' && (
                  <button type="button" onClick={() => { setCropSrc(cropSrc || imagem); setCropOpen(true) }} title="Ajustar área (recorte)"
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-white transition hover:bg-black/70"><Crop className="h-3.5 w-3.5" /></button>
                )}
                <button type="button" onClick={() => setImagem('')} title="Remover imagem"
                  className="flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-white transition hover:bg-black/70"><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          )}
          {cropOpen && cropSrc && (
            <BannerCropper src={cropSrc} onApply={(d) => { setImagem(d); setCropOpen(false) }} onCancel={() => setCropOpen(false)} />
          )}
        </div>
        <div className={cn('space-y-1', uiTipo === 'simulado' && 'hidden')}>
          <label className="text-xs text-muted-foreground">Link ao clicar (opcional)</label>
          {destinos && destinos.length > 0 && (
            <select value={destinos.some((d) => d.href === link) ? link : ''} onChange={(e) => e.target.value && setLink(e.target.value)}
              className="mb-1.5 h-9 w-full rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Destino rápido (pasta, simulado…) — ou digite abaixo</option>
              {['Pastas', 'Simulados'].map((grp) => {
                const opts = destinos.filter((d) => (d.grupo ?? 'Simulados') === grp)
                return opts.length ? (
                  <optgroup key={grp} label={grp}>
                    {opts.map((d) => <option key={d.href} value={d.href}>{d.label}</option>)}
                  </optgroup>
                ) : null
              })}
            </select>
          )}
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/aluno/simulado ou https://…" />
        </div>
        <div className="flex items-center gap-2"><label className="text-xs text-muted-foreground">Cor de destaque</label><input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5" /></div>
        <Button type="submit" disabled={pending && alvo === 'novo'} className="w-full">
          {pending && alvo === 'novo' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Adicionar
        </Button>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Lista (filtrada pela aba) — largura total */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold">{tabAtual.label} ({visiveis.length})</h2>
            {visiveis.length > 1 && <span className="text-[11px] text-muted-foreground">Arraste pelos ⠿ para ordenar</span>}
          </div>
          <Button size="sm" onClick={() => setCriando(true)}><Plus className="mr-1.5 h-4 w-4" /> Adicionar {tabAtual.label.toLowerCase()}</Button>
        </div>
        {visiveis.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{tabAtual.vazio}</div>
        ) : visiveis.map((b, idx) => {
          const primeiro = idx === 0, ultimo = idx === visiveis.length - 1
          return (
          <div key={b.id} draggable
            onDragStart={() => setDragIdx(idx)}
            onDragOver={(e) => { e.preventDefault(); if (overIdx !== idx) setOverIdx(idx) }}
            onDrop={(e) => { e.preventDefault(); soltarEm(idx) }}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
            className={cn('flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm transition', !b.ativo && 'opacity-60', dragIdx === idx && 'opacity-40', overIdx === idx && dragIdx !== null && dragIdx !== idx && 'ring-2 ring-primary')}>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className={cn('flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold', primeiro ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>{idx + 1}</span>
              <span className="cursor-grab text-muted-foreground/50 transition-colors hover:text-muted-foreground active:cursor-grabbing" title="Arraste para reordenar"><GripVertical className="h-4 w-4" /></span>
            </div>
            {b.imagem_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.imagem_url} alt="" className="h-11 w-16 shrink-0 rounded-lg border object-cover" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: (b.cor ?? '#6366f1') + '22', color: b.cor ?? '#6366f1' }}>
                {b.tipo === 'popup' ? <MessageSquareWarning className="h-5 w-5" /> : <Megaphone className="h-5 w-5" />}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-medium">
                {b.titulo || '(sem título)'}
                <span className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{ehBannerSimulado(b) ? 'simulado' : (TIPO_LABEL[b.tipo] ?? b.tipo)}</span>
                {primeiro && visiveis.length > 1 && <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">1º · primeiro</span>}
                {ultimo && visiveis.length > 1 && <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">último</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">{b.mensagem || b.link || '—'}</p>
            </div>
            <button type="button" onClick={() => setEditando(b)} title="Configurar"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted">
              <Settings className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => toggle(b)} disabled={pending && alvo === b.id} title={b.ativo ? 'Desativar' : 'Ativar'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted disabled:opacity-50">
              {pending && alvo === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : b.ativo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => excluir(b)} disabled={pending && alvo === b.id} title="Excluir"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          )
        })}
      </div>

      {editando && <BannerEditModal banner={editando} tenantId={tenantId} destinos={destinos} desempenho={desempenho} onToggleDesempenho={alternarDesempenho} destaqueAtivoInicial={destaques[editando.id]?.ativo !== false} destaqueTextoInicial={destaques[editando.id]?.texto ?? ''} fadeAtivoInicial={destaques[editando.id]?.fadeAtivo !== false} fadeNivelInicial={destaques[editando.id]?.fadeNivel ?? 100} popupEstiloInicial={destaques[editando.id]?.popupEstilo ?? 'classico'} popupPontasInicial={destaques[editando.id]?.popupPontas ?? 'arredondado'} bannerTextoPosInicial={destaques[editando.id]?.bannerTextoPos ?? 'center'} bannerTextoCorInicial={destaques[editando.id]?.bannerTextoCor ?? 'claro'} bannerTextoTamInicial={destaques[editando.id]?.bannerTextoTam ?? 'medio'} bannerOcultarTituloInicial={(destaques[editando.id] as any)?.bannerOcultarTitulo ?? false} bannerOcultarMensagemInicial={(destaques[editando.id] as any)?.bannerOcultarMensagem ?? false} agendaInicioInicial={(destaques[editando.id] as any)?.agendaInicio ?? ''} agendaFimInicial={(destaques[editando.id] as any)?.agendaFim ?? ''} freqInicial={(destaques[editando.id] as any)?.freq ?? 'login'} onClose={() => setEditando(null)} />}
    </div>
  )
}
