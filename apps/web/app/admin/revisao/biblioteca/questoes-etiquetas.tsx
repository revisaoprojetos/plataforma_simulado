'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, ArrowUpDown, Copy, Eye, Loader2, Merge, Pencil, Plus, RefreshCw, Search, Tag, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import type {
  DetalheEtiqueta, EtiquetaQ, FiltroEtiquetas, FuncaoEtiquetaQ, ListaEtiquetas, OrdemEtiquetas, PreviaExcluir, PreviaMesclar, QuestaoMini,
} from '@/lib/admin-revisao/questoes-etiquetas-tipos'
import { CORES, FUNCOES, FuncaoSelect, PaletaCor } from '@/app/admin/etiquetas/etiquetas-client'
import { PaginacaoBib } from './paginacao-bib'

// SUB-ABA ETIQUETAS (Biblioteca > Questões). Gerenciador das etiquetas do banco: lista com cor/nome/nº de questões reais (SQL agregado no servidor),
// busca, filtros e ordenação no servidor, indicadores, criar/renomear/cor/função, excluir com prévia, mesclar (várias), detalhe em painel lateral
// (distribuição, questões recentes, remover/aplicar em massa) e atalho para o Banco já filtrado. Tudo por rota de API com cache de cliente de 60 s.

const URL_E = '/api/admin/revisao/biblioteca/questoes-etiquetas'
const TTL = 60_000
const CACHE = new Map<string, { t: number; v: any }>()
const EM_VOO = new Map<string, Promise<any>>()
type Resp<T> = T & { ok: boolean; error?: string }

const qs = (p: Record<string, string | number | boolean | undefined | null>) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '' && v !== false) u.set(k, v === true ? '1' : String(v)); return u.toString() }
async function ler<T = any>(p: Record<string, string | number | boolean | undefined | null>, fresh = false): Promise<Resp<T>> {
  const k = qs(p)
  if (!fresh) { const e = CACHE.get(k); if (e && Date.now() - e.t < TTL) return e.v }
  const kk = fresh ? `${k}&fresh=1` : k
  const voo = EM_VOO.get(kk); if (voo) return voo
  const pr = (async () => {
    try {
      const r = await fetch(`${URL_E}?${kk}`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))
      if (r.ok && j?.ok !== false) CACHE.set(k, { t: Date.now(), v: j })
      return j
    } catch { return { ok: false, error: 'Falha de rede.' } } finally { EM_VOO.delete(kk) }
  })()
  EM_VOO.set(kk, pr)
  return pr
}
const prefetch = (p: Record<string, string | number | boolean | undefined | null>) => { if (!CACHE.has(qs(p))) void ler(p).catch(() => {}) }
async function postar<T = any>(acao: string, corpo: Record<string, unknown>): Promise<Resp<T>> {
  try {
    const r = await fetch(URL_E, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao, ...corpo }) })
    const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))
    CACHE.clear()
    return j
  } catch { return { ok: false, error: 'Falha de rede.' } as any }
}

const PP = [10, 14, 25, 50, 100]
const FILTROS: { id: FiltroEtiquetas; nome: string }[] = [
  { id: '', nome: 'Todas as etiquetas' }, { id: 'mais_usadas', nome: 'Mais usadas (top 10)' }, { id: 'sem_uso', nome: 'Sem uso' },
  { id: 'duplicadas', nome: 'Nome repetido' }, { id: 'funcao', nome: 'Com função no simulado' },
]
const funcInfo = (f?: FuncaoEtiquetaQ | null) => FUNCOES.find((x) => x.id === f) ?? null
const COR_PADRAO = 'var(--muted-foreground)'
const fundo = (cor: string) => `color-mix(in srgb, ${cor} 14%, transparent)`
const n = (v: number) => v.toLocaleString('pt-BR')
const thCls = 'whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground'
const campo = 'h-9 w-full rounded-lg border bg-background px-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/40'
const selectBarra = 'h-9 rounded-lg border bg-card px-2.5 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40'

function Chip({ nome, cor }: { nome: string; cor?: string | null }) {
  const c = cor || COR_PADRAO
  return <span className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: fundo(c), color: c }}><Tag className="h-3 w-3 shrink-0" /><span className="truncate">{nome}</span></span>
}
function Carregando({ linhas = 8 }: { linhas?: number }) {
  return <div className="animate-pulse space-y-2 p-3" aria-busy="true" aria-label="Carregando">{Array.from({ length: linhas }).map((_, i) => <div key={i} className="h-9 rounded-lg bg-muted" style={{ width: `${96 - (i % 4) * 8}%` }} />)}</div>
}
function ErroTentar({ msg, onTentar }: { msg: string; onTentar: () => void }) {
  return <div className="m-3 rounded-xl border p-4 text-center text-sm"><p className="mb-2 text-destructive">Não foi possível carregar ({msg}).</p><Button variant="outline" onClick={onTentar}>Tentar de novo</Button></div>
}
function Vazio({ children }: { children: React.ReactNode }) { return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{children}</p> }

