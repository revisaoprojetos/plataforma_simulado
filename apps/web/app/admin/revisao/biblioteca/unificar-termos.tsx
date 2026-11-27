'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ChevronLeft, ChevronRight, EyeOff, History, Loader2, Merge, RefreshCw, Search, Undo2, Wand2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import {
  ROTULO_CONF_TERMO, TIPOS_TERMO,
  type ConfTermo, type ExemploQuestao, type GrupoTermo, type InicialTermos, type MesclagemLog, type PreviaMescla, type RespostaGruposTermos, type RespostaNorm, type ResumoTipoTermo, type TipoTermo,
} from '@/lib/admin-revisao/questoes-termos-tipos'
import { AbasSublinhado, Carregando, ErroTentar, PainelCard, Vazio, campoBusca, selectBarra } from './gestao-ui'
import { limparCacheG } from './questoes-api'
import { TermosFiltrosCard } from './termos-filtros-card'
import type { FiltrosTermo } from '@/lib/admin-revisao/termos-filtros'

// UNIFICAR › TERMOS DA TAXONOMIA. Detecta no servidor (cache 5 min) variantes de Disciplina · Assunto · Banca · Órgão · Cargo · Assunto específico,
// revisão lado a lado (canônico + nome final), PRÉVIA do impacto + confirmação, mesclagem transacional em ROTA DE API, "São termos diferentes",
// normalização em lote do texto livre e histórico com Desfazer. Este componente só LÊ/renderiza: toda a detecção e o cálculo ficam no servidor.

const URL_T = '/api/admin/revisao/biblioteca/questoes-termos'
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
      const r = await fetch(`${URL_T}?${kk}`, { cache: 'no-store' })
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
    const r = await fetch(URL_T, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
    const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))
    if (grava && j?.ok) { CACHE.clear(); limparCacheG() }
    return j
  } catch { return { ok: false, error: 'Falha de rede.' } as any }
}

// "São termos diferentes": fallback no navegador quando a tabela do servidor ainda não existe (migration 20261113060000 pendente)
const LS = 'bib-termos-ignorados:v1'
const lerLocal = (tipo: TipoTermo): string[] => { try { return (JSON.parse(localStorage.getItem(LS) || '{}')[tipo] ?? []) as string[] } catch { return [] } }
const gravarLocal = (tipo: TipoTermo, ids: string[]) => { try { const o = JSON.parse(localStorage.getItem(LS) || '{}'); o[tipo] = ids.slice(-300); localStorage.setItem(LS, JSON.stringify(o)) } catch { /* ignore */ } }

/** Pré-carrega (cache do cliente 60 s) a 1ª página de um tipo com os parâmetros PADRÃO do painel — trocar de tipo fica instantâneo. */
export const prefetchGruposTermos = (tipo: TipoTermo, limiar = 0.85) => { if (tipo !== 'ano') prefetch({ s: 'grupos', tipos: tipo, page: 1, pp: 20, limiar, sort: 'questoes', dir: 'desc' }) }
/** Tipos mesclaveis: vazio no filtro = TODOS (padrão da tela; a lista abre com todos os tipos mesclados). */
const TODOS_TIPOS: TipoTermo[] = TIPOS_TERMO.filter((t) => t.mesclavel).map((t) => t.id)
const CHAVE_TODOS = qs({ s: 'grupos', tipos: TODOS_TIPOS.join(','), page: 1, pp: 20, limiar: 0.85, sort: 'questoes', dir: 'desc' })
const PLURAL: Record<TipoTermo, string> = { disciplina: 'Disciplinas', assunto: 'Assuntos', banca: 'Bancas', orgao: 'Órgãos', cargo: 'Cargos', assunto_detalhe: 'Assuntos específicos', ano: 'Anos' }

