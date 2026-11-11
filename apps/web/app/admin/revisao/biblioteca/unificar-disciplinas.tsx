'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, ChevronLeft, ChevronRight, EyeOff, FolderTree, Loader2, Lock, Merge, RefreshCw, Search, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { ROTULO_CONF_TERMO, type ConfTermo } from '@/lib/admin-revisao/questoes-termos-tipos'
import { rotuloTipoMaterial } from '@/components/biblioteca/menus-drive'
import type { CategoriaPU, GrupoPasta, HistoricoPU, InicialDisciplinas, PreviaPU, RespostaGruposPU, RespostaPastasPU, VariantePasta } from '@/lib/admin-revisao/biblioteca-pastas-unificar-tipos'
import { AbasSublinhado, Carregando, ErroTentar, PainelCard, Vazio, campoBusca, selectBarra } from './gestao-ui'
import { COR_CONF, Candidatos as CandidatosTaxonomia, Num, prefetchGruposTermos } from './unificar-termos'

// BIBLIOTECA › UNIFICAR DISCIPLINAS (pastas-disciplina dos conteúdos). Mesmo padrão do Unificar › Termos da taxonomia (Questões): candidatos à esquerda
// (detecção no servidor, cache 2 min), revisão lado a lado à direita, PRÉVIA do impacto + confirmação, mesclagem transacional em ROTA DE API,
// "São disciplinas diferentes", escolha manual e histórico com Desfazer. Este componente só LÊ/renderiza: toda a detecção e o cálculo ficam no servidor.

const URL_P = '/api/admin/revisao/biblioteca/pastas-unificar'
const TTL = 60_000
type P = Record<string, string | number | boolean | undefined | null>
const CACHE = new Map<string, { t: number; v: any }>()
const VOO = new Map<string, Promise<any>>()
const qs = (p: P) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries(p).sort(([a], [b]) => (a < b ? -1 : 1))) if (v !== undefined && v !== null && v !== '' && v !== false) u.set(k, v === true ? '1' : String(v)); return u.toString() }
async function ler<T = any>(p: P, fresh = false): Promise<T & { ok: boolean; error?: string }> {
  const k = qs(p)
  if (!fresh) { const e = CACHE.get(k); if (e && Date.now() - e.t < TTL) return e.v }
  const kk = fresh ? `${k}&fresh=1` : k
  const voo = VOO.get(kk); if (voo) return voo
  const pr = (async () => {
    try {
      const r = await fetch(`${URL_P}?${kk}`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))
      if (r.ok && j?.ok !== false) CACHE.set(k, { t: Date.now(), v: j })
      return j
    } catch { return { ok: false, error: 'Falha de rede.' } } finally { VOO.delete(kk) }
  })()
  VOO.set(kk, pr); return pr
}
const prefetch = (p: P) => { const e = CACHE.get(qs(p)); if (!e || Date.now() - e.t >= TTL) void ler(p).catch(() => {}) }
async function enviar<T = any>(corpo: Record<string, unknown>, grava = true): Promise<T & { ok: boolean; error?: string; semTabela?: boolean }> {
  try {
    const r = await fetch(URL_P, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
    const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))
    if (grava && j?.ok) CACHE.clear()
    return j
  } catch { return { ok: false, error: 'Falha de rede.' } as any }
}

// "São disciplinas diferentes": fallback no navegador quando a tabela de ignorados do servidor não existe
const LS = 'bib-pastas-ignoradas:v1'
const lerLocal = (): string[] => { try { return (JSON.parse(localStorage.getItem(LS) || '[]') as string[]) } catch { return [] } }
const gravarLocal = (ids: string[]) => { try { localStorage.setItem(LS, JSON.stringify(ids.slice(-300))) } catch { /* ignore */ } }

const fmt = (n: number) => n.toLocaleString('pt-BR')
type Vista = 'candidatos' | 'taxonomia' | 'manual' | 'historico'

