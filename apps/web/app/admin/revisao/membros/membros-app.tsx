'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AvatarMembro, KpisCs, NotaCs, PillStatusMembro } from '@/components/admin/revisao/cs-ui'
import type { GrupoOpcao, MembroLinha, MembrosContagens, MembrosFiltro } from '@/lib/admin-revisao/cs-tipos'
import { MembrosTopo } from './membros-topo'
import { FichaPainel, prefetchFicha } from './ficha-painel'

type Dados = { rows: MembroLinha[]; total: number; migrado: boolean; contagens: MembrosContagens }
type Estado = { f: MembrosFiltro; q: string; page: number; pp: number; sort: string; dir: 'asc' | 'desc' }
const PP = [5, 10, 14, 25, 50]

// Cache de páginas da lista (60 s): voltar/avançar já visitada é instantâneo, e a PRÓXIMA página é pré-carregada em segundo plano.
const PAG_CACHE = new Map<string, { t: number; v: Dados }>()
const chavePag = (s: Estado) => `${s.f}|${s.q}|${s.page}|${s.pp}|${s.sort}|${s.dir}`
const pagGet = (s: Estado) => { const e = PAG_CACHE.get(chavePag(s)); return e && Date.now() - e.t < 60_000 ? e.v : undefined }
async function buscarPag(s: Estado): Promise<Dados> {
  const p = new URLSearchParams({ f: s.f, q: s.q, page: String(s.page), pp: String(s.pp), sort: s.sort, dir: s.dir })
  const r = await fetch(`/api/admin/revisao/membros?${p}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const j = (await r.json()) as Dados
  PAG_CACHE.set(chavePag(s), { t: Date.now(), v: j })
  return j
}

function paginas(atual: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const a = Math.max(2, atual - 1), b = Math.min(total - 1, atual + 1)
  if (a > 2) out.push('…'); for (let p = a; p <= b; p++) out.push(p); if (b < total - 1) out.push('…'); out.push(total)
  return out
}

/** CS › Membros: lista + ficha completa. Tudo client-driven (rota de API): clique/aba/página respondem na hora, sem
 *  navegação completa; a URL é atualizada com history.replaceState (compartilhável). */
export function MembrosApp({ inicial, estadoInicial, selInicial, grupos, podeCriar, podeEditar, podeRemover }: {
  inicial: Dados; estadoInicial: Estado; selInicial: string | null; grupos: GrupoOpcao[]; podeCriar: boolean; podeEditar: boolean; podeRemover: boolean
}) {
  const [dados, setDados] = useState<Dados>(inicial)
  const [st, setSt] = useState<Estado>(estadoInicial)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(selInicial ?? inicial.rows[0]?.id ?? null)
  const [selRow, setSelRow] = useState<MembroLinha | null>(inicial.rows.find((r) => r.id === (selInicial ?? inicial.rows[0]?.id)) ?? null)
  const [drawer, setDrawer] = useState(false)
  const [busca, setBusca] = useState(estadoInicial.q)
  const seq = useRef(0)
  const primeira = useRef(true)
  const painelRef = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async (s: Estado) => {
    const mine = ++seq.current
    setErro(null)
    const hit = pagGet(s)
    if (hit) { setDados(hit); setCarregando(false); void buscarPag({ ...s, page: s.page + 1 }).catch(() => {}); return }
    setCarregando(true)
    try {
      const j = await buscarPag(s)
      if (mine !== seq.current) return
      if (s.page * s.pp < j.total) void buscarPag({ ...s, page: s.page + 1 }).catch(() => {})
      setDados(j)
      // ao trocar de página/aba/busca, a primeira linha vira a selecionada se a atual saiu da lista (sem perder a escolha manual)
      setSel((cur) => (cur && j.rows.some((x) => x.id === cur) ? cur : cur ?? j.rows[0]?.id ?? null))
    } catch (e: any) { if (mine === seq.current) setErro(e?.message ?? 'Falha ao carregar.') }
    finally { if (mine === seq.current) setCarregando(false) }
  }, [])

  // recarrega quando o estado (aba/busca/página/ordem) muda — exceto na montagem (já veio do servidor)
  useEffect(() => { if (primeira.current) { primeira.current = false; return } carregar(st) }, [st, carregar])
  // busca com debounce
  useEffect(() => { if (busca === st.q) return; const t = setTimeout(() => setSt((s) => ({ ...s, q: busca.trim(), page: 1 })), 300); return () => clearTimeout(t) }, [busca, st.q])
  // linha selecionada = a da lista atual, ou a última conhecida
  useEffect(() => { const r = dados.rows.find((x) => x.id === sel); if (r) setSelRow(r) }, [dados.rows, sel])
  // URL compartilhável (sem navegação)
  useEffect(() => {
    const p = new URLSearchParams()
    if (st.f !== 'todos') p.set('f', st.f); if (st.q) p.set('q', st.q); if (st.page > 1) p.set('page', String(st.page)); if (st.pp !== 14) p.set('pp', String(st.pp))
    if (st.sort) { p.set('sort', st.sort); p.set('dir', st.dir) } if (sel) p.set('sel', sel)
    window.history.replaceState(null, '', `${window.location.pathname}${p.toString() ? `?${p}` : ''}`)
  }, [st, sel])

  const escolher = (r: MembroLinha) => {
    setSel(r.id); setSelRow(r); setDrawer(true)
    // painel visível: em telas largas o painel é sticky; em estreitas abre como gaveta. Garante topo do painel no xl.
    if (window.innerWidth < 1280) requestAnimationFrame(() => painelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })) // no xl o painel já está ao lado: sem rolar a página
  }
  const ordenar = (k: string) => setSt((s) => ({ ...s, sort: k, dir: s.sort === k && s.dir === 'asc' ? 'desc' : 'asc', page: 1 }))
  const c = dados.contagens
  const ABAS: { id: MembrosFiltro; t: string; n: number }[] = [
    { id: 'todos', t: 'Todos', n: c.total + c.bloqueados }, { id: 'ativos', t: 'Ativos', n: c.ativos },
    { id: 'risco', t: 'Sem acesso há dias', n: c.risco }, { id: 'bloq', t: 'Bloqueados', n: c.bloqueados },
  ]
  const totalPag = Math.max(1, Math.ceil(dados.total / st.pp))
  const ini = dados.total === 0 ? 0 : (st.page - 1) * st.pp + 1, fim = Math.min(st.page * st.pp, dados.total)
  const seta = (k: string) => st.sort === k ? (st.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null
  const recarregarTudo = useCallback(() => { PAG_CACHE.clear(); return carregar(st) }, [carregar, st])

  return (
    <>
      <MembrosTopo grupos={grupos} podeCriar={podeCriar} onMudou={recarregarTudo}>
        <KpisCs itens={[
          { valor: c.total, rotulo: 'membros com acesso' }, { valor: c.semana, rotulo: 'entraram nesta semana' },
          { valor: c.risco, rotulo: 'sem acesso há 7 dias', alerta: c.risco > 0 }, { valor: c.bloqueados, rotulo: 'bloqueados' },
        ]} />
      </MembrosTopo>
      {!c.migrado && <div className="mb-4"><NotaCs tom="aviso">Bloqueio de acesso e “último acesso” dependem da migração <b>20261112040000</b> (CS).</NotaCs></div>}

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, e-mail, CPF ou telefone do aluno" aria-label="Buscar membro" autoComplete="off"
          className="h-11 w-full rounded-xl border bg-card pl-10 pr-10 text-[13.5px] outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20" />
        {carregando && <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Carregando" />}
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="Filtro de membros">
        {ABAS.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={st.f === a.id} onClick={() => setSt((s) => ({ ...s, f: a.id, page: 1 }))}
            className={cn('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors', st.f === a.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {a.t}<span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', st.f === a.id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{a.n.toLocaleString('pt-BR')}</span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 xl:items-stretch xl:grid-cols-[minmax(0,9fr)_minmax(0,11fr)]">
        <section className="flex min-w-0 flex-col rounded-2xl border bg-card shadow-sm" aria-busy={carregando}>
          <div className="grid grid-cols-[minmax(0,1fr)_9rem_7rem] gap-2 border-b bg-muted/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground max-md:grid-cols-[minmax(0,1fr)_7rem]">
            <button type="button" className="flex items-center gap-1 text-left" onClick={() => ordenar('nome')}>Membro {seta('nome')}</button>
            <span className="max-md:hidden">Situação</span>
            <button type="button" className="flex items-center gap-1 text-left" onClick={() => ordenar('ultimo_acesso')}>Último acesso {seta('ultimo_acesso')}</button>
          </div>
          <div className={cn('divide-y transition-opacity', carregando && 'opacity-70')} style={{ minHeight: st.pp * 57 }}>
            {erro && <div className="p-6 text-center text-sm"><p className="mb-2 text-destructive">Não foi possível carregar a lista ({erro}).</p><Button variant="outline" onClick={() => carregar(st)}>Tentar de novo</Button></div>}
            {!erro && dados.rows.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum membro encontrado{st.q ? ` para “${st.q}”` : ''}.</p>}
            {dados.rows.map((r) => (
              <button key={r.id} type="button" onClick={() => escolher(r)} onPointerEnter={() => prefetchFicha(r.id)} aria-current={sel === r.id}
                className={cn('grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_9rem_7rem] items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 max-md:grid-cols-[minmax(0,1fr)_7rem]', sel === r.id && 'bg-primary/10 shadow-[inset_3px_0_0_0_var(--primary)]')}>
                <span className="flex min-w-0 items-center gap-2.5">
                  <AvatarMembro nome={r.nome} avatar={r.avatar} cor={r.avatarCor} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{r.nome}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.email ?? '—'}</span>
                  </span>
                </span>
                <span className="max-md:hidden"><PillStatusMembro bloqueado={r.bloqueado} risco={r.risco} /></span>
                <span className="text-xs text-muted-foreground">{r.ultimoTxt}</span>
              </button>
            ))}
          </div>
          <div className="flex h-14 shrink-0 flex-nowrap items-center justify-between gap-2 border-t px-3 text-xs text-muted-foreground">
            <span className="shrink-0 whitespace-nowrap">{dados.total === 0 ? 'Nenhum registro' : `${ini.toLocaleString('pt-BR')}–${fim.toLocaleString('pt-BR')} de ${dados.total.toLocaleString('pt-BR')}`}</span>
            <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap" title="Alunos por página"><span className="max-2xl:sr-only">Por página</span>
              <select className="h-8 rounded-lg border bg-background px-2 text-xs" value={st.pp} onChange={(e) => setSt((s) => ({ ...s, pp: Number(e.target.value), page: 1 }))}>{PP.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <nav className="flex shrink-0 items-center gap-1" aria-label="Paginação">
              <Button variant="outline" size="icon-sm" disabled={st.page <= 1 || carregando} onClick={() => setSt((s) => ({ ...s, page: 1 }))} aria-label="Primeira página"><ChevronsLeft /></Button>
              <Button variant="outline" size="icon-sm" disabled={st.page <= 1 || carregando} onClick={() => setSt((s) => ({ ...s, page: s.page - 1 }))} aria-label="Página anterior"><ChevronLeft /></Button>
              {paginas(st.page, totalPag).map((p, i) => p === '…' ? <span key={`e${i}`} className="px-1">…</span> : (
                <Button key={p} variant={p === st.page ? 'default' : 'outline'} size="icon-sm" disabled={carregando} onClick={() => setSt((s) => ({ ...s, page: p }))} aria-label={`Página ${p}`} aria-current={p === st.page ? 'page' : undefined}>{p}</Button>))}
              <Button variant="outline" size="icon-sm" disabled={st.page >= totalPag || carregando} onClick={() => setSt((s) => ({ ...s, page: s.page + 1 }))} aria-label="Próxima página"><ChevronRight /></Button>
              <Button variant="outline" size="icon-sm" disabled={st.page >= totalPag || carregando} onClick={() => setSt((s) => ({ ...s, page: totalPag }))} aria-label="Última página"><ChevronsRight /></Button>
            </nav>
          </div>
        </section>

        {/* Painel: coluna sticky em telas largas; gaveta sobre a lista nas estreitas */}
        {drawer && <button type="button" aria-label="Fechar painel" className="fixed inset-0 z-40 bg-black/50 xl:hidden" onClick={() => setDrawer(false)} />}
        <div ref={painelRef} className={cn(
          drawer ? 'fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-hidden bg-background p-2 shadow-2xl' : 'hidden',
          'xl:relative xl:min-h-[640px] xl:z-auto xl:block xl:max-w-none xl:bg-transparent xl:p-0 xl:shadow-none xl:[&>section]:absolute xl:[&>section]:inset-0')}>
          {selRow ? (
            <FichaPainel key={selRow.id} membro={selRow} podeEditar={podeEditar} podeRemover={podeRemover} onFechar={() => setDrawer(false)} onMudou={recarregarTudo} onRemovido={() => { setSel(null); setSelRow(null); setDrawer(false); PAG_CACHE.clear(); carregar(st) }} />
          ) : (
            <section className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">Escolha um membro na lista para ver a ficha completa.</section>
          )}
        </div>
      </div>
    </>
  )
}
