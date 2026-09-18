'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Lock, LayoutGrid, Rows3, ChevronRight, FolderOpen, Folder, Home, FolderTree, ClipboardList, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { iconeBanco } from '@/lib/banco-visual'
import { FileiraHorizontal } from '@/components/fileira-horizontal'
import { PersonalizadosLista } from '@/components/aluno/personalizados-lista'
import { type CardView } from '@/lib/card-view'
import type { VisualSim } from '@/lib/aluno/simulado-visual'
import type { PastaCatalogo } from '@/lib/aluno/grupos-catalogo'

export type MeuSimuladoItem = {
  id: string
  titulo: string
  modo_aplicacao: string
  tentativas: number
  melhor: number | null
  notaLiberada: boolean
  vis: VisualSim | null
  grupoId: string | null
}
const notaTone = (n: number) => (n >= 70 ? 'text-emerald-600 dark:text-emerald-400' : n >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')
const modoLabel = (m: string) => (m === 'janela_fixa' ? 'Agendado' : m === 'prazo_relativo' ? 'Prazo' : 'Aberto')

// Cards um pouco mais estreitos para espiar um pedaço do próximo na fileira do Catálogo.
const BASIS = 'shrink-0 basis-[calc((100%-1rem)/2.25)] sm:basis-[calc((100%-2rem)/3.3)] lg:basis-[calc((100%-3rem)/4.3)] xl:basis-[calc((100%-4rem)/5.3)]'
const GRID_TILES = 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'
// Vista "Status": seções por DESEMPENHO (nota da melhor tentativa) — diferencia de verdade do Quadro.
const STATUS_SECOES = [
  { chave: 'aprovado', label: 'Aprovado (nota ≥ 70)', cor: 'bg-emerald-500' },
  { chave: 'regular', label: 'Regular (50–69)', cor: 'bg-amber-500' },
  { chave: 'abaixo', label: 'Abaixo de 50', cor: 'bg-rose-500' },
  { chave: 'aguardando', label: 'Aguardando nota', cor: 'bg-muted-foreground' },
] as const
function bucketDesemp(s: MeuSimuladoItem): string {
  if (!s.notaLiberada || s.melhor == null) return 'aguardando'
  if (s.melhor >= 70) return 'aprovado'
  if (s.melhor >= 50) return 'regular'
  return 'abaixo'
}

// Entrada em CASCATA: cada item entra com um pequeno atraso crescente por índice → aparece do canto
// superior-esquerdo ao direito, em linhas (um "fade em linhas"). Cap no atraso p/ listas grandes.
function Entrada({ i, children, className }: { i: number; children: ReactNode; className?: string }) {
  return (
    <div style={{ animationDelay: `${Math.min(i, 40) * 28}ms` }}
      className={cn('fill-mode-both duration-300 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2', className)}>
      {children}
    </div>
  )
}

/** Card de um simulado concluído — nota, tentativas e link para o resultado. `variant`: pôster (4:5) ou ticket. */
function CardConcluido({ s, variant = 'poster' }: { s: MeuSimuladoItem; variant?: CardView }) {
  const cor = s.vis?.cor ?? '#6d28d9'
  const BancoIcon = iconeBanco(s.vis?.icone)
  const capa = s.vis?.capa

  // ===== TICKET: card baixo/retangular — imagem à esquerda, infos à direita. =====
  if (variant === 'ticket') {
    // Ticket usa a IMAGEM DO CARD (capa_card_url); cai no banner só se não houver.
    const capaT = capa ?? s.vis?.capaBanner
    return (
      <div className="group relative flex h-28 overflow-hidden rounded-2xl border bg-card shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:h-32">
        <div className="relative w-[42%] max-w-[11rem] shrink-0 overflow-hidden">
          {capaT
            ? <img src={capaT} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
            : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />}
          {!capa && <BancoIcon className="absolute -right-4 -top-4 h-28 w-28 text-white/10" />}
          <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: `linear-gradient(110deg, transparent 45%, ${cor})` }} />
        </div>
        <Link href={`/aluno/simulados/${s.id}`} className="absolute inset-0 z-10" aria-label={s.titulo} />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{modoLabel(s.modo_aplicacao)}</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Concluído</span>
          </div>
          <h3 className="line-clamp-2 text-sm font-bold leading-tight text-foreground sm:text-[15px]">{s.titulo}</h3>
          <div className="text-xs">
            {s.notaLiberada ? (
              <span className="font-semibold text-muted-foreground">Melhor nota: <span className={cn('tabular-nums', s.melhor != null && notaTone(s.melhor))}>{s.melhor != null ? s.melhor.toFixed(1).replace('.', ',') : '—'}</span></span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground"><Lock className="h-3 w-3" /> Nota a liberar</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:ring-white/25">
      {capa
        ? <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />}
      {!capa && <BancoIcon className="absolute -right-6 -top-6 h-40 w-40 text-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3" />}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 opacity-50 transition-opacity duration-300 group-hover:opacity-70" style={{ background: `linear-gradient(to top, ${cor}, transparent)` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/5" />

      <Link href={`/aluno/simulados/${s.id}`} className="absolute inset-0 z-10" aria-label={s.titulo} />

      {s.notaLiberada ? (
        <span className="pointer-events-none absolute right-3 top-3 z-20 rounded-lg bg-black/45 px-2 py-1 text-right backdrop-blur">
          <span className={cn('block text-lg font-bold leading-none tabular-nums text-white', s.melhor != null && notaTone(s.melhor))}>{s.melhor != null ? s.melhor.toFixed(1).replace('.', ',') : '—'}</span>
          <span className="block text-[9px] uppercase tracking-wide text-white/70">nota</span>
        </span>
      ) : (
        <span className="pointer-events-none absolute right-3 top-3 z-20 inline-flex items-center gap-1 rounded-lg bg-black/45 px-2 py-1 text-[10px] font-medium text-white/80 backdrop-blur" title="A nota será liberada pelo professor"><Lock className="h-3 w-3" /> Nota</span>
      )}

      {/* Modalidade (Aberto/Agendado/Prazo) — canto superior esquerdo. */}
      <span className="pointer-events-none absolute left-3 top-3 z-20 rounded-lg bg-black/45 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/85 backdrop-blur">{modoLabel(s.modo_aplicacao)}</span>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4">
        <span className="mb-1 inline-flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/85 backdrop-blur"><CheckCircle2 className="h-3 w-3" /> Concluído</span>
        <h3 className="line-clamp-2 text-base font-bold leading-tight text-white drop-shadow-sm">{s.titulo}</h3>
      </div>
    </div>
  )
}

/**
 * "Meus simulados" (concluídos) em 3 visões: PASTA (navegador de pastas/subpastas igual ao admin —
 * padrão), CATÁLOGO (fileiras horizontais por pasta) e QUADRO (grade plana). A visão Pasta navega
 * por `?pasta=id` (com breadcrumb + subpastas dentro), exatamente como a Aplicação de Simulado.
 */
export function MeusSimuladosCatalogo({ itens, pastas, view = 'poster' }: { itens: MeuSimuladoItem[]; pastas: PastaCatalogo[]; view?: CardView }) {
  const temCatalogo = pastas.length > 0
  const searchParams = useSearchParams()
  // Aba refletida na URL (?aba=personalizados) — o voltar do navegador retorna à aba certa.
  const abaUrl = searchParams.get('aba') === 'personalizados' ? 'personalizados' : 'revisao'
  const [aba, setAba] = useState<'revisao' | 'personalizados'>(abaUrl)
  const [dir, setDir] = useState<'dir' | 'esq'>('dir')
  useEffect(() => { setAba(abaUrl); setDir(abaUrl === 'personalizados' ? 'dir' : 'esq') }, [abaUrl])
  const trocarAba = (id: 'revisao' | 'personalizados') => {
    setDir(id === 'personalizados' ? 'dir' : 'esq')
    setAba(id)
    const params = new URLSearchParams(searchParams.toString())
    if (id === 'personalizados') params.set('aba', 'personalizados'); else params.delete('aba')
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `/aluno/simulados?${qs}` : '/aluno/simulados')
  }

  // Visão: pasta (padrão) | catalogo | quadro | status.
  const [vista, setVista] = useState<'pasta' | 'catalogo' | 'quadro' | 'status'>('pasta')
  useEffect(() => { const v = localStorage.getItem('aluno-meus-simulados-vista'); if (v === 'pasta' || v === 'catalogo' || v === 'quadro' || v === 'status') setVista(v) }, [])
  useEffect(() => { localStorage.setItem('aluno-meus-simulados-vista', vista) }, [vista])

  // Indicador DESLIZANTE do seletor de visão (a "pílula" ativa escorrega entre as opções).
  const segRef = useRef<HTMLDivElement>(null)
  const [ind, setInd] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  useEffect(() => {
    const medir = () => { const c = segRef.current; if (!c) return; const el = c.querySelector<HTMLElement>(`[data-v="${vista}"]`); if (el) setInd({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight }) }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [vista, aba, temCatalogo])

  // Pasta atual (navegação ?pasta=id) — estado local sincronizado à URL (voltar/avançar do navegador).
  const [pastaAtual, setPastaAtual] = useState<string | null>(searchParams.get('pasta'))
  useEffect(() => {
    const onPop = () => { const sp = new URLSearchParams(window.location.search); setPastaAtual(sp.get('pasta')); setAba(sp.get('aba') === 'personalizados' ? 'personalizados' : 'revisao') }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const irParaPasta = (id: string | null) => {
    setPastaAtual(id)
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set('pasta', id); else params.delete('pasta')
    const qs = params.toString()
    window.history.pushState(null, '', qs ? `/aluno/simulados?${qs}` : '/aluno/simulados')
  }

  // ── Estrutura de pastas (raízes → subpastas → simulados) ──
  const folderIds = new Set(pastas.map((p) => p.id))
  const pastaById = new Map(pastas.map((p) => [p.id, p]))
  const childrenByPai = new Map<string | null, PastaCatalogo[]>()
  for (const p of pastas) { const key = p.paiId && folderIds.has(p.paiId) ? p.paiId : null; const a = childrenByPai.get(key) ?? []; a.push(p); childrenByPai.set(key, a) }
  for (const a of childrenByPai.values()) a.sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))
  const simsByFolder = new Map<string, MeuSimuladoItem[]>()
  for (const s of itens) { const fid = s.grupoId && folderIds.has(s.grupoId) ? s.grupoId : null; if (fid) { const a = simsByFolder.get(fid) ?? []; a.push(s); simsByFolder.set(fid, a) } }
  const raizes = childrenByPai.get(null) ?? []
  const avulsos = itens.filter((s) => !(s.grupoId && folderIds.has(s.grupoId)))
  const contar = (id: string): number => (simsByFolder.get(id)?.length ?? 0) + (childrenByPai.get(id) ?? []).reduce((s, c) => s + contar(c.id), 0)
  // Capa da pasta: a própria (card/banner) ou, se não houver, a de um simulado de dentro (subárvore).
  const capaDaPasta = (id: string): string | null => {
    const p = pastaById.get(id)
    if (p?.capaCard || p?.capa) return p.capaCard ?? p.capa
    const pilha = [id]; const visto = new Set<string>()
    while (pilha.length) { const f = pilha.pop()!; if (visto.has(f)) continue; visto.add(f)
      for (const s of simsByFolder.get(f) ?? []) { const c = s.vis?.capa ?? s.vis?.capaBanner; if (c) return c }
      for (const c of childrenByPai.get(f) ?? []) pilha.push(c.id) }
    return null
  }
  const trilhaAte = (id: string): PastaCatalogo[] => { const arr: PastaCatalogo[] = []; let cur = pastaById.get(id); while (cur) { arr.unshift(cur); cur = cur.paiId && folderIds.has(cur.paiId) ? pastaById.get(cur.paiId) : undefined } return arr }

  const gridSims = view === 'ticket'
    ? 'grid gap-3 md:grid-cols-2 xl:grid-cols-3'
    : 'grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

  // Tile de PASTA (visão Pasta) — igual ao admin: capa à esquerda, PASTA + nome + contagem + "Abrir pasta".
  function FolderTile({ f }: { f: PastaCatalogo }) {
    const capaEff = capaDaPasta(f.id)
    const cor = f.cor ?? '#6d28d9'
    const Icon = iconeBanco(f.icone)
    return (
      <button type="button" onClick={() => irParaPasta(f.id)}
        className="group relative flex h-32 w-full overflow-hidden rounded-2xl border bg-card text-left shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:h-36">
        <div className="relative w-[38%] max-w-[12rem] shrink-0 overflow-hidden">
          {capaEff
            ? <img src={capaEff} alt="" className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105" />
            : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />}
          {!capaEff && <Icon className="absolute -right-4 -top-4 h-28 w-28 text-white/10" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-3">
          <div className="min-w-0 flex-1">
            <span className="inline-flex w-fit items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><Folder className="h-3 w-3" /> Pasta</span>
            <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-tight text-foreground sm:text-[15px]">{f.nome}</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{contar(f.id)} simulado(s)</p>
          </div>
          <div className="mt-1 flex justify-end">
            <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-all group-hover:brightness-110"
              style={{ background: `linear-gradient(135deg, ${cor}, color-mix(in oklab, ${cor} 72%, #000))` }}>
              <FolderOpen className="h-4 w-4" /> Abrir pasta
            </span>
          </div>
        </div>
      </button>
    )
  }

  // Conteúdo da visão PASTA (navegador): raiz (?sem pasta) ou dentro de uma pasta (subpastas + simulados).
  const atual = pastaAtual ? pastaById.get(pastaAtual) : null
  const subpastasAqui = atual ? (childrenByPai.get(atual.id) ?? []) : raizes
  const simsAqui = atual ? (simsByFolder.get(atual.id) ?? []) : avulsos
  const trilha = atual ? trilhaAte(atual.id) : []
  const catalogoView = vista === 'catalogo' && temCatalogo
  const folhasComSims = pastas.filter((p) => (simsByFolder.get(p.id)?.length ?? 0) > 0).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <div data-tour="simulados-lista" className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><ClipboardList className="h-6 w-6 text-primary" /> Simulados realizados</h1>
        {aba === 'revisao' && temCatalogo && (
          <div ref={segRef} className="relative flex shrink-0 gap-1 rounded-lg border bg-card p-1 shadow-sm">
            {/* Pílula ativa que DESLIZA entre as opções (posição/tamanho medidos por ref). */}
            {ind && <span aria-hidden className="pointer-events-none absolute rounded-md bg-primary shadow-sm transition-all duration-300 ease-out" style={{ left: ind.left, top: ind.top, width: ind.width, height: ind.height }} />}
            {([['pasta', 'Pasta', FolderTree], ['catalogo', 'Catálogo', Rows3], ['status', 'Status', ListChecks], ['quadro', 'Quadro', LayoutGrid]] as const).map(([v, label, Icon]) => (
              <button key={v} type="button" data-v={v} onClick={() => setVista(v)} aria-pressed={vista === v}
                className={cn('relative z-10 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                  vista === v ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-b border-border">
        <nav className="-mb-px flex gap-5" role="tablist" aria-label="Meus simulados">
          {([['revisao', 'Simulado Revisão'], ['personalizados', 'Personalizados']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" data-tour={id === 'personalizados' ? 'aba-personalizados' : undefined} aria-selected={aba === id} onClick={() => trocarAba(id)}
              className={cn('-mb-px border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors',
                aba === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground')}>
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div key={aba} className={cn('duration-300 fill-mode-both animate-in fade-in', dir === 'dir' ? 'slide-in-from-right-6' : 'slide-in-from-left-6')}>
      {aba === 'revisao' ? (
        <section className="space-y-3">
          {itens.length === 0 ? (
            <>
              <h2 className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Concluídos (0)</h2>
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Você ainda não concluiu nenhum simulado. Veja os disponíveis em <Link href="/aluno/simulado" className="font-medium text-primary hover:underline">Simulados</Link>.
              </div>
            </>
          ) : vista === 'pasta' && temCatalogo ? (
            // ── VISÃO PASTA: navegador de pastas (igual ao admin) ──
            <>
              {atual ? (
                <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                  <button type="button" onClick={() => irParaPasta(null)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground"><Home className="h-3.5 w-3.5" /> Início</button>
                  {trilha.map((c, i) => (
                    <span key={c.id} className="flex items-center gap-1">
                      <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                      {i < trilha.length - 1
                        ? <button type="button" onClick={() => irParaPasta(c.id)} className="rounded px-1.5 py-0.5 font-medium transition-colors hover:bg-muted hover:text-foreground">{c.nome}</button>
                        : <span className="px-1.5 py-0.5 font-semibold text-foreground">{c.nome}</span>}
                    </span>
                  ))}
                </div>
              ) : (
                <h2 className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Concluídos ({itens.length})</h2>
              )}
              {/* key por pasta → a cascata roda de novo ao entrar/sair de uma pasta. */}
              <div key={`pasta:${pastaAtual ?? 'raiz'}`} className="space-y-2">
                {subpastasAqui.length > 0 && (
                  <div className={GRID_TILES}>{subpastasAqui.map((f, i) => <Entrada key={f.id} i={i}><FolderTile f={f} /></Entrada>)}</div>
                )}
                {simsAqui.length > 0 && (
                  <>
                    {subpastasAqui.length > 0 && <h3 className="pt-1 text-sm font-semibold text-muted-foreground">{atual ? 'Simulados desta pasta' : 'Outros simulados'}</h3>}
                    <div className={gridSims}>{simsAqui.map((s, i) => <Entrada key={s.id} i={subpastasAqui.length + i}><CardConcluido s={s} variant={view} /></Entrada>)}</div>
                  </>
                )}
                {subpastasAqui.length === 0 && simsAqui.length === 0 && (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Pasta vazia.</div>
                )}
              </div>
            </>
          ) : catalogoView ? (
            // ── VISÃO CATÁLOGO: fileiras horizontais por pasta ──
            <>
              <h2 className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Concluídos ({itens.length})</h2>
              <div className="space-y-4">
                {folhasComSims.map((p, fi) => {
                  const its = simsByFolder.get(p.id) ?? []
                  const inner = view === 'ticket' ? (
                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold text-muted-foreground">{p.nome} <span className="opacity-60">({its.length})</span></h3>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{its.map((s) => <CardConcluido key={s.id} s={s} variant="ticket" />)}</div>
                    </section>
                  ) : (
                    <FileiraHorizontal titulo={p.nome} count={its.length}>
                      {its.map((s) => <div key={s.id} className={BASIS}><CardConcluido s={s} /></div>)}
                    </FileiraHorizontal>
                  )
                  // Cada fileira (divisória + linha) entra em cascata DE CIMA PRA BAIXO (delay por fileira).
                  return <Entrada key={p.id} i={fi}>{inner}</Entrada>
                })}
                {avulsos.length > 0 && (
                  <Entrada i={folhasComSims.length}>
                    <div className="space-y-2">
                      {folhasComSims.length > 0 && <h3 className="pt-1 text-sm font-semibold text-muted-foreground">Outros simulados</h3>}
                      <div className={gridSims}>{avulsos.map((s) => <CardConcluido key={s.id} s={s} variant={view} />)}</div>
                    </div>
                  </Entrada>
                )}
              </div>
            </>
          ) : (
            // ── VISÕES QUADRO e STATUS na MESMA grade (cabeçalhos do Status como itens col-span-full).
            // key=vista → a cascata roda ao alternar Quadro↔Status; as imagens têm fade próprio (CapaImg). ──
            <>
              <h2 className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Concluídos ({itens.length})</h2>
              <div key={vista} className={gridSims}>
                {vista === 'status'
                  ? (() => { let k = 0; return STATUS_SECOES.flatMap((sec) => {
                      const arr = itens.filter((s) => bucketDesemp(s) === sec.chave)
                      if (!arr.length) return []
                      return [
                        <Entrada key={`sec-${sec.chave}`} i={k++} className="col-span-full flex items-center gap-2 pt-2 first:pt-0">
                          <span className={cn('h-2.5 w-2.5 rounded-full', sec.cor)} /><h3 className="font-semibold">{sec.label}</h3><span className="text-sm text-muted-foreground">({arr.length})</span>
                        </Entrada>,
                        ...arr.map((s) => <Entrada key={s.id} i={k++}><CardConcluido s={s} variant={view} /></Entrada>),
                      ]
                    }) })()
                  : itens.map((s, i) => <Entrada key={s.id} i={i}><CardConcluido s={s} variant={view} /></Entrada>)}
              </div>
            </>
          )}
        </section>
      ) : (
        <PersonalizadosLista view={view} />
      )}
      </div>
    </div>
  )
}