export function UnificarDisciplinas({ categoria, podeEditar, podeTaxonomiaVer = false, podeTaxonomiaEditar = false, onMudou, onVoltar, inicial }: {
  /** dados do SSR (carregarInicialUnificarDisciplinas): renderiza na hora, sem chamada no load */ inicial?: InicialDisciplinas | null; categoria: CategoriaPU; podeEditar: boolean; /** questoes:view / questoes:update — a vista de taxonomia usa a rota do Unificar de termos */ podeTaxonomiaVer?: boolean; podeTaxonomiaEditar?: boolean; onMudou: () => void; onVoltar: () => void
}) {
  const [vista, setVista] = useState<Vista>('candidatos')
  const [limiar, setLimiar] = useState(0.85)
  const [versao, setVersao] = useState(0)
  const ini = inicial && inicial.categoria === categoria ? inicial : null
  const virgem = useRef(true) // o SSR só vale para a 1ª montagem da lista de candidatos
  const [resumo, setResumo] = useState<RespostaGruposPU | null>(ini?.grupos ?? null)
  const [manual, setManual] = useState<GrupoPasta | null>(null)
  const [nTax, setNTax] = useState<number | undefined>(ini?.nTax ?? undefined)
  const depoisDeMudar = useCallback(() => { CACHE.clear(); setVersao((v) => v + 1); onMudou() }, [onMudou])
  const rotulo = categoria === 'jurisclub' ? 'JurisClub' : 'Biblioteca'

  // O resumo (contagens) sai da MESMA carga da lista de candidatos (`onDados`) — antes era uma 2ª chamada (pp=5) à mesma rota.

  // nº de grupos de DISCIPLINAS DA TAXONOMIA (mesma detecção do Unificar › Termos; rota questoes-termos) — mostra se há variantes ligadas às pastas
  useEffect(() => {
    if (!podeTaxonomiaVer) return
    if (ini?.nTax != null && limiar === 0.85 && versao === 0) return // veio do SSR
    let vivo = true
    void fetch(`/api/admin/revisao/biblioteca/questoes-termos?s=resumos&limiar=${limiar}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (vivo && j?.ok) setNTax(j.resumos?.find((x: any) => x.tipo === 'disciplina')?.grupos) }).catch(() => {})
    return () => { vivo = false }
  }, [podeTaxonomiaVer, limiar, versao])

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Unificar disciplinas · {rotulo}</h2>
          <p className="text-xs text-muted-foreground">Junta pastas-disciplina repetidas ou parecidas: leva documentos e subpastas para a pasta mantida e funde subpastas do mesmo tipo (PDFull com PDFull…). Nada é apagado — as variantes vão para a Lixeira e dá para desfazer.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onVoltar}><ArrowLeft />Voltar aos materiais</Button>
      </div>
      <AbasSublinhado<Vista> rotulo="Visão da unificação" valor={vista} onChange={(v) => { virgem.current = false; setVista(v) }}
        abas={[{ id: 'candidatos', nome: 'Pastas repetidas', n: resumo?.resumo.grupos }, ...(podeTaxonomiaVer ? [{ id: 'taxonomia' as Vista, nome: 'Disciplinas da taxonomia', n: nTax }] : []), { id: 'manual', nome: 'Escolher manualmente' }, { id: 'historico', nome: 'Histórico' }]}
        onHover={(v) => { if (v === 'taxonomia') prefetchGruposTermos('disciplina', limiar); if (v === 'historico') prefetch({ s: 'historico' }); if (v === 'manual') prefetch({ s: 'pastas', categoria, page: 1, pp: 30 }) }} />
      {resumo && vista === 'candidatos' && (
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          <b className="text-foreground">{fmt(resumo.resumo.pastas)}</b> pasta(s)-disciplina em {rotulo} · <b className="text-foreground">{fmt(resumo.resumo.grupos)}</b> grupo(s) candidato(s), {fmt(resumo.resumo.variantesEmGrupos)} pastas e {fmt(resumo.resumo.docsEmGrupos)} documentos envolvidos.
        </p>
      )}
      <div className="mt-2">
        {vista === 'historico' ? <Historico podeEditar={podeEditar} onMudou={depoisDeMudar} />
          : vista === 'taxonomia' ? (
            <>
              <p className="mb-2 px-1 text-xs text-muted-foreground">A disciplina da taxonomia é compartilhada com questões, cronograma, flashcards e cursos. Cada pasta da Biblioteca aponta para uma delas: quando duas disciplinas são a mesma, unificar aqui <b>reaponta as pastas, as metas do cronograma e as questões</b> para a mantida (a prévia lista as pastas afetadas). É a mesma detecção do Unificar › Termos da aba Questões.</p>
              <CandidatosTaxonomia tipo="disciplina" podeEditar={podeTaxonomiaEditar} limiar={limiar} onLimiar={setLimiar} onMudou={depoisDeMudar} versao={versao} />
            </>
          )
          : vista === 'manual' ? <Manual categoria={categoria} podeEditar={podeEditar} grupo={manual} onGrupo={setManual} onMudou={() => { setManual(null); depoisDeMudar() }} />
          : <Candidatos inicial={virgem.current ? ini?.grupos ?? null : null} onDados={setResumo} categoria={categoria} podeEditar={podeEditar} limiar={limiar} onLimiar={setLimiar} onMudou={depoisDeMudar} versao={versao} />}
      </div>
    </div>
  )
}

// ════════════════════════════════════════ CANDIDATOS ════════════════════════════════════════
function Candidatos({ categoria, podeEditar, limiar, onLimiar, onMudou, versao, inicial, onDados }: { inicial: RespostaGruposPU | null; onDados: (d: RespostaGruposPU) => void; categoria: CategoriaPU; podeEditar: boolean; limiar: number; onLimiar: (n: number) => void; onMudou: () => void; versao: number }) {
  const [busca, setBusca] = useState(''); const [q, setQ] = useState('')
  const [conf, setConf] = useState(''); const [sort, setSort] = useState('docs'); const [verIgn, setVerIgn] = useState(false)
  const [page, setPage] = useState(1); const pp = 20
  const [dados, setDados] = useState<RespostaGruposPU | null>(inicial); const [erro, setErro] = useState<string | null>(null); const [carregando, setCarregando] = useState(!inicial)
  const semente = useRef(inicial ? qs({ s: 'grupos', categoria, sort: 'docs', dir: 'desc', page: 1, pp: 20, limiar: inicial.limiar }) : null)
  const [sel, setSel] = useState<string | null>(null)
  const [ignLocal, setIgnLocal] = useState<string[]>([])
  const seq = useRef(0)
  useEffect(() => { setIgnLocal(lerLocal()) }, [])
  useEffect(() => { const t = setTimeout(() => { if (busca.trim() !== q) { setQ(busca.trim()); setPage(1) } }, 300); return () => clearTimeout(t) }, [busca, q])

  const params = useMemo<P>(() => ({ s: 'grupos', categoria, q, confianca: conf, sort, dir: sort === 'nome' ? 'asc' : 'desc', page, pp, limiar, ignorados: verIgn, ign: ignLocal.join(',') }), [categoria, q, conf, sort, page, limiar, verIgn, ignLocal])
  // semeia o cache do cliente com o SSR (voltar a esta lista < 60 s não chama a API)
  useEffect(() => { if (inicial && semente.current) CACHE.set(semente.current, { t: Date.now(), v: inicial }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const carregar = useCallback(async (fresh = false) => {
    if (semente.current) { if (!fresh && qs(params) === semente.current && versao === 0) return; semente.current = null } // 1º render = dados do SSR, zero chamadas
    const mine = ++seq.current; setErro(null); setCarregando(true)
    const j = await ler<RespostaGruposPU>(params, fresh)
    if (mine !== seq.current) return
    if (j.ok) { setDados(j); onDados(j) } else setErro(j.error ?? 'Falha ao carregar.')
    setCarregando(false)
  }, [params, versao])
  useEffect(() => { void carregar() }, [carregar, versao])
  useEffect(() => { if (dados && page * pp < dados.total) prefetch({ ...params, page: page + 1 }) }, [dados, page, params])
  useEffect(() => { if (dados && (!sel || !dados.grupos.some((g) => g.id === sel))) setSel(dados.grupos[0]?.id ?? null) }, [dados, sel])
  const grupo = dados?.grupos.find((g) => g.id === sel) ?? null
  const totalPag = dados ? Math.max(1, Math.ceil(dados.total / pp)) : 1
  const filtrando = !!(q || conf || verIgn)

  async function ignorar(g: GrupoPasta, desfazer: boolean) {
    const r = await enviar({ acao: 'ignorar', grupoId: g.id, nomes: g.variantes.map((v) => v.nome), desfazer }, false)
    if (r.ok) { CACHE.clear(); toast.success(desfazer ? 'O grupo voltará a ser sugerido.' : 'Marcado como “São disciplinas diferentes”.'); onMudou(); void carregar(true); return }
    if (r.semTabela) {
      const atual = lerLocal(); const novo = desfazer ? atual.filter((k) => k !== g.id) : [...new Set([...atual, g.id])]
      gravarLocal(novo); setIgnLocal(novo); onMudou()
      toast.success(desfazer ? 'O grupo voltará a ser sugerido (neste navegador).' : 'Marcado como “São disciplinas diferentes” (guardado só neste navegador — aplique a migration 20261113060000 para valer para todos).')
      return
    }
    toast.error(r.error || 'Não foi possível salvar.')
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(20rem,28rem)_minmax(0,1fr)]">
      <PainelCard titulo="Candidatos · pastas-disciplina" rotulo="Grupos candidatos a unificação"
        acao={<>{carregando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Carregando" />}<button type="button" onClick={() => { CACHE.clear(); void carregar(true); onMudou() }} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" title="Recalcular candidatos"><RefreshCw className="h-3.5 w-3.5" />Recalcular</button></>}
        barra={<>
          <div className="relative min-w-40 flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar disciplina…" aria-label="Buscar nos candidatos" className={campoBusca} autoComplete="off" /></div>
          <select className={selectBarra} value={conf} onChange={(e) => { setConf(e.target.value); setPage(1) }} aria-label="Confiança">
            <option value="">Confiança: todas</option>
            {(['alta', 'media', 'baixa'] as ConfTermo[]).map((c) => <option key={c} value={c}>{ROTULO_CONF_TERMO[c]}{dados ? ` (${dados.porConfianca[c]})` : ''}</option>)}
          </select>
          <select className={selectBarra} value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }} aria-label="Ordenar">
            <option value="docs">Mais documentos</option><option value="score">Maior similaridade</option><option value="variantes">Mais variantes</option><option value="nome">Nome (A–Z)</option>
          </select>
          <select className={selectBarra} value={limiar} onChange={(e) => { onLimiar(Number(e.target.value)); setPage(1) }} aria-label="Limiar de similaridade para erros de digitação" title="Rigor da detecção de erros de digitação">
            {[0.98, 0.92, 0.85, 0.78, 0.7, 0.62].map((n) => <option key={n} value={n}>Similaridade ≥ {Math.round(n * 100)}%</option>)}
          </select>
          {(q || conf) && <button type="button" onClick={() => { setBusca(''); setQ(''); setConf(''); setPage(1) }} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" />Limpar</button>}
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={verIgn} onChange={(e) => { setVerIgn(e.target.checked); setPage(1) }} className="accent-[var(--primary)]" />Ver ignorados{dados && dados.ignorados > 0 ? ` (${dados.ignorados})` : ''}</label>
        </>}>
        {erro && !dados ? <ErroTentar msg={erro} onTentar={() => void carregar(true)} /> : !dados ? <Carregando /> : (
          <>
            <div className="min-h-0 flex-1 overflow-auto p-1.5" role="listbox" aria-label="Grupos de disciplinas candidatas">
              {dados.grupos.length === 0 ? <Vazio>{filtrando ? 'Nenhum grupo com esta busca/filtro.' : 'Nenhuma pasta-disciplina repetida ou parecida nesta área. Afrouxe a similaridade para procurar erros de digitação, ou use “Escolher manualmente” para juntar duas pastas que você sabe que são a mesma disciplina.'}</Vazio> : (
                <ul className="space-y-1.5">
                  {dados.grupos.map((g) => (
                    <li key={g.id}>
                      <button type="button" role="option" aria-selected={g.id === sel} onClick={() => setSel(g.id)}
                        className={cn('w-full rounded-xl border p-2.5 text-left transition-colors', g.id === sel ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted')}>
                        <span className="flex items-center gap-2 text-[11px]">
                          <span className={cn('rounded-full px-2 py-0.5 font-semibold', COR_CONF[g.confianca])}>{ROTULO_CONF_TERMO[g.confianca]} · {g.score}%</span>
                          <span className="ml-auto tabular-nums text-muted-foreground">{fmt(g.docs)} documentos</span>
                        </span>
                        <span className="mt-1 block truncate text-sm font-medium" title={g.variantes[0].nome}>{g.variantes[0].nome}</span>
                        <span className="block truncate text-xs text-muted-foreground">+ {g.variantes.length - 1}: {g.variantes.slice(1).map((v) => v.nome).join(' · ')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <nav className="flex items-center justify-between gap-2 border-t px-2 pt-2 text-xs text-muted-foreground" aria-label="Paginação dos grupos">
              <span>{dados.total === 0 ? 'Nenhum grupo' : `${fmt((page - 1) * pp + 1)}–${fmt(Math.min(page * pp, dados.total))} de ${fmt(dados.total)}`}</span>
              <span className="flex items-center gap-1">
                <Button variant="outline" size="icon-sm" disabled={page <= 1 || carregando} onClick={() => setPage(page - 1)} aria-label="Página anterior"><ChevronLeft /></Button>
                <span className="tabular-nums">{page}/{totalPag}</span>
                <Button variant="outline" size="icon-sm" disabled={page >= totalPag || carregando} onClick={() => setPage(page + 1)} aria-label="Próxima página"><ChevronRight /></Button>
              </span>
            </nav>
          </>
        )}
      </PainelCard>
      <RevisaoGrupo key={grupo?.id ?? 'vazio'} categoria={categoria} grupo={grupo} ignorado={verIgn} podeEditar={podeEditar} carregando={!dados} onIgnorar={(g, d) => void ignorar(g, d)} onMesclado={() => { onMudou(); void carregar(true) }} />
    </div>
  )
}

// ════════════════════════════════════════ ESCOLHA MANUAL ════════════════════════════════════════
function Manual({ categoria, podeEditar, grupo, onGrupo, onMudou }: { categoria: CategoriaPU; podeEditar: boolean; grupo: GrupoPasta | null; onGrupo: (g: GrupoPasta | null) => void; onMudou: () => void }) {
  const [busca, setBusca] = useState(''); const [q, setQ] = useState(''); const [page, setPage] = useState(1); const pp = 30
  const [dados, setDados] = useState<RespostaPastasPU | null>(null); const [erro, setErro] = useState<string | null>(null); const [carregando, setCarregando] = useState(true)
  const [marcadas, setMarcadas] = useState<Map<string, VariantePasta>>(new Map())
  const seq = useRef(0)
  useEffect(() => { const t = setTimeout(() => { if (busca.trim() !== q) { setQ(busca.trim()); setPage(1) } }, 300); return () => clearTimeout(t) }, [busca, q])
  const carregar = useCallback(async (fresh = false) => {
    const mine = ++seq.current; setErro(null); setCarregando(true)
    const j = await ler<RespostaPastasPU>({ s: 'pastas', categoria, q, page, pp }, fresh)
    if (mine !== seq.current) return
    if (j.ok) setDados(j); else setErro(j.error ?? 'Falha ao carregar.')
    setCarregando(false)
  }, [categoria, q, page])
  useEffect(() => { void carregar() }, [carregar])
  const totalPag = dados ? Math.max(1, Math.ceil(dados.total / pp)) : 1
  function revisar() {
    const vs = [...marcadas.values()].sort((a, b) => b.docs - a.docs || a.nome.localeCompare(b.nome, 'pt-BR'))
    if (vs.length < 2) return
    onGrupo({ id: `manual-${vs.map((v) => v.id).join('-')}`, categoria, confianca: 'baixa', score: 0, motivo: 'Grupo montado por você — confira o nome final, a pasta mantida e o impacto antes de confirmar.', variantes: vs, canonicaId: vs[0].id, nomeSugerido: vs[0].nome, docs: vs.reduce((s, v) => s + v.docs, 0) })
  }
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(20rem,28rem)_minmax(0,1fr)]">
      <PainelCard titulo="Todas as pastas-disciplina" rotulo="Escolher disciplinas manualmente"
        acao={<>{carregando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Carregando" />}{podeEditar && <Button size="sm" disabled={marcadas.size < 2} onClick={revisar}><Merge />Revisar {marcadas.size || ''}</Button>}</>}
        barra={<>
          <div className="relative min-w-40 flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar disciplina…" aria-label="Buscar pastas" className={campoBusca} autoComplete="off" /></div>
          {marcadas.size > 0 && <button type="button" onClick={() => { setMarcadas(new Map()); onGrupo(null) }} className="text-xs text-muted-foreground hover:text-foreground">Limpar seleção ({marcadas.size})</button>}
        </>}>
        {erro && !dados ? <ErroTentar msg={erro} onTentar={() => void carregar(true)} /> : !dados ? <Carregando /> : (
          <>
            <p className="px-3 pt-2 text-xs text-muted-foreground">Marque duas ou mais pastas que são a mesma disciplina e clique em <b>Revisar</b>. Sem detecção automática: a prévia mostra o impacto antes de qualquer alteração.</p>
            <div className="min-h-0 flex-1 overflow-auto p-1.5">
              {dados.itens.length === 0 ? <Vazio>{q ? 'Nenhuma pasta com esta busca.' : 'Nenhuma pasta-disciplina nesta área.'}</Vazio> : (
                <ul className="space-y-1">
                  {dados.itens.map((v) => (
                    <li key={v.id}>
                      <label className={cn('flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-sm', marcadas.has(v.id) ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted')}>
                        <input type="checkbox" checked={marcadas.has(v.id)} disabled={!podeEditar} onChange={(e) => setMarcadas((m) => { const n = new Map(m); if (e.target.checked) n.set(v.id, v); else n.delete(v.id); return n })} className="h-4 w-4 accent-[var(--primary)]" aria-label={`Selecionar ${v.nome}`} />
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{v.nome}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{v.disciplinaNome ? `taxonomia: ${v.disciplinaNome}` : 'sem disciplina da taxonomia'}{v.paiNome ? ` · em ${v.paiNome}` : ''}</span></span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{fmt(v.docs)} doc.</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <nav className="flex items-center justify-between gap-2 border-t px-2 pt-2 text-xs text-muted-foreground" aria-label="Paginação das pastas">
              <span>{dados.total === 0 ? 'Nenhuma pasta' : `${fmt((page - 1) * pp + 1)}–${fmt(Math.min(page * pp, dados.total))} de ${fmt(dados.total)}`}</span>
              <span className="flex items-center gap-1">
                <Button variant="outline" size="icon-sm" disabled={page <= 1 || carregando} onClick={() => setPage(page - 1)} aria-label="Página anterior"><ChevronLeft /></Button>
                <span className="tabular-nums">{page}/{totalPag}</span>
                <Button variant="outline" size="icon-sm" disabled={page >= totalPag || carregando} onClick={() => setPage(page + 1)} aria-label="Próxima página"><ChevronRight /></Button>
              </span>
            </nav>
          </>
        )}
      </PainelCard>
      <RevisaoGrupo key={grupo?.id ?? 'vazio'} categoria={categoria} grupo={grupo} ignorado={false} manual podeEditar={podeEditar} carregando={false} onIgnorar={() => {}} onMesclado={() => { setMarcadas(new Map()); onMudou() }} />
    </div>
  )
}

// ════════════════════════════════════════ REVISÃO DO GRUPO ════════════════════════════════════════
function RevisaoGrupo({ categoria, grupo, ignorado, manual, podeEditar, carregando, onIgnorar, onMesclado }: {
  categoria: CategoriaPU; grupo: GrupoPasta | null; ignorado: boolean; manual?: boolean; podeEditar: boolean; carregando: boolean; onIgnorar: (g: GrupoPasta, desfazer: boolean) => void; onMesclado: () => void
}) {
  const [canon, setCanon] = useState(grupo?.canonicaId ?? '')
  const [fora, setFora] = useState<Set<string>>(new Set())
  const [nome, setNome] = useState(grupo?.nomeSugerido ?? '')
  const [previa, setPrevia] = useState<PreviaPU | null>(null)
  const [calc, setCalc] = useState(false); const [gravando, setGravando] = useState(false)
  const [taxo, setTaxo] = useState(true); const [aceita, setAceita] = useState(false)
  const nomeEditado = useRef(false)

  const dupIds = grupo ? grupo.variantes.filter((v) => v.id !== canon && !fora.has(v.id)).map((v) => v.id) : []
  function escolherCanon(id: string) {
    setCanon(id); setFora((s) => { const n = new Set(s); n.delete(id); return n })
    if (!nomeEditado.current && grupo) setNome(grupo.variantes.find((v) => v.id === id)?.nome.replace(/\s+/g, ' ').trim() ?? '')
  }
  async function abrirPrevia() {
    if (!grupo) return
    setCalc(true)
    const j = await enviar<PreviaPU>({ acao: 'previa', categoria, canonicaId: canon, dupIds, nomeFinal: nome }, false)
    setCalc(false)
    if (!j.ok) { toast.error(j.error || 'Não foi possível calcular o impacto.'); return }
    setTaxo(true); setAceita(false); setPrevia(j)
  }
  async function confirmarMescla() {
    if (!grupo || !previa) return
    setGravando(true)
    const j = await enviar<{ documentos?: number; subpastasMovidas?: number; fusoes?: number; arquivadas?: number; mantida?: string; podeDesfazer?: boolean; taxonomia?: { unificada: boolean; erro?: string } }>({
      acao: 'mesclar', categoria, canonicaId: canon, dupIds, nomeFinal: nome, unificarTaxonomia: taxo && previa.taxonomia.situacao === 'diferentes', aceitarAcesso: aceita,
    })
    setGravando(false)
    if (!j.ok) { toast.error(j.error || 'Não foi possível unificar.'); return }
    setPrevia(null)
    toast.success(`Unificado em “${j.mantida ?? nome}”: ${fmt(j.documentos ?? 0)} documento(s) movido(s), ${j.fusoes ?? 0} subpasta(s) fundida(s), ${j.subpastasMovidas ?? 0} movida(s), ${j.arquivadas ?? 0} pasta(s) enviada(s) à Lixeira.${j.taxonomia?.unificada ? ' Disciplina da taxonomia unificada.' : ''}${j.podeDesfazer ? ' Dá para desfazer em Histórico.' : ''}`)
    if (j.taxonomia?.erro) toast.warning(`A taxonomia não foi unificada: ${j.taxonomia.erro}`)
    onMesclado()
  }
  const bloqueado = !!previa && previa.conflitosAcesso.length > 0 && !aceita

  return (
    <PainelCard titulo="Revisão do grupo" rotulo="Revisão do grupo de disciplinas">
      {carregando ? <Carregando /> : !grupo ? <Vazio>{manual ? 'Marque duas ou mais pastas à esquerda e clique em Revisar.' : 'Selecione um grupo à esquerda para revisar as variantes lado a lado.'}</Vazio> : (
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {!manual && <span className={cn('rounded-full px-2 py-0.5 font-semibold', COR_CONF[grupo.confianca])}>{ROTULO_CONF_TERMO[grupo.confianca]} · similaridade {grupo.score}%</span>}
            <span className="text-muted-foreground">{grupo.motivo}</span>
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[40rem] text-sm">
              <thead><tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-3 py-2 font-medium">Manter</th><th className="px-3 py-2 font-medium">Pasta-disciplina</th><th className="px-3 py-2 font-medium">Taxonomia</th>
                <th className="px-3 py-2 text-right font-medium">Documentos</th><th className="px-3 py-2 text-right font-medium">Subpastas</th><th className="px-3 py-2 text-right font-medium">Incluir</th>
              </tr></thead>
              <tbody>
                {grupo.variantes.map((v) => {
                  const eh = v.id === canon; const excl = fora.has(v.id) && !eh
                  return (
                    <tr key={v.id} className={cn('border-b last:border-0', eh && 'bg-primary/5', excl && 'opacity-50')}>
                      <td className="px-3 py-2"><input type="radio" name={`canon-${grupo.id}`} checked={eh} onChange={() => escolherCanon(v.id)} className="h-4 w-4 accent-[var(--primary)]" aria-label={`Manter “${v.nome}”`} /></td>
                      <td className="max-w-[20rem] px-3 py-2">
                        <span className="flex items-center gap-1.5 break-words font-medium"><FolderTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />{v.nome}{v.restrito && <Lock className="h-3 w-3 shrink-0 text-amber-600" aria-label="Acesso restrito" />}</span>
                        {eh && <span className="mt-0.5 inline-block rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">pasta mantida</span>}
                        {v.paiNome && <span className="ml-1 text-[11px] text-muted-foreground">em {v.paiNome}</span>}
                        {v.tipos.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{v.tipos.map((t) => <span key={t} className="rounded-full bg-sky-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-400">{rotuloTipoMaterial(t) ?? t}</span>)}</span>}
                      </td>
                      <td className="max-w-[12rem] px-3 py-2 text-xs text-muted-foreground">{v.disciplinaNome ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{fmt(v.docs)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(v.subpastas)}</td>
                      <td className="px-3 py-2 text-right">{eh ? <span className="text-xs text-muted-foreground">—</span>
                        : <button type="button" onClick={() => setFora((s) => { const n = new Set(s); n.has(v.id) ? n.delete(v.id) : n.add(v.id); return n })} className="text-xs text-muted-foreground hover:text-foreground" title={excl ? 'Voltar a incluir na unificação' : 'Não é a mesma disciplina: deixar de fora'}>{excl ? 'incluir' : 'não é igual'}</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="nome-pasta-canonica">Nome final da pasta mantida</label>
            <input id="nome-pasta-canonica" value={nome} onChange={(e) => { nomeEditado.current = true; setNome(e.target.value) }} maxLength={200} disabled={!podeEditar}
              className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
            <p className="mt-1 text-xs text-muted-foreground">Sugestão: o nome mais completo e bem escrito. As subpastas de mesmo tipo (PDFull, PDFlash, PDFight, LegProc…) são fundidas; a pasta mantida vence nos conflitos (cor, capa, acesso, ordem).</p>
          </div>

          {podeEditar ? (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <Button onClick={() => void abrirPrevia()} disabled={calc || !dupIds.length || !nome.trim() || ignorado}>{calc ? <Loader2 className="animate-spin" /> : <Merge />}Ver impacto e unificar {dupIds.length + 1}</Button>
              {!manual && (ignorado ? <Button variant="outline" onClick={() => onIgnorar(grupo, true)}><Undo2 />Voltar a sugerir</Button>
                : <Button variant="outline" onClick={() => onIgnorar(grupo, false)} title="Não sugerir mais este grupo"><EyeOff />São disciplinas diferentes</Button>)}
              {!dupIds.length && <span className="text-xs text-muted-foreground">Inclua ao menos uma variante para unificar.</span>}
            </div>
          ) : <p className="border-t pt-3 text-xs text-muted-foreground">Somente leitura: você não tem permissão para editar a Biblioteca.</p>}
        </div>
      )}

      <Dialog open={!!previa} onOpenChange={(o) => { if (!o && !gravando) setPrevia(null) }}>
        <DialogContent className="flex max-h-[88vh] w-full flex-col gap-0 p-0 sm:max-w-2xl">
          {previa && (
            <>
              <DialogHeader className="border-b p-4 pr-12">
                <DialogTitle>Unificar {previa.variantes.length + 1} pastas em “{previa.nomeFinal}”?</DialogTitle>
                <DialogDescription>Confira o impacto antes de confirmar. Nada foi alterado ainda.</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Num rot="Documentos" v={previa.impacto.documentos} /><Num rot="Subpastas fundidas" v={previa.impacto.subpastasFundidas} />
                  <Num rot="Subpastas movidas" v={previa.impacto.subpastasMovidas} /><Num rot="Pastas p/ Lixeira" v={previa.impacto.pastasArquivadas} />
                </div>
                <div className="rounded-lg border p-3 text-xs"><p className="mb-1 font-semibold">Mantida: “{previa.canonica.nome}”{previa.nomeFinal !== previa.canonica.nome ? ` → renomeada para “${previa.nomeFinal}”` : ''}</p>
                  <p className="text-muted-foreground">Variantes: {previa.variantes.map((v) => `${v.nome} (${fmt(v.docs)} doc., ${v.subpastas} subpasta${v.subpastas === 1 ? '' : 's'})`).join(' · ')}</p></div>
                {previa.fusoes.length > 0 && (
                  <div className="rounded-lg border p-3 text-xs"><p className="mb-1 font-semibold">Subpastas que serão fundidas ({previa.impacto.subpastasFundidas})</p>
                    <ul className="max-h-36 space-y-0.5 overflow-auto">{previa.fusoes.map((f, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{f.origem} → {f.destino}</span><span className="shrink-0 text-muted-foreground">{f.motivo === 'tipo' ? 'mesmo tipo' : 'mesmo nome'}</span></li>)}</ul></div>
                )}
                {previa.movidas.length > 0 && (
                  <div className="rounded-lg border p-3 text-xs"><p className="mb-1 font-semibold">Subpastas sem par (mudam de pasta, sem renomear)</p>
                    <ul className="max-h-28 space-y-0.5 overflow-auto">{previa.movidas.map((m, i) => <li key={i} className="truncate">{m.nome} → {m.para}</li>)}</ul></div>
                )}
                {(previa.impacto.produtos > 0 || previa.impacto.integracoes > 0 || previa.impacto.metadadosDisciplina > 0 || previa.impacto.lixeira > 0) && (
                  <div className="rounded-lg border p-3 text-xs"><p className="mb-1 font-semibold">Outros vínculos acompanhados</p>
                    <ul className="space-y-0.5">
                      {previa.impacto.produtos > 0 && <li className="flex justify-between"><span>Itens de produto/curso que apontam para a pasta</span><span className="tabular-nums">{fmt(previa.impacto.produtos)}</span></li>}
                      {previa.impacto.integracoes > 0 && <li className="flex justify-between"><span>Mapeamentos de integração (venda)</span><span className="tabular-nums">{fmt(previa.impacto.integracoes)}</span></li>}
                      {previa.impacto.metadadosDisciplina > 0 && <li className="flex justify-between"><span>Documentos com o texto “disciplina” nos metadados (ajustado quando traz o nome da variante)</span><span className="tabular-nums">{fmt(previa.impacto.metadadosDisciplina)}</span></li>}
                      {previa.impacto.lixeira > 0 && <li className="flex justify-between"><span>Documentos da Lixeira nessas pastas</span><span className="tabular-nums">{fmt(previa.impacto.lixeira)}</span></li>}
                    </ul></div>
                )}
                {previa.taxonomia.situacao !== 'nenhuma' && (
                  <div className="rounded-lg border p-3 text-xs">
                    <p className="mb-1 font-semibold">Disciplina da taxonomia (questões, cronograma, flashcards, cursos)</p>
                    {previa.taxonomia.situacao === 'mesma' && <p className="text-muted-foreground">As pastas já usam a mesma disciplina da taxonomia{previa.taxonomia.canonicaDisciplina ? ` (“${previa.taxonomia.canonicaDisciplina.nome}”)` : ''}. Nada a unificar lá.</p>}
                    {previa.taxonomia.situacao === 'herda' && <p className="text-muted-foreground">A pasta mantida não tinha disciplina da taxonomia e passa a usar “{previa.taxonomia.canonicaDisciplina?.nome}”.</p>}
                    {previa.taxonomia.situacao === 'diferentes' && (
                      <>
                        <p className="mb-2 text-muted-foreground">As variantes usam disciplinas diferentes da mantida{previa.taxonomia.canonicaDisciplina ? ` (“${previa.taxonomia.canonicaDisciplina.nome}”)` : ''}:</p>
                        <ul className="mb-2 space-y-0.5">{previa.taxonomia.variantes.map((v) => (
                          <li key={v.id} className="flex flex-wrap justify-between gap-x-3"><b>{v.nome}</b><span className="tabular-nums text-muted-foreground">{fmt(v.questoes)} questões · {fmt(v.metas)} metas · {fmt(v.links)} links · {fmt(v.conjuntos)} conjuntos · {fmt(v.duvidas)} dúvidas{v.outrasPastas ? ` · ${v.outrasPastas} outra(s) pasta(s)` : ''}</span></li>))}</ul>
                        <label className={cn('flex items-start gap-2', !previa.taxonomia.podeUnificar && 'opacity-60')}>
                          <input type="checkbox" checked={taxo && previa.taxonomia.podeUnificar} disabled={!previa.taxonomia.podeUnificar} onChange={(e) => setTaxo(e.target.checked)} className="mt-0.5 accent-[var(--primary)]" />
                          <span><b>Unificar também a disciplina nas questões e no cronograma</b> (recomendado). Sem isto, as metas do cronograma dessas disciplinas ficam sem material, pois os documentos passam a pertencer à disciplina da pasta mantida.{!previa.taxonomia.podeUnificar && ' Requer permissão de editar questões.'}</span>
                        </label>
                      </>
                    )}
                  </div>
                )}
                {previa.conflitosAcesso.length > 0 && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                    <p className="mb-1 font-semibold">Regras de acesso diferentes</p>
                    <ul className="mb-2 space-y-0.5">{previa.conflitosAcesso.map((c, i) => <li key={i}>• {c}</li>)}</ul>
                    <label className="flex items-start gap-2"><input type="checkbox" checked={aceita} onChange={(e) => setAceita(e.target.checked)} className="mt-0.5 accent-[var(--primary)]" /><span>Entendo que o acesso da pasta mantida passa a valer para os conteúdos movidos (quem tinha acesso só à variante pode perdê-lo; quem não tinha pode ganhar).</span></label>
                  </div>
                )}
                {previa.avisos.length > 0 && <ul className="space-y-1 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">{previa.avisos.map((a, i) => <li key={i}>• {a}</li>)}</ul>}
                <p className="text-xs text-muted-foreground">A ação é registrada na auditoria{previa.podeDesfazer ? ' e pode ser desfeita em Histórico' : ''}.</p>
              </div>
              <div className="flex justify-end gap-2 border-t p-3">
                <Button variant="outline" onClick={() => setPrevia(null)} disabled={gravando}>Cancelar</Button>
                <Button onClick={() => void confirmarMescla()} disabled={gravando || bloqueado}>{gravando ? <Loader2 className="animate-spin" /> : <Merge />}Confirmar unificação</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PainelCard>
  )
}

// ════════════════════════════════════════ HISTÓRICO ════════════════════════════════════════
function Historico({ podeEditar, onMudou }: { podeEditar: boolean; onMudou: () => void }) {
  const [dados, setDados] = useState<{ itens: HistoricoPU[]; semTabela: boolean } | null>(null); const [erro, setErro] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const carregar = useCallback(async (fresh = false) => { setErro(null); const j = await ler<{ itens: HistoricoPU[]; semTabela: boolean }>({ s: 'historico' }, fresh); if (j.ok) setDados(j); else setErro(j.error ?? 'Falha ao carregar.') }, [])
  useEffect(() => { void carregar(true) }, [carregar])
  async function desfazer(l: HistoricoPU) {
    const ok = await confirmar({ titulo: 'Desfazer esta unificação?', mensagem: `Os ${fmt(l.documentos)} documento(s) voltam às pastas de origem e as pastas arquivadas são restauradas.${l.taxonomia ? ' A disciplina da taxonomia unificada junto também é restaurada.' : ''} Documentos movidos depois não são sobrescritos.`, confirmar: 'Desfazer' })
    if (!ok) return
    setBusy(l.id)
    const j = await enviar<{ documentos?: number; aviso?: string }>({ acao: 'desfazer', id: l.id })
    setBusy(null)
    if (!j.ok) { toast.error(j.error || 'Não foi possível desfazer.'); return }
    toast.success(`Desfeito — ${fmt(j.documentos ?? 0)} documento(s) restaurado(s).`); if (j.aviso) toast.warning(j.aviso); onMudou(); void carregar(true)
  }
  return (
    <PainelCard titulo="Unificações recentes" rotulo="Histórico de unificações de disciplinas">
      {erro && !dados ? <ErroTentar msg={erro} onTentar={() => void carregar(true)} /> : !dados ? <Carregando /> : (
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {dados.semTabela && <p className="mb-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">O histórico depende da migration <code>20261113060000_questoes_termos_mesclagens.sql</code> (ainda não aplicada neste banco).</p>}
          {dados.itens.length === 0 ? <Vazio>Nenhuma unificação de disciplinas para desfazer.</Vazio> : (
            <ul className="space-y-1.5">{dados.itens.map((l) => (
              <li key={l.id} className={cn('flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm', l.desfeita && 'opacity-50')}>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-muted-foreground">{new Date(l.criadoEm).toLocaleString('pt-BR')}{l.taxonomia ? ' · com taxonomia' : ''}</p>
                  <p className="mt-0.5 break-words font-medium">{l.nomeFinal || l.canonicaNome}</p>
                  <p className="break-words text-xs text-muted-foreground">{l.variantes.map((v) => `${v.nome} (${fmt(v.docs)})`).join(' · ')} — {fmt(l.documentos)} documentos</p>
                </div>
                {podeEditar && !l.desfeita && l.podeDesfazer && <Button size="sm" variant="outline" disabled={busy === l.id} onClick={() => void desfazer(l)}>{busy === l.id ? <Loader2 className="animate-spin" /> : <Undo2 />}Desfazer</Button>}
                {l.desfeita && <span className="text-xs text-muted-foreground">desfeita</span>}
              </li>))}</ul>
          )}
        </div>
      )}
    </PainelCard>
  )
}