/** `inicial` = 1ª página (nome A-Z, 14/página) lida no servidor (carregarInicialEtiquetas): renderiza na hora, sem chamada no load. */
export function QuestoesEtiquetas({ podeEditar, inicial }: { podeEditar: boolean; inicial?: ListaEtiquetas | null }) {
  const router = useRouter()
  const [filtro, setFiltro] = useState<FiltroEtiquetas>('')
  const [busca, setBusca] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<OrdemEtiquetas>('nome')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [pp, setPp] = useState(14)
  const [dados, setDados] = useState<ListaEtiquetas | null>(inicial ?? null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(!inicial)
  const [marcadas, setMarcadas] = useState<Map<string, EtiquetaQ>>(new Map())
  const [editor, setEditor] = useState<{ et: EtiquetaQ | null } | null>(null)
  const [excluindo, setExcluindo] = useState<EtiquetaQ | null>(null)
  const [mescla, setMescla] = useState<{ origens: MiniEt[]; entre: boolean } | null>(null)
  const [detalhe, setDetalhe] = useState<EtiquetaQ | null>(null)
  const seq = useRef(0)

  const params = useMemo(() => ({ s: 'lista', q, filtro, sort, dir, page, pp }), [q, filtro, sort, dir, page, pp])
  // Semeia o cache do cliente com o SSR (uma vez): voltar à visão padrão, ou o efeito abaixo, responde sem rede.
  const semeado = useRef(false)
  if (!semeado.current) { semeado.current = true; if (inicial && !CACHE.has(qs(params))) CACHE.set(qs(params), { t: Date.now(), v: { ok: true, ...inicial } }) }
  const carregar = useCallback(async (fresh = false) => {
    const mine = ++seq.current; setErro(null)
    const j = await ler<ListaEtiquetas>(params, fresh)
    if (mine !== seq.current) return
    if (j.ok) setDados(j); else setErro(j.error ?? 'Falha ao carregar.')
    setCarregando(false)
  }, [params])
  useEffect(() => { if (!CACHE.has(qs(params))) setCarregando(true); void carregar() }, [carregar, params])
  useEffect(() => { const t = setTimeout(() => { if (busca.trim() !== q) { setQ(busca.trim()); setPage(1) } }, 300); return () => clearTimeout(t) }, [busca, q])
  // Próxima página: NÃO é buscada no load. Só quando o navegador fica ocioso (≥ 2,5 s depois) ou ao passar o mouse na paginação.
  const prefetchProxima = useCallback(() => { if (dados && page * pp < dados.total) prefetch({ ...params, page: page + 1 }) }, [dados, page, pp, params])
  useEffect(() => { const t = setTimeout(prefetchProxima, 2500); return () => clearTimeout(t) }, [prefetchProxima])

  const itens = dados?.itens ?? []
  const ind = dados?.indicadores
  const ordenar = (k: OrdemEtiquetas) => { setPage(1); if (sort === k) setDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSort(k); setDir(k === 'nome' ? 'asc' : 'desc') } }
  const Th = ({ k, children, className }: { k: OrdemEtiquetas; children: React.ReactNode; className?: string }) => (
    <th className={cn(thCls, className)} aria-sort={sort === k ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => ordenar(k)} className="inline-flex items-center gap-1 uppercase hover:text-foreground">{children}<ArrowUpDown className={cn('h-3 w-3', sort === k ? 'text-primary' : 'text-muted-foreground/50')} /></button>
    </th>
  )
  const abrirBanco = (p: Record<string, string>) => router.push(`/admin/revisao/biblioteca?${new URLSearchParams({ aba: 'questoes', modo: 'banco', ...p })}`)
  const verNoBanco = (e: { id: string }) => abrirBanco({ ag: 'etiqueta', no: `e:${e.id}` })
  const alternar = (e: EtiquetaQ) => setMarcadas((m) => { const x = new Map(m); if (x.has(e.id)) x.delete(e.id); else x.set(e.id, e); return x })
  const todasMarcadas = itens.length > 0 && itens.every((e) => marcadas.has(e.id))
  const aposMutar = () => { setMarcadas(new Map()); void carregar(true) }
  const filtrar = (f: FiltroEtiquetas) => { setFiltro(f); setPage(1) }

  return (
    <section className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-2xl border bg-card p-2 shadow-sm xl:h-[calc(100vh-9.5rem)]" aria-label="Etiquetas das questões">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 px-2 pt-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Etiquetas das questões</h2>
        <div className="flex flex-wrap items-center gap-2">
          {carregando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Carregando" />}
          <Button size="sm" variant="outline" onClick={() => { setCarregando(true); void carregar(true) }} aria-label="Atualizar lista"><RefreshCw />Atualizar</Button>
          {podeEditar && <Button size="sm" onClick={() => setEditor({ et: null })}><Plus />Nova etiqueta</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 px-2 pt-1 md:grid-cols-5">
        <Kpi rotulo="Etiquetas" valor={ind?.etiquetas} ativo={filtro === ''} onClick={() => filtrar('')} />
        <Kpi rotulo="Sem uso" valor={ind?.semUso} ativo={filtro === 'sem_uso'} onClick={() => filtrar('sem_uso')} dica="Etiquetas que nenhuma questão usa" />
        <Kpi rotulo="Questões sem etiqueta" valor={ind?.semEtiqueta} sub={ind ? `de ${n(ind.totalQuestoes)} no banco` : undefined} onClick={() => abrirBanco({ vis: 'sem_etiqueta' })} dica="Abrir no Banco as questões sem nenhuma etiqueta" externo />
        <Kpi rotulo="Nomes repetidos" valor={ind?.duplicadas.length} sub="grupos para mesclar" ativo={filtro === 'duplicadas'} onClick={() => filtrar('duplicadas')} alerta={(ind?.duplicadas.length ?? 0) > 0} />
        <Kpi rotulo="Com função" valor={ind?.comFuncao} sub="anular · avisar · desconsiderar" ativo={filtro === 'funcao'} onClick={() => filtrar('funcao')} />
      </div>

      {podeEditar && (ind?.duplicadas.length ?? 0) > 0 && filtro !== 'duplicadas' && (
        <div className="mx-2 mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1"><b>{ind!.duplicadas.length}</b> {ind!.duplicadas.length === 1 ? 'etiqueta tem' : 'etiquetas têm'} o mesmo nome (ex.: {ind!.duplicadas[0].itens.map((i) => `“${i.nome}”`).join(' e ')}). Mesclar junta as questões sem perder vínculo.</span>
          <Button size="xs" variant="outline" onClick={() => setMescla({ origens: ind!.duplicadas[0].itens, entre: true })}><Merge />Mesclar este grupo</Button>
          <Button size="xs" variant="ghost" onClick={() => filtrar('duplicadas')}>Ver todas</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b px-2 pb-2.5 pt-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar etiqueta" aria-label="Buscar etiqueta" className={cn(campo, 'pl-8')} autoComplete="off" />
        </div>
        <select className={selectBarra} value={filtro} onChange={(e) => filtrar(e.target.value as FiltroEtiquetas)} aria-label="Filtrar etiquetas">{FILTROS.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
        <select className={selectBarra} value={`${sort}:${dir}`} onChange={(e) => { const [s, d] = e.target.value.split(':'); setSort(s as OrdemEtiquetas); setDir(d as 'asc' | 'desc'); setPage(1) }} aria-label="Ordenar etiquetas">
          <option value="nome:asc">Nome (A-Z)</option><option value="nome:desc">Nome (Z-A)</option>
          <option value="questoes:desc">Mais questões</option><option value="questoes:asc">Menos questões</option>
          <option value="simulados:desc">Mais em simulados</option><option value="ultimo:desc">Usada recentemente</option><option value="criada:desc">Criada recentemente</option>
        </select>
        {(q || filtro) && <button type="button" onClick={() => { setBusca(''); setQ(''); setFiltro(''); setPage(1) }} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" />Limpar</button>}
        {podeEditar && marcadas.size > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-2 py-1 text-xs">
            <b>{marcadas.size}</b> marcada(s)
            <Button size="xs" disabled={marcadas.size < 2} onClick={() => setMescla({ origens: [...marcadas.values()], entre: true })} title={marcadas.size < 2 ? 'Marque ao menos duas' : 'Mesclar as marcadas'}><Merge />Mesclar</Button>
            <Button size="xs" variant="ghost" onClick={() => setMarcadas(new Map())}><X />Limpar</Button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {erro && !dados ? <ErroTentar msg={erro} onTentar={() => void carregar(true)} /> : !dados ? <Carregando /> : (
          <div className={cn('min-h-0 flex-1 overflow-auto', carregando && 'opacity-70')}>
            {dados.degradado && <p className="m-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">Consulta SQL indisponível: contagens no modo reduzido (sem “em simulados” e “última atualização”). Verifique DATABASE_URL.</p>}
            <table className="w-full min-w-[920px] text-sm">
              <thead className="sticky top-0 z-10 bg-card"><tr className="border-b">
                <th className={cn(thCls, 'w-8')}>{podeEditar && <input type="checkbox" className="h-4 w-4 accent-primary" checked={todasMarcadas} onChange={() => setMarcadas((m) => { const x = new Map(m); if (todasMarcadas) itens.forEach((e) => x.delete(e.id)); else itens.forEach((e) => x.set(e.id, e)); return x })} aria-label="Marcar todas desta página" />}</th>
                <Th k="nome">Etiqueta</Th><th className={thCls}>Função</th>
                <Th k="questoes" className="text-right">Questões</Th><Th k="simulados" className="text-right">Em simulados</Th>
                <Th k="ultimo">Última atualização</Th><Th k="criada">Criada em</Th><th className={cn(thCls, 'text-right')}>Ações</th>
              </tr></thead>
              <tbody>
                {itens.length === 0 && <tr><td colSpan={8}><Vazio>{q || filtro ? 'Nenhuma etiqueta com esta busca/filtro.' : 'Nenhuma etiqueta cadastrada. Use “Nova etiqueta”.'}</Vazio></td></tr>}
                {itens.map((e) => {
                  const f = funcInfo(e.funcao)
                  return (
                    <tr key={e.id} className={cn('border-b last:border-0 hover:bg-muted/30', marcadas.has(e.id) && 'bg-primary/5')}>
                      <td className="px-3 py-2.5">{podeEditar && <input type="checkbox" className="h-4 w-4 accent-primary" checked={marcadas.has(e.id)} onChange={() => alternar(e)} aria-label={`Marcar ${e.nome}`} />}</td>
                      <td className="px-3 py-2.5">
                        <button type="button" onClick={() => setDetalhe(e)} onPointerEnter={() => prefetch({ s: 'detalhe', id: e.id })} className="max-w-full text-left" title="Abrir detalhes" aria-label={`Detalhes da etiqueta ${e.nome}`}><Chip nome={e.nome} cor={e.cor} /></button>
                        {e.grupoDup && <span className="ml-1.5 rounded-full border border-amber-500/50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400" title="Existe outra etiqueta com o mesmo nome">repetida</span>}
                        {e.questoes === 0 && <span className="ml-1.5 text-[10px] text-muted-foreground">sem uso</span>}
                      </td>
                      <td className="px-3 py-2.5">{f ? <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground" title={f.desc}>{f.badge}</span> : <span className="text-xs text-muted-foreground">só rótulo</span>}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {e.questoes > 0 ? <button type="button" onClick={() => verNoBanco(e)} className="font-medium text-primary hover:underline" title="Abrir estas questões no Banco">{n(e.questoes)}</button> : <span className="text-muted-foreground">0</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{n(e.emSimulados)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{e.ultimoUso ? formatBrt(e.ultimoUso) : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{e.criadoEm ? formatBrt(e.criadoEm) : '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button size="icon-sm" variant="outline" title="Detalhes da etiqueta" aria-label={`Detalhes de ${e.nome}`} onClick={() => setDetalhe(e)}><Search /></Button>
                          <Button size="icon-sm" variant="outline" title="Ver as questões no Banco" aria-label={`Ver questões da etiqueta ${e.nome} no Banco`} disabled={e.questoes === 0} onClick={() => verNoBanco(e)}><Eye /></Button>
                          {podeEditar && <>
                            <Button size="icon-sm" variant="outline" title="Editar nome, cor e função" aria-label={`Editar ${e.nome}`} onClick={() => setEditor({ et: e })}><Pencil /></Button>
                            <Button size="icon-sm" variant="outline" title="Mesclar em outra etiqueta" aria-label={`Mesclar ${e.nome}`} disabled={(ind?.etiquetas ?? 0) < 2} onClick={() => setMescla({ origens: [e], entre: false })}><Merge /></Button>
                            <Button size="icon-sm" variant="outline" title="Excluir" aria-label={`Excluir ${e.nome}`} onClick={() => setExcluindo(e)}><Trash2 /></Button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="px-2" onPointerEnter={prefetchProxima}>
        <PaginacaoBib total={dados?.total ?? 0} page={page} pp={pp} opcoesPP={PP} selecionados={0} carregando={carregando} rotuloVazio="Nenhuma etiqueta" onPage={setPage} onPP={(x) => { setPp(x); setPage(1) }} />
      </div>

      {editor && <EditorEtiqueta et={editor.et} onClose={() => setEditor(null)} onSalvo={() => { setEditor(null); aposMutar() }} />}
      {excluindo && <ExcluirDialog et={excluindo} onClose={() => setExcluindo(null)} onFeito={() => { setExcluindo(null); aposMutar() }} />}
      {mescla && <MesclarDialog origens={mescla.origens} entre={mescla.entre} onClose={() => setMescla(null)} onFeito={() => { setMescla(null); aposMutar() }} />}
      {detalhe && <DetalheDrawer et={detalhe} podeEditar={podeEditar} onClose={() => setDetalhe(null)} onVer={() => verNoBanco(detalhe)} onMudou={() => void carregar(true)}
        onMesclar={() => { setMescla({ origens: [detalhe], entre: false }); setDetalhe(null) }} onEditar={() => { setEditor({ et: detalhe }); setDetalhe(null) }} />}
    </section>
  )
}

function Kpi({ rotulo, valor, sub, onClick, ativo, alerta, dica, externo }: { rotulo: string; valor?: number; sub?: string; onClick: () => void; ativo?: boolean; alerta?: boolean; dica?: string; externo?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={dica} aria-pressed={ativo}
      className={cn('rounded-xl border p-2.5 text-left transition-colors hover:bg-muted/40', ativo && 'border-primary bg-primary/5', alerta && !ativo && 'border-amber-500/50')}>
      <span className="flex items-center justify-between gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}{externo && <Eye className="h-3 w-3" />}</span>
      <span className="mt-0.5 block text-2xl font-semibold tabular-nums leading-tight">{valor === undefined ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-muted align-middle" /> : n(valor)}</span>
      {sub && <span className="block truncate text-[11px] text-muted-foreground">{sub}</span>}
    </button>
  )
}

function EditorEtiqueta({ et, onClose, onSalvo }: { et: EtiquetaQ | null; onClose: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(et?.nome ?? '')
  const [cor, setCor] = useState(et?.cor ?? CORES[5])
  const [funcao, setFuncao] = useState<FuncaoEtiquetaQ | ''>(et?.funcao ?? '')
  const [salvando, setSalvando] = useState(false)
  async function salvar() {
    if (!nome.trim()) return
    setSalvando(true)
    const r = et ? await postar('atualizar', { id: et.id, nome: nome.trim(), cor, funcao: funcao || null }) : await postar('criar', { nome: nome.trim(), cor, funcao: funcao || null })
    setSalvando(false)
    if (!r.ok) { toast.error(r.error || 'Não foi possível salvar.'); return }
    toast.success(et ? 'Etiqueta atualizada.' : 'Etiqueta criada.'); onSalvo()
  }
  const mudouFuncao = !!et && (et.funcao ?? '') !== funcao && et.questoes > 0
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salvando) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{et ? 'Editar etiqueta' : 'Nova etiqueta'}</DialogTitle>
          <DialogDescription>Nome, cor e função no simulado. A cor vem da paleta das etiquetas do sistema.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Nome
            <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void salvar() }} maxLength={60} aria-label="Nome da etiqueta" className={cn(campo, 'font-normal text-foreground')} />
          </label>
          <div><p className="mb-1.5 text-xs font-medium text-muted-foreground">Cor</p><PaletaCor value={cor} onChange={setCor} /></div>
          <div><p className="mb-1.5 text-xs font-medium text-muted-foreground">Função (comportamento no simulado)</p><FuncaoSelect value={funcao} onChange={setFuncao} /></div>
          {mudouFuncao && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">Mudar a função altera a correção das {n(et!.questoes)} questões que têm esta etiqueta{et!.emSimulados ? ` (${n(et!.emSimulados)} em simulados)` : ''}.</p>}
          <div><Chip nome={nome.trim() || 'Prévia'} cor={cor} /></div>
        </div>
        <div className="-mx-4 -mb-4 mt-2 flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando || !nome.trim()}>{salvando && <Loader2 className="animate-spin" />}{et ? 'Salvar' : 'Criar etiqueta'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ExcluirDialog({ et, onClose, onFeito }: { et: EtiquetaQ; onClose: () => void; onFeito: () => void }) {
  const [p, setP] = useState<Resp<PreviaExcluir> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { let vivo = true; void ler<PreviaExcluir>({ s: 'previa_excluir', id: et.id }, true).then((j) => { if (!vivo) return; if (j.ok) setP(j); else setErro(j.error ?? 'Falha ao calcular a prévia.') }); return () => { vivo = false } }, [et.id])
  async function excluir() {
    setEnviando(true); const r = await postar('excluir', { id: et.id }); setEnviando(false)
    if (!r.ok) { toast.error(r.error || 'Não foi possível excluir.'); return }
    toast.success('Etiqueta excluída.'); onFeito()
  }
  const f = funcInfo(p?.funcao)
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !enviando) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir a etiqueta “{et.nome}”?</DialogTitle>
          <DialogDescription>A exclusão não pode ser desfeita. Para juntar com outra etiqueta sem perder os vínculos, use “Mesclar”.</DialogDescription>
        </DialogHeader>
        {erro ? <p className="text-sm text-destructive">{erro}</p> : !p ? <Carregando linhas={3} /> : (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <p>{p.questoes > 0 ? <><b>{n(p.questoes)}</b> {p.questoes === 1 ? 'questão perde' : 'questões perdem'} esta etiqueta.</> : 'Nenhuma questão usa esta etiqueta.'}</p>
            {p.emSimulados > 0 && <p><b>{n(p.emSimulados)}</b> {p.emSimulados === 1 ? 'delas está' : 'delas estão'} em simulados.</p>}
            {f && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">Atenção: ela tem a função “{f.nome}”. Ao excluir, as questões deixam de ser {p.funcao === 'anular' ? 'anuladas' : p.funcao === 'desconsiderar' ? 'desconsideradas' : 'avisadas'} nos simulados.</p>}
          </div>
        )}
        <div className="-mx-4 -mb-4 mt-2 flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button variant="destructive" disabled={!p || enviando} onClick={() => void excluir()}>{enviando && <Loader2 className="animate-spin" />}Excluir</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type MiniEt = { id: string; nome: string; questoes: number }
/** `entre`: o destino é escolhido entre as próprias etiquetas listadas (as outras são absorvidas). Senão: origens fixas e destino buscado na lista. */
function MesclarDialog({ origens, entre, onClose, onFeito }: { origens: MiniEt[]; entre: boolean; onClose: () => void; onFeito: () => void }) {
  const [destino, setDestino] = useState(entre ? [...origens].sort((a, b) => b.questoes - a.questoes)[0]?.id ?? '' : '')
  const [busca, setBusca] = useState('')
  const [opcoes, setOpcoes] = useState<EtiquetaQ[] | null>(null)
  const [previa, setPrevia] = useState<Resp<PreviaMesclar> | null>(null)
  const [erroP, setErroP] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  useEffect(() => {
    if (entre) return
    const t = setTimeout(() => { void ler<ListaEtiquetas>({ s: 'lista', q: busca, sort: 'nome', dir: 'asc', page: 1, pp: 25 }).then((j) => { if (j.ok) setOpcoes(j.itens) }) }, 200)
    return () => clearTimeout(t)
  }, [busca, entre])
  const fontes = entre ? origens.filter((o) => o.id !== destino) : origens
  useEffect(() => {
    setPrevia(null); setErroP(null)
    if (!destino || !fontes.length) return
    let vivo = true
    void ler<PreviaMesclar>({ s: 'previa_mesclar', destino, origens: fontes.map((o) => o.id).join(',') }, true).then((j) => { if (!vivo) return; if (j.ok) setPrevia(j); else setErroP(j.error ?? 'Falha na prévia.') })
    return () => { vivo = false }
  }, [destino]) // eslint-disable-line react-hooks/exhaustive-deps
  async function mesclar() {
    setEnviando(true); const r = await postar('mesclar', { origemIds: fontes.map((o) => o.id), destinoId: destino }); setEnviando(false)
    if (!r.ok) { toast.error(`${r.error || 'Não foi possível mesclar.'}${r.mescladas ? ` (${r.mescladas} já mesclada(s))` : ''}`); if (r.mescladas) onFeito(); return }
    toast.success(`${r.mescladas} etiqueta(s) mesclada(s) em “${r.destino}” (${n(r.movidas)} vínculo(s) movido(s)).`); onFeito()
  }
  const lista = entre ? origens : (opcoes ?? []).filter((e) => !origens.some((o) => o.id === e.id))
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !enviando) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{entre ? `Mesclar ${origens.length} etiquetas` : `Mesclar “${origens[0]?.nome}”`}</DialogTitle>
          <DialogDescription>{entre ? 'Escolha a etiqueta que fica. As outras passam as questões para ela (sem duplicar vínculo) e são excluídas.' : 'As questões desta etiqueta passam para a etiqueta de destino e esta é excluída. Ninguém perde a classificação.'}</DialogDescription>
        </DialogHeader>
        {!entre && <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar a etiqueta de destino" aria-label="Buscar etiqueta de destino" className={campo} autoFocus />}
        <ul className="max-h-48 space-y-0.5 overflow-auto rounded-lg border p-1" role="radiogroup" aria-label="Etiqueta que fica">
          {lista.length === 0 && <li className="p-3 text-center text-xs text-muted-foreground">{opcoes ? 'Nenhuma etiqueta encontrada.' : 'Carregando…'}</li>}
          {lista.map((e) => (
            <li key={e.id}><label className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted', destino === e.id && 'bg-primary/10')}>
              <input type="radio" name="destino" className="accent-primary" checked={destino === e.id} onChange={() => setDestino(e.id)} />
              <span className="min-w-0 flex-1 truncate">{e.nome}</span><span className="text-xs tabular-nums text-muted-foreground">{n(e.questoes)}</span>
            </label></li>
          ))}
        </ul>
        {erroP && <p className="text-xs text-destructive">{erroP}</p>}
        {previa?.funcaoDiferente && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs">Há etiquetas com funções diferentes do destino. Mesclar mudaria a correção dos simulados; o servidor não permite.</p>}
        {previa && (
          <div className="rounded-lg border bg-muted/30 p-2.5 text-xs leading-relaxed">
            <p>Serão excluídas: {previa.origens.map((o) => `${o.nome} (${n(o.questoes)})`).join(', ')}.</p>
            <p>“{previa.destino}” ficará com <b>{n(previa.resultado)}</b> {previa.resultado === 1 ? 'questão distinta' : 'questões distintas'}.</p>
          </div>
        )}
        <div className="-mx-4 -mb-4 mt-2 flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button disabled={!destino || !previa || previa.funcaoDiferente || enviando} onClick={() => void mesclar()}>{enviando && <Loader2 className="animate-spin" />}Mesclar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type AbaD = 'resumo' | 'questoes' | 'aplicar'
function DetalheDrawer({ et, podeEditar, onClose, onVer, onMudou, onMesclar, onEditar }: { et: EtiquetaQ; podeEditar: boolean; onClose: () => void; onVer: () => void; onMudou: () => void; onMesclar: () => void; onEditar: () => void }) {
  const [aba, setAba] = useState<AbaD>('resumo')
  const [d, setD] = useState<Resp<DetalheEtiqueta> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [selR, setSelR] = useState<Set<string>>(new Set())
  const [agindo, setAgindo] = useState(false)
  const carregar = useCallback((fresh = false) => { setErro(null); void ler<DetalheEtiqueta>({ s: 'detalhe', id: et.id }, fresh).then((j) => { if (j.ok) setD(j); else setErro(j.error ?? 'Falha ao carregar.') }) }, [et.id])
  useEffect(() => { carregar() }, [carregar])
  const cor = et.cor || COR_PADRAO
  const max = (l: { n: number }[]) => Math.max(1, ...l.map((x) => x.n))
  const Barra = ({ titulo, l }: { titulo: string; l: { nome: string; n: number }[] }) => (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      {l.length === 0 ? <p className="text-xs text-muted-foreground">Sem dados.</p> : (
        <ul className="space-y-1.5">{l.map((x) => (
          <li key={x.nome} className="text-xs"><div className="flex justify-between gap-2"><span className="truncate">{x.nome}</span><span className="tabular-nums text-muted-foreground">{n(x.n)}</span></div>
            <div className="mt-0.5 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full" style={{ width: `${Math.max(4, (x.n / max(l)) * 100)}%`, background: cor }} /></div></li>
        ))}</ul>
      )}
    </div>
  )
  async function remover() {
    if (!selR.size) return
    setAgindo(true); const r = await postar('massa', { etiquetaId: et.id, ids: [...selR], modo: 'remover' }); setAgindo(false)
    if (!r.ok) { toast.error(r.error || 'Não foi possível remover.'); return }
    toast.success(`Etiqueta removida de ${n(r.atualizadas)} ${r.atualizadas === 1 ? 'questão' : 'questões'}.`); setSelR(new Set()); carregar(true); onMudou()
  }
  const ABAS: { id: AbaD; nome: string }[] = [{ id: 'resumo', nome: 'Resumo' }, { id: 'questoes', nome: 'Questões recentes' }, ...(podeEditar ? [{ id: 'aplicar' as const, nome: 'Aplicar a sem etiqueta' }] : [])]
  const f = funcInfo(et.funcao)
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl" aria-describedby={undefined}>
        <SheetHeader className="border-b p-4 pb-0">
          <SheetTitle className="flex items-center gap-2"><Chip nome={et.nome} cor={et.cor} /></SheetTitle>
          <SheetDescription>{n(et.questoes)} {et.questoes === 1 ? 'questão' : 'questões'} · {n(et.emSimulados)} em simulados · {f ? `função: ${f.nome}` : 'só rótulo'}</SheetDescription>
          <div className="-mb-px mt-2 flex gap-1 overflow-x-auto" role="tablist" aria-label="Seções da etiqueta">
            {ABAS.map((a) => (
              <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
                className={cn('-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors', aba === a.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{a.nome}</button>
            ))}
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
          {aba === 'aplicar' ? <AplicarSemEtiqueta et={et} onFeito={() => { carregar(true); onMudou() }} /> : erro && !d ? <ErroTentar msg={erro} onTentar={() => carregar(true)} /> : !d ? <Carregando linhas={5} /> : aba === 'resumo' ? (<>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border p-2.5"><p className="text-muted-foreground">Questões com a etiqueta</p><p className="text-xl font-semibold tabular-nums">{n(d.total)}</p></div>
              <div className="rounded-xl border p-2.5"><p className="text-muted-foreground">Só têm esta etiqueta</p><p className="text-xl font-semibold tabular-nums">{n(d.semOutra)}</p></div>
            </div>
            <Barra titulo="Por disciplina" l={d.porDisciplina} />
            <Barra titulo="Por banca" l={d.porBanca} />
          </>) : (
            <ListaQuestoes itens={d.recentes} sel={podeEditar ? selR : undefined} onSel={setSelR} vazio="Nenhuma questão usa esta etiqueta." />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t p-3">
          {aba === 'questoes' && podeEditar && <Button variant="outline" size="sm" disabled={!selR.size || agindo} onClick={() => void remover()}>{agindo ? <Loader2 className="animate-spin" /> : <X />}Remover desta etiqueta ({selR.size})</Button>}
          <Button variant="outline" size="sm" disabled={et.questoes === 0} onClick={onVer}><Eye />Ver no Banco</Button>
          {podeEditar && <><Button variant="outline" size="sm" onClick={onEditar}><Pencil />Editar</Button><Button variant="outline" size="sm" onClick={onMesclar}><Merge />Mesclar</Button></>}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ListaQuestoes({ itens, sel, onSel, vazio }: { itens: QuestaoMini[]; sel?: Set<string>; onSel?: (s: Set<string>) => void; vazio: string }) {
  if (itens.length === 0) return <Vazio>{vazio}</Vazio>
  const alternar = (id: string) => { if (!sel || !onSel) return; const x = new Set(sel); if (x.has(id)) x.delete(id); else x.add(id); onSel(x) }
  return (
    <ul className="divide-y rounded-xl border">{itens.map((r) => (
      <li key={r.id} className="flex items-start gap-2 p-2.5 text-xs">
        {sel && <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={sel.has(r.id)} onChange={() => alternar(r.id)} aria-label={`Selecionar questão ${r.codigo ?? ''}`} />}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-foreground">{r.enunciado || '(sem enunciado)'}</p>
          <p className="mt-0.5 flex items-center gap-1 text-muted-foreground"><span className="truncate">{[r.codigo, r.disciplina, r.banca, r.atualizadoEm ? formatBrt(r.atualizadoEm) : null].filter(Boolean).join(' · ')}</span>
            <button type="button" className="shrink-0 hover:text-foreground" title="Copiar ID da questão" aria-label="Copiar ID da questão" onClick={() => { void navigator.clipboard?.writeText(r.id); toast.success('ID copiado.') }}><Copy className="h-3 w-3" /></button></p>
        </div>
      </li>
    ))}</ul>
  )
}

function AplicarSemEtiqueta({ et, onFeito }: { et: EtiquetaQ; onFeito: () => void }) {
  const [mesma, setMesma] = useState(et.questoes > 0)
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const [r, setR] = useState<Resp<{ itens: QuestaoMini[]; restringiu: boolean }> | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [agindo, setAgindo] = useState(false)
  useEffect(() => { const t = setTimeout(() => setTermo(busca.trim()), 300); return () => clearTimeout(t) }, [busca])
  const carregar = useCallback((fresh = false) => { setR(null); void ler<{ itens: QuestaoMini[]; restringiu: boolean }>({ s: 'candidatas', id: et.id, mesma, q: termo }, fresh).then(setR) }, [et.id, mesma, termo])
  useEffect(() => { carregar() }, [carregar])
  async function aplicar() {
    if (!sel.size) return
    setAgindo(true); const x = await postar('massa', { etiquetaId: et.id, ids: [...sel], modo: 'aplicar' }); setAgindo(false)
    if (!x.ok) { toast.error(x.error || 'Não foi possível aplicar.'); return }
    toast.success(`Etiqueta aplicada a ${n(x.atualizadas)} ${x.atualizadas === 1 ? 'questão' : 'questões'}.`); setSel(new Set()); carregar(true); onFeito()
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">As 15 questões mais recentes que ainda não têm nenhuma etiqueta. Marque as que devem receber “{et.nome}”.</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-40 flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no enunciado" aria-label="Buscar questões sem etiqueta" className={cn(campo, 'pl-8')} /></div>
        {et.questoes > 0 && <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" className="accent-primary" checked={mesma} onChange={(e) => { setMesma(e.target.checked); setSel(new Set()) }} />Só das disciplinas desta etiqueta</label>}
      </div>
      {!r ? <Carregando linhas={4} /> : !r.ok ? <ErroTentar msg={r.error ?? 'erro'} onTentar={() => carregar(true)} /> : (
        <>
          <ListaQuestoes itens={r.itens} sel={sel} onSel={setSel} vazio="Nenhuma questão sem etiqueta com este critério." />
          <Button size="sm" disabled={!sel.size || agindo} onClick={() => void aplicar()}>{agindo ? <Loader2 className="animate-spin" /> : <Plus />}Aplicar a {sel.size} {sel.size === 1 ? 'questão' : 'questões'}</Button>
        </>
      )}
    </div>
  )
}
