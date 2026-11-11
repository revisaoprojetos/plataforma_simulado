'use client'

// Página do MÓDULO do extensivo: aulas organizadas por TIPO de material (PDFull, PDFlash, PDFight, LegProc,
// Juris, Questões, Vídeos, Outros) em 3 variações escolhidas por produto no Estúdio (simulado_produtos.modulo_layout):
//   • cards_lista — faixa de cards por tipo (filtro/acesso direto) + lista paginada abaixo;
//   • colunas     — uma coluna por tipo, lado a lado (grid adaptativo ao CONTAINER; empilha quando estreito);
//   • abas        — abas sublinhadas por tipo com contagem.
// Sem coluna lateral de módulos: a navegação é por setas anterior/próximo + seletor. Agrupamento e progresso
// vêm PRONTOS do servidor (agruparModulo); aqui só filtra por busca e renderiza.
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight, ChevronDown, FileText, Zap, Target, Scale, Gavel, ClipboardList, PlayCircle, FolderOpen, Lock, Search, X, CheckCircle2, LayoutGrid, List } from 'lucide-react'
import type { ModuloAluno, AulaAluno, GrupoMaterial, ModuloAgrupado, SubmoduloResumo, AchadoSubmodulo } from '@/lib/produtos/curriculo-aluno'
import type { ModuloLayout } from '@/lib/produtos/tipos'
import type { MaterialChave } from '@/lib/produtos/curriculo'
import { cardGrid, POSTER_MIN } from '@/components/aluno/card-grid'
import { fold, fmtData, hrefModulo, AulaLinha, CabecalhoAulas, CardCronograma, Poster } from './curriculo'

export interface NavModulo { id: string; titulo: string; liberado: boolean; lidas: number; total: number }

const ICONE: Record<MaterialChave, typeof FileText> = {
  pdfull: FileText, pdflash: Zap, pdfight: Target, legproc: Scale, juris: Gavel, questoes: ClipboardList, video: PlayCircle, outros: FolderOpen,
}
const PAGINA = 12

type Filtrado = GrupoMaterial & { visiveis: AulaAluno[] }