export const COR_CONF: Record<ConfTermo, string> = { alta: 'bg-primary/10 text-primary', media: 'bg-primary/10 text-primary', baixa: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' }
const fmt = (n: number) => n.toLocaleString('pt-BR')
type Vista = 'candidatos' | 'normalizar' | 'anos' | 'historico'
const ROT_ORIGEM: Record<string, string> = { mesclagem: 'Mesclagem', normalizacao: 'Normalização', disciplina: 'Unificação' }
const TIPOS_NORMALIZAR = TIPOS_TERMO.filter((t) => t.mesclavel && !t.entidade)

export function UnificarTermos({ podeEditar, inicial }: { podeEditar: boolean; /** dados do SSR (grupos do tipo padrão): renderiza na hora, sem chamada no load */ inicial?: InicialTermos | null }) {
  // O TIPO DE TERMO é um filtro (multi) do card, não mais uma aba por tipo: a lista de candidatos combina os tipos escolhidos.
  const [tipos, setTipos] = useState<TipoTermo[]>([]) // [] = todos os tipos mesclados
  const [tipoNorm, setTipoNorm] = useState<TipoTermo>(TIPOS_NORMALIZAR[0].id)
  const trocou = useRef(false)
  const [vista, setVista] = useState<Vista>('candidatos')
  const [limiar, setLimiar] = useState(0.85)
  const [versao, setVersao] = useState(0)
  // semeia o cache do cliente com o SSR (1ª chamada = zero requisições)
  const inicialTodos = !!inicial && (inicial.grupos.tipos?.length ?? 0) === TODOS_TIPOS.length
  useEffect(() => { if (inicial && inicialTodos) CACHE.set(CHAVE_TODOS, { t: Date.now(), v: inicial.grupos }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const depoisDeMudar = useCallback(() => setVersao((v) => v + 1), [])

  return (
    <div>
      <AbasSublinhado<Vista> rotulo="Visão de termos" valor={vista} onChange={setVista}
        abas={[{ id: 'candidatos', nome: 'Candidatos a unificar' }, { id: 'normalizar', nome: 'Normalizar texto' }, { id: 'anos', nome: 'Anos' }, { id: 'historico', nome: 'Histórico' }]}
        onHover={(v) => { if (v === 'historico') prefetch({ s: 'historico' }) }} />
      <div className="mt-2">
        {vista === 'anos' ? <PainelAnos />
          : vista === 'historico' ? <Historico podeEditar={podeEditar} onMudou={depoisDeMudar} />
          : vista === 'normalizar' ? (
            <div>
              <div className="mb-2 flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <label htmlFor="tipo-norm" className="font-semibold">Texto livre de</label>
                <select id="tipo-norm" className={selectBarra} value={tipoNorm} onChange={(e) => setTipoNorm(e.target.value as TipoTermo)}>
                  {TIPOS_NORMALIZAR.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
                <span>Banca, órgão, disciplina e assunto são cadastros: use “Candidatos a unificar”.</span>
              </div>
              <Normalizar key={tipoNorm} tipo={tipoNorm} podeEditar={podeEditar} onMudou={depoisDeMudar} />
            </div>
          )
          : <Candidatos tipos={tipos} onTipos={(t) => { trocou.current = true; setTipos(t) }} inicial={!trocou.current && inicialTodos && tipos.length === 0 ? inicial!.grupos : null} onHistorico={() => setVista('historico')} podeEditar={podeEditar} limiar={limiar} onLimiar={setLimiar} onMudou={depoisDeMudar} versao={versao} />}
      </div>
    </div>
  )
}

// ════════════════════════════════════════ CANDIDATOS ════════════════════════════════════════
export function Candidatos({ tipo, tipos: tiposProp, onTipos, onHistorico, podeEditar, limiar, onLimiar, onMudou, versao, inicial }: {
  inicial?: RespostaGruposTermos | null; /** tipo FIXO (Unificar disciplinas) */ tipo?: TipoTermo; /** tipos escolhidos no filtro (Unificar termos); [] = todos */ tipos?: TipoTermo[]; onTipos?: (t: TipoTermo[]) => void
  /** abre o Histórico (atalho "Desfazer" após mesclar) */ onHistorico?: () => void
  podeEditar: boolean; limiar: number; onLimiar: (n: number) => void; onMudou: () => void; versao: number
}) {
  const tipos = useMemo<TipoTermo[]>(() => { const t = tiposProp ?? (tipo ? [tipo] : []); return t.length ? t : TODOS_TIPOS }, [tiposProp, tipo])
  const chaveTipos = tipos.join(',')
  const selecionados = tiposProp ?? [] // o que o usuário marcou no filtro (vazio = todos)
  const [filtros, setFiltros] = useState<FiltrosTermo>({})
  const [busca, setBusca] = useState(''); const [q, setQ] = useState('')
  const [sort, setSort] = useState('questoes'); const [verIgn, setVerIgn] = useState(false)
  const [page, setPage] = useState(1); const [pp] = useState(20)
  const [dados, setDados] = useState<RespostaGruposTermos | null>(inicial ?? null); const [erro, setErro] = useState<string | null>(null); const [carregando, setCarregando] = useState(!inicial)
  const semente = useRef(inicial ? qs({ s: 'grupos', tipos: chaveTipos, page: 1, pp: 20, limiar: inicial.limiar, sort: 'questoes', dir: 'desc' }) : null)
  const [sel, setSel] = useState<string | null>(null)
  const [ignLocal, setIgnLocal] = useState<string[]>([])
  const seq = useRef(0)
  const multiTipo = tipos.length > 1
  const nomeTipos = tipos.length === TODOS_TIPOS.length ? 'todos os tipos' : tipos.map((t) => TIPOS_TERMO.find((x) => x.id === t)?.nome ?? t).join(' + ')
  useEffect(() => { setIgnLocal(TIPOS_TERMO.flatMap((t) => lerLocal(t.id))) }, [versao])
  useEffect(() => { const t = setTimeout(() => { if (busca.trim() !== q) { setQ(busca.trim()); setPage(1) } }, 300); return () => clearTimeout(t) }, [busca, q])

  const params = useMemo<P>(() => ({ s: 'grupos', tipos: chaveTipos, q, confs: (filtros.confianca ?? []).join(','), disc: (filtros.disciplina ?? []).join(','), faixa: (filtros.faixa ?? []).join(','), nv: (filtros.variantes ?? []).join(','), sort, dir: sort === 'nome' ? 'asc' : 'desc', page, pp, limiar, ignorados: verIgn, ign: ignLocal.join(',') }), [chaveTipos, q, filtros, sort, page, pp, limiar, verIgn, ignLocal])
  const carregar = useCallback(async (fresh = false) => {
    if (semente.current) { if (!fresh && qs(params) === semente.current && versao === 0) return; semente.current = null } // 1º render = dados do SSR, zero chamadas
    const mine = ++seq.current; setErro(null); setCarregando(true)
    const j = await ler<RespostaGruposTermos>(params, fresh)
    if (mine !== seq.current) return
    if (j.ok) setDados(j); else setErro(j.error ?? 'Falha ao carregar.')
    setCarregando(false)
  }, [params, versao])
  useEffect(() => { void carregar() }, [carregar, versao])
  useEffect(() => { // próxima página em segundo plano
    if (dados && page * pp < dados.total) prefetch({ ...params, page: page + 1 })
  }, [dados, page, pp, params])
  // seleciona o 1º grupo da página se o atual saiu da lista
  useEffect(() => { if (dados && (!sel || !dados.grupos.some((g) => g.id === sel))) setSel(dados.grupos[0]?.id ?? null) }, [dados, sel])
  const grupo = dados?.grupos.find((g) => g.id === sel) ?? null
  const totalPag = dados ? Math.max(1, Math.ceil(dados.total / pp)) : 1
  const filtrando = !!(q || verIgn || Object.values(filtros).some((v) => v?.length))
  const mudarFiltros = (f: FiltrosTermo) => { setFiltros(f); setPage(1) }

  async function ignorar(g: GrupoTermo, desfazer: boolean) {
    const r = await enviar({ acao: 'ignorar', tipo: g.tipo, grupoId: g.id, nomes: g.variantes.map((v) => v.nome), desfazer }, false)
    if (r.ok) { CACHE.clear(); toast.success(desfazer ? 'O grupo voltará a ser sugerido.' : 'Marcado como “São termos diferentes”.'); onMudou(); void carregar(true); return }
    if (r.semTabela) { // fallback no navegador
      const atual = lerLocal(g.tipo); const novo = desfazer ? atual.filter((k) => k !== g.id) : [...new Set([...atual, g.id])]
      gravarLocal(g.tipo, novo); onMudou()
      toast.success(desfazer ? 'O grupo voltará a ser sugerido (neste navegador).' : 'Marcado como “São termos diferentes” (guardado só neste navegador — aplique a migration 20261113060000 para valer para todos).')
      return
    }
    toast.error(r.error || 'Não foi possível salvar.')
  }

  return (
    <div className="space-y-4">
      {onTipos && dados?.porTipo && <AvisosDuplicados porTipo={dados.porTipo} selecionados={selecionados} onTipos={(t) => { onTipos(t); setPage(1) }} />}
      <TermosFiltrosCard tipos={selecionados} onTipos={(t) => { onTipos?.(t); setPage(1) }} filtros={filtros} onFiltros={mudarFiltros} facetas={dados?.facetas} disciplinas={dados?.opcoesDisciplina ?? []} mostrarTipo={!!onTipos} />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(20rem,28rem)_minmax(0,1fr)]">
      <PainelCard titulo={`Candidatos · ${nomeTipos}`} rotulo="Grupos candidatos a unificação"
        acao={<>{carregando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Carregando" />}<button type="button" onClick={() => { CACHE.clear(); void carregar(true); onMudou() }} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" title="Recalcular candidatos"><RefreshCw className="h-3.5 w-3.5" />Recalcular</button></>}
        barra={<>
          <div className="relative min-w-40 flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar termo…" aria-label="Buscar nos candidatos" className={campoBusca} autoComplete="off" /></div>
          <select className={selectBarra} value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }} aria-label="Ordenar">
            <option value="questoes">Mais questões</option><option value="score">Maior similaridade</option><option value="variantes">Mais variantes</option><option value="nome">Nome (A–Z)</option>
          </select>
          <select className={selectBarra} value={limiar} onChange={(e) => { onLimiar(Number(e.target.value)); setPage(1) }} aria-label="Limiar de similaridade para erros de digitação" title="Rigor da detecção de erros de digitação">
            {[0.98, 0.92, 0.85, 0.78, 0.7, 0.62].map((n) => <option key={n} value={n}>Similaridade ≥ {Math.round(n * 100)}%</option>)}
          </select>
          {(q || filtrando) && <button type="button" onClick={() => { setBusca(''); setQ(''); setFiltros({}); setPage(1) }} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" />Limpar</button>}
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={verIgn} onChange={(e) => { setVerIgn(e.target.checked); setPage(1) }} className="accent-[var(--primary)]" />Ver ignorados{dados && dados.ignorados > 0 ? ` (${dados.ignorados})` : ''}</label>
        </>}>
        {erro && !dados ? <ErroTentar msg={erro} onTentar={() => void carregar(true)} /> : !dados ? <Carregando /> : (
          <>
            <p className="mx-2 mb-1 rounded-lg bg-muted/60 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground" aria-live="polite">
              <b className="text-foreground">{fmt(dados.resumo.termos)}</b> termos em uso · <b className="text-foreground">{fmt(dados.resumo.questoes)}</b> questões · <b className="text-foreground">{fmt(dados.resumo.grupos)}</b> grupos
            </p>
            <div className="min-h-0 flex-1 overflow-auto p-1.5" role="listbox" aria-label="Grupos de termos candidatos">
              {dados.grupos.length === 0 ? <Vazio>{filtrando ? 'Nenhum grupo com esta busca/filtro.' : `Nenhum termo repetido ou parecido em ${nomeTipos.toLowerCase()} — a taxonomia está limpa nesse critério. Afrouxe a similaridade para procurar erros de digitação.`}</Vazio> : (
                <ul className="space-y-1.5">
                  {dados.grupos.map((g) => (
                    <li key={g.id}>
                      <button type="button" role="option" aria-selected={g.id === sel} onClick={() => setSel(g.id)}
                        className={cn('w-full rounded-xl border p-2.5 text-left transition-colors', g.id === sel ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted')}>
                        <span className="flex items-center gap-2 text-[11px]">
                          <span className={cn('rounded-full px-2 py-0.5 font-semibold', COR_CONF[g.confianca])}>{ROTULO_CONF_TERMO[g.confianca]} · {g.score}%</span>
                          {multiTipo && <span className="rounded-full border px-2 py-0.5 font-medium text-muted-foreground">{TIPOS_TERMO.find((t) => t.id === g.tipo)?.nome}</span>}
                          <span className="ml-auto tabular-nums text-muted-foreground">{fmt(g.questoes)} questões</span>
                        </span>
                        <span className="mt-1 block truncate text-sm font-medium" title={g.variantes.find((v) => v.id === g.canonicaId)?.nome}>{g.variantes.find((v) => v.id === g.canonicaId)?.nome}</span>
                        <span className="block truncate text-xs text-muted-foreground" title={g.motivo}>Sugestão: manter este · {g.motivo}</span>
                        <span className="block truncate text-xs text-muted-foreground">+ {g.variantes.length - 1}: {g.variantes.filter((v) => v.id !== g.canonicaId).map((v) => `${v.nome} (${fmt(v.questoes)})`).join(' · ')}</span>
                        {g.variantes[0].paiNome && <span className="block truncate text-[11px] text-muted-foreground">em {g.variantes[0].paiNome}</span>}
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

      <RevisaoGrupo key={grupo?.id ?? 'vazio'} tipo={grupo?.tipo ?? tipos[0]} grupo={grupo} ignorado={verIgn} podeEditar={podeEditar} onHistorico={onHistorico} carregando={!dados} onIgnorar={(g, d) => void ignorar(g, d)} onMesclado={() => { onMudou(); void carregar(true) }} />
      </div>
    </div>
  )
}

// ════════════════════════════════════════ AVISOS DE DUPLICADOS (faixa no topo) ════════════════════════════════════════
// Contagens por tipo vêm PRONTAS do servidor (`porTipo`); clicar aplica o filtro de tipo (clicar de novo volta para todos).
function AvisosDuplicados({ porTipo, selecionados, onTipos }: { porTipo: ResumoTipoTermo[]; selecionados: TipoTermo[]; onTipos: (t: TipoTermo[]) => void }) {
  const lista = TODOS_TIPOS.map((t) => porTipo.find((p) => p.tipo === t)).filter((p): p is ResumoTipoTermo => !!p)
  const grupos = lista.reduce((s, p) => s + p.grupos, 0)
  const termos = lista.reduce((s, p) => s + p.variantesEmGrupos, 0)
  const questoes = lista.reduce((s, p) => s + p.questoesEmGrupos, 0)
  return (
    <section aria-label="Avisos de termos duplicados" className={cn('rounded-2xl border p-3 shadow-sm', grupos > 0 ? 'border-amber-500/40 bg-amber-500/5' : 'bg-card')}>
      <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <AlertTriangle className={cn('h-4 w-4 shrink-0', grupos > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')} aria-hidden />
        {grupos > 0
          ? <span className="font-semibold text-foreground">{fmt(grupos)} grupo(s) de termos duplicados ou parecidos · {fmt(termos)} termos · {fmt(questoes)} questões afetadas</span>
          : <span className="font-semibold text-foreground">Nenhum termo duplicado nos critérios atuais</span>}
        <span className="text-muted-foreground">Clique em um tipo para filtrar a lista.</span>
      </p>
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {lista.map((p) => {
          const ativo = selecionados.length === 1 && selecionados[0] === p.tipo
          const alerta = p.grupos > 0
          return (
            <li key={p.tipo}>
              <button type="button" aria-pressed={ativo} onClick={() => onTipos(ativo ? [] : [p.tipo])}
                className={cn('w-full rounded-xl border p-2 text-left transition-colors hover:bg-muted', alerta ? 'border-amber-500/40 bg-amber-500/10' : 'bg-card', ativo && 'ring-2 ring-primary')}>
                <span className="block truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{PLURAL[p.tipo]}</span>
                <span className={cn('block text-sm font-semibold tabular-nums', alerta ? 'text-amber-700 dark:text-amber-400' : 'text-foreground')}>{alerta ? `${fmt(p.grupos)} grupo(s) duplicado(s)` : 'Sem duplicados'}</span>
                <span className="block truncate text-[11px] tabular-nums text-muted-foreground">{alerta ? `${fmt(p.variantesEmGrupos)} termos · ${fmt(p.questoesEmGrupos)} questões` : `${fmt(p.termos)} termos em uso`}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ════════════════════════════════════════ REVISÃO DO GRUPO ════════════════════════════════════════
function RevisaoGrupo({ tipo, grupo, ignorado, podeEditar, carregando, onIgnorar, onMesclado, onHistorico }: {
  tipo: TipoTermo; grupo: GrupoTermo | null; ignorado: boolean; podeEditar: boolean; carregando: boolean; onIgnorar: (g: GrupoTermo, desfazer: boolean) => void; onMesclado: () => void; onHistorico?: () => void
}) {
  const meta = TIPOS_TERMO.find((t) => t.id === tipo)!
  const [canon, setCanon] = useState(grupo?.canonicaId ?? '')
  const [fora, setFora] = useState<Set<string>>(new Set())
  const [nome, setNome] = useState(grupo?.nomeSugerido ?? '')
  const [exemplos, setExemplos] = useState<Record<string, ExemploQuestao[] | 'carregando'>>({})
  const [previa, setPrevia] = useState<PreviaMescla | null>(null)
  const [calc, setCalc] = useState(false); const [gravando, setGravando] = useState(false)
  const nomeEditado = useRef(false)

  const dupIds = grupo ? grupo.variantes.filter((v) => v.id !== canon && !fora.has(v.id)).map((v) => v.id) : []
  function escolherCanon(id: string) {
    setCanon(id); setFora((s) => { const n = new Set(s); n.delete(id); return n })
    if (!nomeEditado.current && grupo) setNome(grupo.variantes.find((v) => v.id === id)?.nome.replace(/\s+/g, ' ').trim() ?? '')
  }
  async function verExemplos(id: string) {
    if (exemplos[id]) { setExemplos((e) => { const n = { ...e }; delete n[id]; return n }); return }
    setExemplos((e) => ({ ...e, [id]: 'carregando' }))
    const j = await ler<{ exemplos: ExemploQuestao[] }>({ s: 'exemplos', tipo, id })
    setExemplos((e) => ({ ...e, [id]: j.ok ? j.exemplos : [] }))
  }
  async function abrirPrevia() {
    if (!grupo) return
    setCalc(true)
    const j = await enviar<PreviaMescla>({ acao: 'previa', tipo, canonicaId: canon, dupIds, nomeFinal: nome }, false)
    setCalc(false)
    if (!j.ok) { toast.error(j.error || 'Não foi possível calcular o impacto.'); return }
    setPrevia(j)
  }
  async function confirmarMescla() {
    if (!grupo || !previa) return
    setGravando(true)
    const j = await enviar<{ questoes?: number; removidas?: number; mantidas?: string[]; mantida?: string; assuntosUnidos?: number; podeDesfazer?: boolean }>({ acao: 'mesclar', tipo, canonicaId: canon, dupIds, nomeFinal: nome })
    setGravando(false)
    if (!j.ok) { toast.error(j.error || 'Não foi possível mesclar.'); return }
    setPrevia(null)
    toast.success(`Mesclado em “${j.mantida ?? nome}”: ${fmt(j.questoes ?? 0)} questão(ões) atualizada(s)${j.removidas ? `, ${j.removidas} cadastro(s) removido(s)` : ''}${j.assuntosUnidos ? `, ${j.assuntosUnidos} assunto(s) repetido(s) unido(s)` : ''}.${j.mantidas?.length ? ` Mantido(s) por ainda estarem em uso: ${j.mantidas.join(', ')}.` : ''}${j.podeDesfazer ? ' Dá para desfazer em Histórico.' : ''}`,
      j.podeDesfazer && onHistorico ? { action: { label: 'Desfazer', onClick: onHistorico }, duration: 12_000 } : undefined)
    onMesclado()
  }
  const ehSugestao = !!grupo && canon === grupo.canonicaId && fora.size === 0 && nome === grupo.nomeSugerido
  function usarSugestao() {
    if (!grupo) return
    nomeEditado.current = false; setCanon(grupo.canonicaId); setFora(new Set()); setNome(grupo.nomeSugerido)
  }

  return (
    <PainelCard titulo="Revisão do grupo" rotulo="Revisão do grupo de termos">
      {carregando ? <Carregando /> : !grupo ? <Vazio>Selecione um grupo à esquerda para revisar as variantes lado a lado.</Vazio> : (
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={cn('rounded-full px-2 py-0.5 font-semibold', COR_CONF[grupo.confianca])}>{ROTULO_CONF_TERMO[grupo.confianca]} · similaridade {grupo.score}%</span>
            <span className="text-muted-foreground">{grupo.motivo}</span>
          </div>

          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm" aria-label="Sugestão de unificação">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Sugestão</p>
            <p className="mt-0.5">Manter <b className="break-words">“{grupo.variantes.find((v) => v.id === grupo.canonicaId)?.nome}”</b> ({fmt(grupo.variantes.find((v) => v.id === grupo.canonicaId)?.questoes ?? 0)} questões) e unir {grupo.variantes.length - 1} variante(s):</p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {grupo.variantes.filter((v) => v.id !== grupo.canonicaId).map((v) => <li key={v.id} className="break-words">• {v.nome} <span className="tabular-nums">({fmt(v.questoes)} questões)</span></li>)}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">Por quê: {grupo.motivo} · confiança {ROTULO_CONF_TERMO[grupo.confianca].toLowerCase()} · similaridade {grupo.score}%.</p>
            {!ehSugestao && podeEditar && <button type="button" onClick={usarSugestao} className="mt-1 text-xs font-semibold text-primary hover:underline">Voltar à sugestão</button>}
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[34rem] text-sm">
              <thead><tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-3 py-2 font-medium">Manter</th><th className="px-3 py-2 font-medium">{meta.nome}</th>
                {tipo === 'assunto' && <th className="px-3 py-2 font-medium">Disciplina</th>}
                {tipo === 'disciplina' && <th className="px-3 py-2 text-right font-medium">Assuntos</th>}
                <th className="px-3 py-2 text-right font-medium">Questões</th><th className="px-3 py-2 text-right font-medium">Incluir</th>
              </tr></thead>
              <tbody>
                {grupo.variantes.map((v) => {
                  const eh = v.id === canon; const excl = fora.has(v.id) && !eh; const ex = exemplos[v.id]
                  return (
                    <Fragment key={v.id}>
                      <tr className={cn('border-b last:border-0', eh && 'bg-primary/5', excl && 'opacity-50')}>
                        <td className="px-3 py-2"><input type="radio" name={`canon-${grupo.id}`} checked={eh} onChange={() => escolherCanon(v.id)} className="h-4 w-4 accent-[var(--primary)]" aria-label={`Manter “${v.nome}”`} /></td>
                        <td className="max-w-[22rem] px-3 py-2"><span className="block break-words font-medium">{v.nome}</span>
                          {eh ? <span className="mt-0.5 inline-block rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">termo mantido</span> : null}
                          {v.questoes > 0 && <button type="button" onClick={() => void verExemplos(v.id)} className="ml-2 text-[11px] text-primary hover:underline">{ex ? 'ocultar exemplos' : 'ver exemplos'}</button>}
                        </td>
                        {tipo === 'assunto' && <td className="px-3 py-2 text-xs text-muted-foreground">{v.paiNome ?? '—'}</td>}
                        {tipo === 'disciplina' && <td className="px-3 py-2 text-right tabular-nums">{fmt(v.assuntos ?? 0)}</td>}
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{fmt(v.questoes)}</td>
                        <td className="px-3 py-2 text-right">{eh ? <span className="text-xs text-muted-foreground">—</span>
                          : <button type="button" onClick={() => setFora((s) => { const n = new Set(s); n.has(v.id) ? n.delete(v.id) : n.add(v.id); return n })} className="text-xs text-muted-foreground hover:text-foreground" title={excl ? 'Voltar a incluir na mescla' : 'Não é o mesmo termo: deixar de fora'}>{excl ? 'incluir' : 'não é igual'}</button>}</td>
                      </tr>
                      {ex && <tr key={`${v.id}-ex`} className="border-b bg-muted/30 last:border-0"><td /><td colSpan={tipo === 'assunto' || tipo === 'disciplina' ? 4 : 3} className="px-3 py-2">
                        {ex === 'carregando' ? <span className="text-xs text-muted-foreground">Carregando exemplos…</span> : ex.length === 0 ? <span className="text-xs text-muted-foreground">Sem questões ativas.</span> : (
                          <ul className="space-y-1">{ex.map((e) => <li key={e.id} className="text-xs"><span className="font-mono text-muted-foreground">{e.codigo ?? e.id.slice(0, 8)}</span> · {e.enunciado}</li>)}</ul>)}
                      </td></tr>}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="nome-canonico">Nome final do termo mantido</label>
            <input id="nome-canonico" value={nome} onChange={(e) => { nomeEditado.current = true; setNome(e.target.value) }} maxLength={200} disabled={!podeEditar}
              className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
            <p className="mt-1 text-xs text-muted-foreground">Sugestão: o mais usado e mais bem escrito. {meta.entidade ? 'O cadastro mantido é renomeado se você editar.' : 'O texto final passa a valer em todas as questões incluídas.'}</p>
          </div>

          {podeEditar ? (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <Button onClick={() => void abrirPrevia()} disabled={calc || !dupIds.length || !nome.trim() || ignorado}>{calc ? <Loader2 className="animate-spin" /> : <Merge />}{ehSugestao ? `Unificar com a sugestão (${dupIds.length + 1})` : `Ver impacto e mesclar ${dupIds.length + 1}`}</Button>
              {ignorado ? <Button variant="outline" onClick={() => onIgnorar(grupo, true)}><Undo2 />Voltar a sugerir</Button>
                : <Button variant="outline" onClick={() => onIgnorar(grupo, false)} title="Não sugerir mais este grupo"><EyeOff />São termos diferentes</Button>}
              {!dupIds.length && <span className="text-xs text-muted-foreground">Inclua ao menos uma variante para mesclar.</span>}
            </div>
          ) : <p className="border-t pt-3 text-xs text-muted-foreground">Somente leitura: você não tem permissão para editar questões.</p>}
        </div>
      )}

      <Dialog open={!!previa} onOpenChange={(o) => { if (!o && !gravando) setPrevia(null) }}>
        <DialogContent className="flex max-h-[88vh] w-full flex-col gap-0 p-0 sm:max-w-xl">
          {previa && (
            <>
              <DialogHeader className="border-b p-4 pr-12">
                <DialogTitle>Mesclar {previa.variantes.length + 1} termos em “{previa.nomeFinal}”?</DialogTitle>
                <DialogDescription>Confira o impacto antes de confirmar. Nada foi alterado ainda.</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Num rot="Questões" v={previa.impacto.questoes} />
                  {(tipo === 'disciplina' || tipo === 'assunto') && <Num rot={tipo === 'disciplina' ? 'Assuntos movidos' : 'Subassuntos'} v={previa.impacto.assuntos} />}
                  <Num rot="Simulados" v={previa.impacto.simulados} /><Num rot="Bancos" v={previa.impacto.bancos} />
                  <Num rot="Respostas" v={previa.impacto.respostas} />
                  {meta.entidade && <Num rot="Cadastros removidos" v={previa.impacto.removidas} />}
                </div>
                {previa.impacto.conteudos.length > 0 && (
                  <div className="rounded-lg border p-3 text-xs"><p className="mb-1 font-semibold">Conteúdos que apontam para as variantes (serão repontados para “{previa.canonica.nome}”)</p>
                    <ul className="space-y-0.5">{previa.impacto.conteudos.map((c) => <li key={c.tabela} className="flex justify-between"><span>{c.rotulo}</span><span className="tabular-nums">{fmt(c.n)}</span></li>)}</ul></div>
                )}
                <div className="rounded-lg border p-3 text-xs"><p className="mb-1 font-semibold">Mantido: “{previa.canonica.nome}”{previa.nomeFinal !== previa.canonica.nome ? ` → renomeado para “${previa.nomeFinal}”` : ''}</p>
                  <p className="text-muted-foreground">Variantes: {previa.variantes.map((v) => `${v.nome} (${fmt(v.questoes)})`).join(' · ')}</p></div>
                {previa.avisos.length > 0 && <ul className="space-y-1 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">{previa.avisos.map((a, i) => <li key={i}>• {a}</li>)}</ul>}
                <p className="text-xs text-muted-foreground">A ação é registrada na auditoria{previa.podeDesfazer ? ' e pode ser desfeita em Histórico' : ''}.</p>
              </div>
              <div className="flex justify-end gap-2 border-t p-3">
                <Button variant="outline" onClick={() => setPrevia(null)} disabled={gravando}>Cancelar</Button>
                <Button onClick={() => void confirmarMescla()} disabled={gravando}>{gravando ? <Loader2 className="animate-spin" /> : <Merge />}Confirmar mesclagem</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PainelCard>
  )
}
export function Num({ rot, v }: { rot: string; v: number }) {
  return <div className="rounded-lg border p-2 text-center"><p className="text-lg font-semibold tabular-nums">{fmt(v)}</p><p className="text-[11px] text-muted-foreground">{rot}</p></div>
}

// ════════════════════════════════════════ NORMALIZAÇÃO EM LOTE ════════════════════════════════════════
function Normalizar({ tipo, podeEditar, onMudou }: { tipo: TipoTermo; podeEditar: boolean; onMudou: () => void }) {
  const meta = TIPOS_TERMO.find((t) => t.id === tipo)!
  const [busca, setBusca] = useState(''); const [q, setQ] = useState(''); const [page, setPage] = useState(1); const pp = 20
  const [dados, setDados] = useState<RespostaNorm | null>(null); const [erro, setErro] = useState<string | null>(null); const [carregando, setCarregando] = useState(true)
  const [marcados, setMarcados] = useState<Set<string>>(new Set()); const [gravando, setGravando] = useState(false)
  const seq = useRef(0)
  useEffect(() => { const t = setTimeout(() => { if (busca.trim() !== q) { setQ(busca.trim()); setPage(1) } }, 300); return () => clearTimeout(t) }, [busca, q])
  const carregar = useCallback(async (fresh = false) => {
    const mine = ++seq.current; setErro(null); setCarregando(true)
    const j = await ler<RespostaNorm>({ s: 'norm', tipo, q, page, pp }, fresh)
    if (mine !== seq.current) return
    if (j.ok) setDados(j); else setErro(j.error ?? 'Falha ao carregar.')
    setCarregando(false)
  }, [tipo, q, page])
  useEffect(() => { void carregar() }, [carregar])
  const totalPag = dados ? Math.max(1, Math.ceil(dados.total / pp)) : 1

  async function selecionarTodas() {
    const ids = new Set(marcados); const paginas = Math.min(5, Math.ceil((dados?.total ?? 0) / 100))
    for (let p = 1; p <= paginas; p++) { const j = await ler<RespostaNorm>({ s: 'norm', tipo, q, page: p, pp: 100 }); if (j.ok) j.itens.forEach((i) => ids.add(i.de)) }
    setMarcados(ids)
  }
  async function aplicar() {
    const valores = [...marcados]; if (!valores.length) return
    const ok = await confirmar({ titulo: `Normalizar ${valores.length} valor(es) de ${meta.nome.toLowerCase()}?`, mensagem: `O texto de ${valores.length} valor(es) será corrigido (espaços, pontuação final, caixa) nas questões que os usam. Registrado na auditoria; dá para desfazer em Histórico.`, confirmar: 'Normalizar' })
    if (!ok) return
    setGravando(true)
    const j = await enviar<{ valores?: number; questoes?: number }>({ acao: 'normalizar', tipo, valores })
    setGravando(false)
    if (!j.ok) { toast.error(j.error || 'Não foi possível normalizar.'); return }
    toast.success(`${j.valores ?? 0} valor(es) normalizado(s) — ${fmt(j.questoes ?? 0)} questão(ões) atualizada(s).`)
    setMarcados(new Set()); onMudou(); void carregar(true)
  }
  const naPagina = dados?.itens ?? []
  const todosPagina = naPagina.length > 0 && naPagina.every((i) => marcados.has(i.de))

  return (
    <PainelCard titulo={`Normalização em lote · ${meta.nome}`} rotulo="Normalização de texto livre"
      acao={<>{carregando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Carregando" />}
        {podeEditar && <Button size="sm" disabled={!marcados.size || gravando} onClick={() => void aplicar()}>{gravando ? <Loader2 className="animate-spin" /> : <Wand2 />}Aplicar {marcados.size || ''}</Button>}</>}
      barra={<>
        <div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar valor…" aria-label="Buscar propostas" className={campoBusca} autoComplete="off" /></div>
        {dados && dados.total > 0 && <Button size="sm" variant="outline" onClick={() => void selecionarTodas()}>Selecionar todas ({fmt(Math.min(dados.total, 500))})</Button>}
        {marcados.size > 0 && <button type="button" onClick={() => setMarcados(new Set())} className="text-xs text-muted-foreground hover:text-foreground">Limpar seleção</button>}
      </>}>
      {erro && !dados ? <ErroTentar msg={erro} onTentar={() => void carregar(true)} /> : !dados ? <Carregando /> : (
        <>
          <p className="px-3 pt-2 text-xs text-muted-foreground">Correções <b>seguras</b> de formato (espaços duplicados, ponto final, TUDO EM MAIÚSCULAS/minúsculas). O servidor recalcula cada proposta ao aplicar. Para juntar termos diferentes use a aba de candidatos.</p>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {dados.itens.length === 0 ? <Vazio>{q ? 'Nenhuma proposta com esta busca.' : `Nenhum valor de ${meta.nome.toLowerCase()} precisa de normalização de formato.`}</Vazio> : (
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="w-9 px-2 py-2"><input type="checkbox" checked={todosPagina} onChange={(e) => setMarcados((s) => { const n = new Set(s); naPagina.forEach((i) => e.target.checked ? n.add(i.de) : n.delete(i.de)); return n })} className="accent-[var(--primary)]" aria-label="Selecionar a página" /></th>
                  <th className="px-2 py-2 font-medium">Atual</th><th className="px-2 py-2 font-medium">Proposto</th><th className="px-2 py-2 text-right font-medium">Questões</th><th className="px-2 py-2 font-medium">Motivo</th>
                </tr></thead>
                <tbody>{dados.itens.map((i) => (
                  <tr key={i.de} className="border-b last:border-0">
                    <td className="px-2 py-2"><input type="checkbox" checked={marcados.has(i.de)} onChange={(e) => setMarcados((s) => { const n = new Set(s); e.target.checked ? n.add(i.de) : n.delete(i.de); return n })} className="accent-[var(--primary)]" aria-label={`Selecionar ${i.de}`} /></td>
                    <td className="max-w-[18rem] break-words px-2 py-2 text-muted-foreground">{i.de}</td><td className="max-w-[18rem] break-words px-2 py-2 font-medium">{i.para}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmt(i.questoes)}</td><td className="px-2 py-2 text-xs text-muted-foreground">{i.motivo}</td>
                  </tr>))}</tbody>
              </table>
            )}
          </div>
          <nav className="flex items-center justify-between gap-2 border-t px-2 pt-2 text-xs text-muted-foreground" aria-label="Paginação">
            <span>{dados.total === 0 ? 'Nenhuma proposta' : `${fmt((page - 1) * pp + 1)}–${fmt(Math.min(page * pp, dados.total))} de ${fmt(dados.total)} · ${fmt(dados.questoes)} questões`}</span>
            <span className="flex items-center gap-1"><Button variant="outline" size="icon-sm" disabled={page <= 1 || carregando} onClick={() => setPage(page - 1)} aria-label="Página anterior"><ChevronLeft /></Button><span className="tabular-nums">{page}/{totalPag}</span><Button variant="outline" size="icon-sm" disabled={page >= totalPag || carregando} onClick={() => setPage(page + 1)} aria-label="Próxima página"><ChevronRight /></Button></span>
          </nav>
        </>
      )}
    </PainelCard>
  )
}

// ════════════════════════════════════════ HISTÓRICO ════════════════════════════════════════
function Historico({ podeEditar, onMudou }: { podeEditar: boolean; onMudou: () => void }) {
  const [dados, setDados] = useState<{ itens: MesclagemLog[]; semTabela: boolean } | null>(null); const [erro, setErro] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const carregar = useCallback(async (fresh = false) => { setErro(null); const j = await ler<{ itens: MesclagemLog[]; semTabela: boolean }>({ s: 'historico' }, fresh); if (j.ok) setDados(j); else setErro(j.error ?? 'Falha ao carregar.') }, [])
  useEffect(() => { void carregar(true) }, [carregar])
  async function desfazer(l: MesclagemLog) {
    const ok = await confirmar({ titulo: 'Desfazer esta mesclagem?', mensagem: `As ${fmt(l.questoes)} questão(ões) voltam aos termos de origem${l.origem === 'normalizacao' ? '' : ' e os cadastros removidos são recriados'}. Questões editadas depois não são sobrescritas.`, confirmar: 'Desfazer' })
    if (!ok) return
    setBusy(l.id)
    const j = await enviar<{ questoes?: number }>({ acao: 'desfazer', tipo: l.tipoTermo, id: l.id })
    setBusy(null)
    if (!j.ok) { toast.error(j.error || 'Não foi possível desfazer.'); return }
    toast.success(`Desfeito — ${fmt(j.questoes ?? 0)} questão(ões) restauradas.`); onMudou(); void carregar(true)
  }
  return (
    <PainelCard titulo="Mesclagens recentes" rotulo="Histórico de mesclagens">
      {erro && !dados ? <ErroTentar msg={erro} onTentar={() => void carregar(true)} /> : !dados ? <Carregando /> : (
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {dados.semTabela && <p className="mb-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">O histórico de Banca/Órgão/Assunto/Cargo/Assunto específico depende da migration <code>20261113060000_questoes_termos_mesclagens.sql</code> (ainda não aplicada). Disciplinas já aparecem abaixo.</p>}
          {dados.itens.length === 0 ? <Vazio>Nenhuma mesclagem para desfazer.</Vazio> : (
            <ul className="space-y-1.5">{dados.itens.map((l) => (
              <li key={l.id} className={cn('flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm', l.desfeita && 'opacity-50')}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{TIPOS_TERMO.find((t) => t.id === l.tipoTermo)?.nome}</span><span className="text-[11px] text-muted-foreground">{ROT_ORIGEM[l.origem]} · {new Date(l.criadoEm).toLocaleString('pt-BR')}</span></p>
                  <p className="mt-1 break-words font-medium">{l.nomeFinal || l.canonicaNome}</p>
                  <p className="break-words text-xs text-muted-foreground">{l.variantes.map((v) => v.nome).join(' · ')} — {fmt(l.questoes)} questões</p>
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

// ════════════════════════════════════════ ANOS (só consulta) ════════════════════════════════════════
function PainelAnos() {
  const [dados, setDados] = useState<{ itens: { ano: number; questoes: number; suspeito: boolean }[] } | null>(null); const [erro, setErro] = useState<string | null>(null)
  const carregar = useCallback(async () => { setErro(null); const j = await ler<{ itens: { ano: number; questoes: number; suspeito: boolean }[] }>({ s: 'anos', tipo: 'ano' }); if (j.ok) setDados(j); else setErro(j.error ?? 'Falha ao carregar.') }, [])
  useEffect(() => { void carregar() }, [carregar])
  return (
    <PainelCard titulo="Anos das questões" rotulo="Distribuição de anos">
      {erro && !dados ? <ErroTentar msg={erro} onTentar={() => void carregar()} /> : !dados ? <Carregando /> : (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <p className="mb-3 text-xs text-muted-foreground">Ano é um número na questão (não um texto), então não existem variantes para mesclar. Valores fora do intervalo plausível ficam destacados — corrija-os em <b>Classificação</b>.</p>
          {dados.itens.length === 0 ? <Vazio>Nenhuma questão com ano.</Vazio> : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{dados.itens.map((a) => (
              <li key={a.ano} className={cn('flex items-center justify-between rounded-lg border px-3 py-2 text-sm', a.suspeito && 'border-amber-500/50 bg-amber-500/10')}>
                <span className="font-medium tabular-nums">{a.ano}{a.suspeito && <AlertTriangle className="ml-1.5 inline h-3.5 w-3.5 text-amber-600" aria-label="Ano suspeito" />}</span><span className="tabular-nums text-muted-foreground">{fmt(a.questoes)} q</span>
              </li>))}</ul>
          )}
        </div>
      )}
    </PainelCard>
  )
}