export function ModuloDetalhe({ nav, atual, agrupado, total, submodulos, achados, qInicial, ehSub, layout, slug, cor }: {
  nav: NavModulo[]; atual: ModuloAluno
  agrupado: ModuloAgrupado          // aulas DIRETAS do módulo, agrupadas por material
  total: ModuloAgrupado             // módulo inteiro (inclui submódulos) — estatísticas do cabeçalho
  submodulos: SubmoduloResumo[]; achados: AchadoSubmodulo[]; qInicial: string; ehSub: boolean
  layout: ModuloLayout; slug: string; cor: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [busca, setBusca] = useState(qInicial)
  const q = fold(busca.trim())
  // Busca nas aulas dos submódulos é feita no SERVIDOR (?q=), com debounce; aulas diretas filtram local.
  const primeiro = useRef(true)
  useEffect(() => {
    if (!submodulos.length) return
    if (primeiro.current) { primeiro.current = false; return }
    const t = setTimeout(() => {
      const sp = new URLSearchParams(window.location.search)
      if (busca.trim()) sp.set('q', busca.trim()); else sp.delete('q')
      const s = sp.toString()
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false })
    }, 350)
    return () => clearTimeout(t)
  }, [busca, submodulos.length, pathname, router])
  const idx = nav.findIndex((m) => m.id === atual.id)
  const ant = idx > 0 ? nav[idx - 1] : null
  const prox = idx >= 0 && idx < nav.length - 1 ? nav[idx + 1] : null

  const grupos: Filtrado[] = useMemo(
    () => agrupado.grupos.map((g) => ({ ...g, visiveis: q ? g.aulas.filter((a) => fold(a.titulo).includes(q)) : g.aulas })),
    [agrupado.grupos, q],
  )
  const achou = grupos.reduce((s, g) => s + g.visiveis.length, 0)

  return (
    <div className="w-full min-w-0 space-y-4 [container-type:inline-size]">
      {/* Cabeçalho: capa + título + progresso + navegação entre módulos */}
      <div className="flex gap-4 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="relative hidden aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-xl sm:block"
          style={atual.imagemUrl ? undefined : { background: `linear-gradient(170deg, color-mix(in srgb, ${cor} 85%, #000), var(--pn-0b0820,#0b0820))` }}>
          {atual.imagemUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={atual.imagemUrl} alt="" className="h-full w-full object-cover" />
            : <span className="absolute inset-0 flex items-end p-2 text-[11px] font-extrabold uppercase leading-tight text-[color:var(--pn-f1c232,#F1C232)]">{atual.titulo}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{ehSub ? 'Submódulo' : 'Módulo'} {idx + 1} de {nav.length}</div>
            <div className="flex min-w-0 items-center gap-1.5">
              <BotaoNav href={ant ? hrefModulo(slug, ant.id) : null} label="Módulo anterior" titulo={ant?.titulo}><ChevronLeft className="h-4 w-4" /></BotaoNav>
              <label className="relative min-w-0">
                <span className="sr-only">Ir para o módulo</span>
                <select value={atual.id} onChange={(e) => router.push(hrefModulo(slug, e.target.value))}
                  className="h-8 w-full max-w-[16rem] cursor-pointer appearance-none truncate rounded-lg border bg-background pl-2.5 pr-7 text-xs font-medium outline-none focus:ring-2 focus:ring-[color:var(--ring)] sm:max-w-[20rem]">
                  {nav.map((m, i) => <option key={m.id} value={m.id}>{i + 1}. {m.titulo}{m.liberado ? '' : ' (bloqueado)'}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </label>
              <BotaoNav href={prox ? hrefModulo(slug, prox.id) : null} label="Próximo módulo" titulo={prox?.titulo}><ChevronRight className="h-4 w-4" /></BotaoNav>
            </div>
          </div>
          <h1 className="mt-1 text-xl font-bold leading-tight tracking-tight sm:text-2xl">{atual.titulo}</h1>
          {atual.descricao && <p className="mt-1 text-sm text-muted-foreground">{atual.descricao}</p>}
          {!atual.liberado && (atual.exclusivo || atual.liberaEm || atual.bloqueioMsg || atual.liberaRotulo) && <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground"><Lock className="h-3.5 w-3.5" />{atual.exclusivo ? 'Conteúdo exclusivo — não disponível para o seu perfil' : atual.liberaRotulo ? atual.liberaRotulo : atual.liberaEm ? `Libera em ${fmtData(atual.liberaEm)}` : atual.bloqueioMsg}</p>}
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${total.pct}%`, background: cor }} /></div>
            <span className="whitespace-nowrap text-xs font-medium tabular-nums text-muted-foreground">{total.lidas}/{total.total} aulas concluídas · {total.pct}%</span>
          </div>
          {/* Estatísticas compactas (já calculadas no servidor): submódulos + concluídas por tipo de material */}
          {(submodulos.length > 0 || total.grupos.length > 0) && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {submodulos.length > 0 && <span className="font-medium">{submodulos.length} {submodulos.length === 1 ? 'submódulo' : 'submódulos'}</span>}
              {total.grupos.map((g, i) => (
                <span key={g.chave}>{i > 0 || submodulos.length > 0 ? ' · ' : ''}{g.label} {g.lidas}/{g.total}</span>
              ))}
            </p>
          )}
        </div>
      </div>

      {/* Plano de estudo (item cronograma) */}
      {agrupado.cronogramas.map((a) => <CardCronograma key={a.id} a={a} cor={cor} />)}

      {/* Busca */}
      {total.total > 6 && (
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aula neste módulo…"
            className="h-10 w-full rounded-xl border bg-card pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-[color:var(--ring)]" />
          {busca && <button type="button" onClick={() => setBusca('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>}
        </label>
      )}

      {/* Submódulos (cards/lista). Com busca ativa, vira o resultado das aulas dentro deles, agrupado pelo submódulo. */}
      {submodulos.length > 0 && !q && <Submodulos itens={submodulos} slug={slug} cor={cor} />}
      {submodulos.length > 0 && q && achados.length > 0 && <AchadosSub achados={achados} cor={cor} />}

      {total.total === 0 && submodulos.length === 0 ? (
        agrupado.cronogramas.length === 0 && <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Sem aulas neste módulo ainda.</div>
      ) : q && achou === 0 && achados.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma aula encontrada para “{busca}”.</div>
      ) : agrupado.total === 0 ? null : (
        <div className="space-y-3">
          {submodulos.length > 0 && !q && <h2 className="px-1 text-sm font-bold tracking-tight">Aulas deste {ehSub ? 'submódulo' : 'módulo'}</h2>}
          {layout === 'colunas' ? <Colunas grupos={grupos} cor={cor} busca={!!q} />
            : layout === 'abas' ? <Abas grupos={grupos} cor={cor} busca={!!q} />
            : <CardsLista grupos={grupos} cor={cor} busca={!!q} />}
        </div>
      )}

      {/* Rodapé: navegação entre módulos */}
      {(ant || prox) && (
        <div className="flex flex-wrap justify-between gap-3 pt-1">
          {ant ? <Link href={hrefModulo(slug, ant.id)} className="inline-flex max-w-[48%] items-center gap-1.5 rounded-xl border bg-card px-3 py-2 text-sm hover:bg-muted/60"><ChevronLeft className="h-4 w-4 shrink-0" /><span className="truncate">{ant.titulo}</span></Link> : <span />}
          {prox && <Link href={hrefModulo(slug, prox.id)} className="ml-auto inline-flex max-w-[48%] items-center gap-1.5 rounded-xl border bg-card px-3 py-2 text-sm hover:bg-muted/60"><span className="truncate">{prox.titulo}</span><ChevronRight className="h-4 w-4 shrink-0" /></Link>}
        </div>
      )}
    </div>
  )
}

function BotaoNav({ href, label, titulo, children }: { href: string | null; label: string; titulo?: string; children: React.ReactNode }) {
  const cls = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background'
  if (!href) return <span aria-hidden className={`${cls} opacity-40`}>{children}</span>
  return <Link href={href} aria-label={label} title={titulo ? `${label}: ${titulo}` : label} className={`${cls} transition-colors hover:bg-muted`}>{children}</Link>
}

/* ── Lista de aulas paginada ("Mostrar mais") — reusa a linha EXATA do módulo ── */
function ListaPaginada({ aulas, cor, bare }: { aulas: AulaAluno[]; cor: string; bare?: boolean }) {
  const [qtd, setQtd] = useState(PAGINA)
  const fatia = aulas.slice(0, qtd)
  // Modo tabular (colunas) só na lista larga e quando ALGUMA aula tem dado de leitura (sem dado → nada de coluna vazia).
  const tabular = !bare && aulas.some((a) => a.leituraFmt)
  return (
    <div>
      <div className={bare ? '' : 'overflow-hidden rounded-2xl border bg-card shadow-sm'}>
        {tabular && <CabecalhoAulas />}
        <ol className="divide-y">
          {fatia.map((a, i) => <li key={a.id}><AulaLinha a={a} n={i + 1} cor={cor} tabular={tabular} /></li>)}
        </ol>
      </div>
      {aulas.length > qtd && (
        <button type="button" onClick={() => setQtd((n) => n + PAGINA)}
          className="mt-2 w-full rounded-xl border bg-background py-2 text-xs font-semibold transition-colors hover:bg-muted" style={{ color: cor }}>
          Mostrar mais ({aulas.length - qtd} restantes)
        </button>
      )}
    </div>
  )
}

function Medalha({ g, cor, on }: { g: { chave: MaterialChave; lidas: number; total: number; liberadas: number }; cor: string; on?: boolean }) {
  const Icon = ICONE[g.chave] ?? FolderOpen
  const bloqueado = g.liberadas === 0
  const feito = g.total > 0 && g.lidas === g.total
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
      style={on || feito ? { background: cor, color: '#fff' } : { background: `color-mix(in srgb, ${cor} 12%, transparent)`, color: cor }}>
      {bloqueado ? <Lock className="h-4 w-4" /> : feito ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
    </span>
  )
}

/* ═══════ Variação 1: lista de aulas por tipo (os cards-filtro por material foram removidos; estatísticas ficam no cabeçalho) ═══════ */
function CardsLista({ grupos, cor, busca }: { grupos: Filtrado[]; cor: string; busca: boolean }) {
  const mostrar = grupos.filter((g) => !busca || g.visiveis.length)
  return (
    <div className="space-y-5">
      {mostrar.map((g) => <GrupoColapsavel key={g.chave} g={g} cor={cor} comTitulo={mostrar.length > 1} />)}
    </div>
  )
}

/* ═══════ Submódulos: CARDS (poster do extensivo) ou LISTA — escolha persistida em localStorage ═══════ */
const LS_SUB = 'aluno:submodulos-modo:v2' // v2: o padrão passou a ser LISTA (ignora escolhas antigas)
function Submodulos({ itens, slug, cor }: { itens: SubmoduloResumo[]; slug: string; cor: string }) {
  const [modo, setModo] = useState<'cards' | 'lista'>('lista')
  useEffect(() => {
    try { const v = localStorage.getItem(LS_SUB); if (v === 'cards' || v === 'lista') setModo(v) } catch { /* storage indisponível (iframe/privado) */ }
  }, [])
  const trocar = (v: 'cards' | 'lista') => { setModo(v); try { localStorage.setItem(LS_SUB, v) } catch { /* ignora */ } }
  const [qtd, setQtd] = useState(24)
  const fatia = itens.slice(0, qtd)
  const btn = (v: 'cards' | 'lista', label: string, Icon: typeof List) => (
    <button type="button" onClick={() => trocar(v)} aria-pressed={modo === v} aria-label={label} title={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${modo === v ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
      style={modo === v ? { color: cor } : undefined}><Icon className="h-4 w-4" /></button>
  )
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-bold tracking-tight">Submódulos <span className="text-xs font-normal text-muted-foreground">· {itens.length}</span></h2>
        <div className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">{btn('cards', 'Ver em cards', LayoutGrid)}{btn('lista', 'Ver em lista', List)}</div>
      </div>
      {modo === 'cards' ? (
        <div style={cardGrid(POSTER_MIN, 16)}>
          {fatia.map((s, i) => <Poster key={s.m.id} m={s.m} nome={s.m.titulo} n={i + 1} href={hrefModulo(slug, s.m.id)} cor={cor} grade stats={{ total: s.total, lidas: s.lidas, pct: s.pct }} />)}
        </div>
      ) : (
        <ol className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
          {fatia.map((s, i) => <li key={s.m.id}><SubLinha s={s} n={i + 1} slug={slug} cor={cor} /></li>)}
        </ol>
      )}
      {itens.length > qtd && (
        <button type="button" onClick={() => setQtd((n) => n + 24)} className="w-full rounded-xl border bg-background py-2 text-xs font-semibold transition-colors hover:bg-muted" style={{ color: cor }}>
          Mostrar mais ({itens.length - qtd} restantes)
        </button>
      )}
    </section>
  )
}

function SubLinha({ s, n, slug, cor }: { s: SubmoduloResumo; n: number; slug: string; cor: string }) {
  const m = s.m
  const feito = m.liberado && s.total > 0 && s.lidas === s.total
  return (
    <Link href={hrefModulo(slug, m.id)} className={`flex items-center gap-3 p-3 transition-colors hover:bg-muted/40 ${m.liberado ? '' : 'opacity-75'}`}>
      <span className="relative aspect-[2/3] w-9 shrink-0 overflow-hidden rounded-md"
        style={m.imagemUrl ? undefined : { background: `linear-gradient(170deg, color-mix(in srgb, ${cor} 85%, #000), var(--pn-0b0820,#0b0820))` }}>
        {m.imagemUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={m.imagemUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          : <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-white/70">{n}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{m.titulo}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {!m.liberado
            ? <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" />{m.exclusivo ? 'conteúdo exclusivo' : m.liberaRotulo ? m.liberaRotulo : m.liberaEm ? `libera em ${fmtData(m.liberaEm)}` : (m.bloqueioMsg ?? 'bloqueado')}</span>
            : <>{s.total} {s.total === 1 ? 'aula' : 'aulas'}{s.filhos ? ` · ${s.filhos} ${s.filhos === 1 ? 'submódulo' : 'submódulos'}` : ''}</>}
        </span>
      </span>
      {m.liberado && s.total > 0 && (
        <span className="hidden w-40 shrink-0 sm:block">
          <span className="block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${s.pct}%`, background: cor }} /></span>
          <span className="mt-1 block text-right text-[11px] tabular-nums text-muted-foreground">{s.lidas}/{s.total} concluídas</span>
        </span>
      )}
      {!m.liberado ? <Lock className="h-4 w-4 shrink-0 text-muted-foreground" /> : feito ? <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: cor }} /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </Link>
  )
}

/* Resultado da busca nas aulas dos submódulos (vem do servidor), agrupado pelo submódulo de origem */
function AchadosSub({ achados, cor }: { achados: AchadoSubmodulo[]; cor: string }) {
  return (
    <div className="space-y-4">
      {achados.map((g) => (
        <section key={g.id} className="space-y-2">
          <h2 className="px-1 text-sm font-bold tracking-tight">{g.titulo} <span className="text-xs font-normal text-muted-foreground">· {g.aulas.length} {g.aulas.length === 1 ? 'aula' : 'aulas'}</span></h2>
          <ListaPaginada aulas={g.aulas} cor={cor} />
        </section>
      ))}
    </div>
  )
}

function GrupoColapsavel({ g, cor, comTitulo }: { g: Filtrado; cor: string; comTitulo: boolean }) {
  const [aberto, setAberto] = useState(true)
  if (!g.visiveis.length) return null
  return (
    <section className="space-y-2">
      {comTitulo ? (
        <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="flex w-full items-center gap-2 px-1 text-left">
          <h2 className="text-sm font-bold tracking-tight">{g.label}</h2>
          <span className="text-xs text-muted-foreground">{g.lidas}/{g.total} concluídas</span>
          <ChevronDown className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </button>
      ) : (
        <h2 className="px-1 text-sm font-bold tracking-tight">{g.label} <span className="text-xs font-normal text-muted-foreground">· {g.visiveis.length} {g.visiveis.length === 1 ? 'aula' : 'aulas'}</span></h2>
      )}
      {(aberto || !comTitulo) && <ListaPaginada aulas={g.visiveis} cor={cor} />}
    </section>
  )
}

/* ═══════ Variação 2: colunas por tipo ═══════ */
function Colunas({ grupos, cor, busca }: { grupos: Filtrado[]; cor: string; busca: boolean }) {
  const lista = grupos.filter((g) => !busca || g.visiveis.length)
  return (
    // auto-fit: poucos tipos esticam para ocupar a largura; muitos quebram em linhas; estreito → 1 coluna (empilhado).
    <div className="items-start" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
      {lista.map((g) => (
        <section key={g.chave} className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
          <header className="flex items-center gap-2.5 border-b p-3">
            <Medalha g={g} cor={cor} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2"><h2 className="truncate text-sm font-bold">{g.label}</h2><span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{g.lidas}/{g.total}</span></div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${g.pct}%`, background: cor }} /></div>
            </div>
          </header>
          {/* rola dentro da coluna */}
          <div className="max-h-[32rem] overflow-y-auto overscroll-contain">
            <ListaPaginada aulas={g.visiveis} cor={cor} bare />
          </div>
        </section>
      ))}
    </div>
  )
}

/* ═══════ Variação 3: abas sublinhadas ═══════ */
function Abas({ grupos, cor, busca }: { grupos: Filtrado[]; cor: string; busca: boolean }) {
  const lista = grupos.filter((g) => !busca || g.visiveis.length)
  const [sel, setSel] = useState<MaterialChave | null>(null)
  const g = lista.find((x) => x.chave === sel) ?? lista[0]
  if (!g) return null
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {lista.map((x) => {
          const on = x.chave === g.chave
          const Icon = ICONE[x.chave] ?? FolderOpen
          return (
            <button key={x.chave} type="button" role="tab" aria-selected={on} onClick={() => setSel(x.chave)}
              className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${on ? '' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              style={on ? { borderColor: cor, color: cor } : undefined}>
              {x.liberadas === 0 ? <Lock className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              {x.label}
              <span className="rounded-md bg-muted px-1.5 py-px text-[11px] font-semibold tabular-nums text-muted-foreground">{busca ? x.visiveis.length : `${x.lidas}/${x.total}`}</span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-3 px-1">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${g.pct}%`, background: cor }} /></div>
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{g.lidas}/{g.total} concluídas · {g.pct}%</span>
      </div>
      <ListaPaginada key={g.chave} aulas={g.visiveis} cor={cor} />
    </div>
  )
}
