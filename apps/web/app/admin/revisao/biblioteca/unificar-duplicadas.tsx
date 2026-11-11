'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Archive, ChevronLeft, ChevronRight, Eye, History, Loader2, Merge, RefreshCw, Search, ShieldCheck, Undo2, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import { MarkdownContent } from '@/components/markdown-content'
import { CopiarCodigo } from '@/components/admin/copiar-codigo'
import { codigoQuestao } from '@/lib/codigo-questao'
import { cn } from '@/lib/utils'
import { plano } from '@/lib/admin-revisao/texto-plano'
import { DESC_NIVEL_DUP, ROTULO_NIVEL_DUP } from '@/lib/admin-revisao/biblioteca-questoes-gestao-tipos'
import {
  FILTROS_U_PADRAO, LIMIAR_MIN, LIMIAR_PADRAO, type GrupoU, type InicialUnificar, type HistoricoU, type MembroDup, type NivelDup, type PreviaU, type RespostaGruposU, type UsoFiltro, type VistaU,
} from '@/lib/admin-revisao/questoes-unificar-tipos'
import { Carregando, ErroTentar, ItemTrilho, PainelCard, Trilho, Vazio, campoBusca, selectBarra } from './gestao-ui'
import { aoMutar, limparCacheG } from './questoes-api'

const URL_U = '/api/admin/revisao/biblioteca/questoes-unificar'
const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
const NIVEIS: NivelDup[] = ['identica', 'codigo', 'enunciado', 'semelhante']
const COR_NIVEL: Record<NivelDup, string> = { identica: 'bg-primary/10 text-primary', codigo: 'bg-primary/10 text-primary', enunciado: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', semelhante: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' }
const LS_IGN = 'bib-unificar-ignorados-v1'

// ───────────────────────── cliente (cache 60 s + prefetch; mutações limpam) ─────────────────────────
type Params = Record<string, string | number | boolean | undefined | null>
const CACHE = new Map<string, { t: number; v: any }>()
const VOO = new Map<string, Promise<any>>()
const qs = (p: Params) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries(p).sort(([a], [b]) => (a < b ? -1 : 1))) if (v !== undefined && v !== null && v !== '' && v !== false) u.set(k, v === true ? '1' : String(v)); return u.toString() }
async function lerU<T = any>(p: Params, fresh = false): Promise<T & { ok: boolean; error?: string }> {
  const k = qs(p)
  if (!fresh) { const e = CACHE.get(k); if (e && Date.now() - e.t < 60_000) return e.v }
  const kk = fresh ? k + '&fresh=1' : k
  const voo = VOO.get(kk); if (voo) return voo
  const pr = (async () => {
    try {
      const r = await fetch(`${URL_U}?${kk}`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))
      if (r.ok && j?.ok !== false) CACHE.set(k, { t: Date.now(), v: j })
      return j
    } catch { return { ok: false, error: 'Falha de rede.' } } finally { VOO.delete(kk) }
  })()
  VOO.set(kk, pr); return pr
}
const prefetchU = (p: Params) => { const e = CACHE.get(qs(p)); if (!e || Date.now() - e.t >= 60_000) void lerU(p).catch(() => {}) }
async function postU<T = any>(acao: string, corpo: Record<string, unknown> = {}, mutacao = true): Promise<T & { ok: boolean; error?: string }> {
  try {
    const r = await fetch(URL_U, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao, ...corpo }) })
    const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))
    if (mutacao && (j?.ok || j?.servidor === false)) { CACHE.clear(); PREVIAS.clear(); limparCacheG() }
    return j
  } catch { return { ok: false, error: 'Falha de rede.' } as any }
}

// prévia com cache de 60 s + pré-carga (o diálogo abre na hora)
const PREVIAS = new Map<string, { t: number; p: Promise<any> }>()
function previaU(mestre: string, dups: string[]): Promise<PreviaU & { ok: boolean; error?: string }> {
  const k = mestre + '>' + [...dups].sort().join(','); const e = PREVIAS.get(k)
  if (e && Date.now() - e.t < 60_000) return e.p
  const p = postU<PreviaU>('previa', { mestreId: mestre, dupIds: dups }, false).then((j) => { if (!j.ok) PREVIAS.delete(k); return j })
  PREVIAS.set(k, { t: Date.now(), p }); return p
}
const chaveGrupo = (ids: string[]) => [...ids].sort().join(',')
function lerIgnLocal(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(LS_IGN) ?? '[]')) } catch { return new Set() } }
function gravarIgnLocal(s: Set<string>) { try { localStorage.setItem(LS_IGN, JSON.stringify([...s].slice(-2000))) } catch { /* sem storage */ } }

const NIVEL_TXT: Record<string, string> = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }
const metaPreenchida = (m: MembroDup) => [m.disciplina, m.assunto, m.banca, m.orgao, m.ano, m.cargo, m.nivel].filter(Boolean).length
const gabTxt = (m: MembroDup) => m.alternativas.filter((a) => a.correta).map((a) => plano(a.texto)).sort().join('|')

/** Mestre sugerida: ativa → mais respostas → mais simulados → mais completa (metadados, comentários, favoritos, etiquetas) → mais antiga. */
function sugerirMestre(m: MembroDup[]): { id: string; motivo: string } {
  const ord = [...m].sort((a, b) =>
    Number(b.status !== 'arquivada') - Number(a.status !== 'arquivada') || Number(b.status === 'publicada') - Number(a.status === 'publicada') ||
    b.uso.respostas - a.uso.respostas || b.uso.simulados - a.uso.simulados ||
    (metaPreenchida(b) + b.uso.comentarios + b.uso.favoritos + b.etiquetas.length) - (metaPreenchida(a) + a.uso.comentarios + a.uso.favoritos + a.etiquetas.length) ||
    (a.criadoEm ?? '').localeCompare(b.criadoEm ?? ''))
  const t = ord[0]; if (!t) return { id: '', motivo: '' }
  const motivo = t.uso.respostas > 0 ? `a mais respondida (${t.uso.respostas.toLocaleString('pt-BR')} respostas)` : t.uso.simulados > 0 ? `a mais usada em simulados (${t.uso.simulados})` : t.status === 'publicada' ? 'ativa e a mais completa' : 'a mais completa'
  return { id: t.id, motivo }
}

// ════════════════════════════════════════ COMPONENTE ════════════════════════════════════════
/** Chave de cache dos filtros padrão (a mesma que o cliente monta no 1º render) — o `inicial` do SSR vale para ela. */
const CHAVE_PADRAO = qs({ s: 'grupos', ...FILTROS_U_PADRAO })

export function UnificarDuplicadas({ podeEditar, idsManuais, onAbrirBanco, onTotal, inicial }: {
  podeEditar: boolean; idsManuais?: string[] | null; onAbrirBanco?: (e: { q: string; page: number }) => void; onTotal?: (n: number) => void
  /** dados do SSR (1ª página + membros do 1º grupo): renderiza na hora, sem chamada no load */
  inicial?: InicialUnificar | null
}) {
  const semente = useRef<InicialUnificar | null>(inicial ?? null)
  const g0 = inicial?.grupos.grupos[0]
  const [vista, setVista] = useState<VistaU>('pendentes')
  const [nivel, setNivel] = useState(''); const [uso, setUso] = useState<UsoFiltro>(''); const [gabarito, setGabarito] = useState('')
  const [disciplina, setDisciplina] = useState(''); const [banca, setBanca] = useState(''); const [ano, setAno] = useState(''); const [status, setStatus] = useState('')
  const [limiar, setLimiar] = useState(LIMIAR_PADRAO); const [limiarAplicado, setLimiarAplicado] = useState(LIMIAR_PADRAO)
  const [busca, setBusca] = useState(''); const [q, setQ] = useState(''); const [page, setPage] = useState(1)
  const [dados, setDados] = useState<RespostaGruposU | null>(inicial?.grupos ?? null); const [erro, setErro] = useState<string | null>(null); const [carregando, setCarregando] = useState(!inicial)
  const [grupo, setGrupo] = useState<{ id: string; ids: string[]; nivel?: NivelDup; scoreMin?: number; gabDiverge?: boolean; manual?: boolean } | null>(idsManuais?.length ? { id: 'manual', ids: idsManuais, manual: true } : g0 && inicial?.primeiro ? { id: g0.id, ids: g0.ids, nivel: g0.nivel, scoreMin: g0.scoreMin, gabDiverge: g0.gabDiverge } : null)
  const [membros, setMembros] = useState<MembroDup[] | null>(idsManuais?.length ? null : inicial?.primeiro?.membros ?? null); const [erroG, setErroG] = useState<string | null>(null)
  const [mestre, setMestre] = useState(() => (!idsManuais?.length && inicial?.primeiro ? sugerirMestre(inicial.primeiro.membros).id : '')); const [motivoMestre, setMotivoMestre] = useState(() => (!idsManuais?.length && inicial?.primeiro ? sugerirMestre(inicial.primeiro.membros).motivo : ''))
  const [acao, setAcao] = useState<'completa' | 'arquivar' | null>(null); const [historicoAberto, setHistoricoAberto] = useState(false)
  const [ignLocal, setIgnLocal] = useState<Set<string>>(new Set())
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const seq = useRef(0)
  const sementeMembros = useRef(!!inicial?.primeiro && !idsManuais?.length)

  useEffect(() => { setIgnLocal(lerIgnLocal()) }, [])
  const filtros = useMemo(() => ({ s: 'grupos', vista, nivel, uso, gabarito, disciplina, banca, ano, status, limiar: limiarAplicado, q, page, pp: 14 }), [vista, nivel, uso, gabarito, disciplina, banca, ano, status, limiarAplicado, q, page])
  // semeia o cache do cliente com o SSR (voltar a esta tela / trocar de vista e voltar < 60 s não chama a API)
  useEffect(() => {
    if (!inicial) return
    CACHE.set(CHAVE_PADRAO, { t: Date.now(), v: inicial.grupos })
    if (inicial.primeiro) CACHE.set(qs({ s: 'membros', ids: inicial.primeiro.ids.join(',') }), { t: Date.now(), v: { ok: true, membros: inicial.primeiro.membros } })
    onTotal?.(inicial.grupos.resumo.grupos)
    if (inicial.primeiro) { const s = sugerirMestre(inicial.primeiro.membros); const outras = inicial.primeiro.membros.filter((x) => x.id !== s.id && x.status !== 'arquivada').map((x) => x.id); if (s.id && outras.length) void previaU(s.id, outras).catch(() => {}) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const carregar = useCallback(async (fresh = false) => {
    if (qs(filtros) !== CHAVE_PADRAO) semente.current = null
    else if (!fresh && semente.current) return // 1º render = dados do SSR, zero chamadas (idempotente no StrictMode)
    const mine = ++seq.current; setErro(null); setCarregando(true)
    const j = await lerU<RespostaGruposU>(filtros, fresh)
    if (mine !== seq.current) return
    if (j.ok) { setDados(j); onTotal?.(j.resumo.grupos) } else setErro(j.error ?? 'Falha ao carregar.')
    setCarregando(false)
  }, [filtros, onTotal])
  useEffect(() => { void carregar() }, [carregar])
  useEffect(() => aoMutar(() => { CACHE.clear(); semente.current = null; void carregar(true) }), [carregar])
  useEffect(() => { const t = setTimeout(() => { if (busca.trim() !== q) { setQ(busca.trim()); setPage(1) } }, 300); return () => clearTimeout(t) }, [busca, q])
  useEffect(() => { const t = setTimeout(() => { if (limiar !== limiarAplicado) { setLimiarAplicado(limiar); setPage(1) } }, 350); return () => clearTimeout(t) }, [limiar, limiarAplicado])
  useEffect(() => { if (idsManuais?.length) setGrupo({ id: 'manual', ids: idsManuais, manual: true }) }, [idsManuais])
  // prefetch da próxima página (interação < 300 ms)
  useEffect(() => { if (dados && page * dados.pp < dados.total) prefetchU({ ...filtros, page: page + 1 }) }, [dados, filtros, page])

  const nFiltros = [nivel, uso, disciplina, banca, ano, status, gabarito].filter(Boolean).length + (limiarAplicado !== LIMIAR_PADRAO ? 1 : 0)
  const lista = useMemo(() => (dados?.grupos ?? []).filter((g) => vista !== 'pendentes' || !ignLocal.has(chaveGrupo(g.ids))), [dados, vista, ignLocal])
  useEffect(() => { if (!grupo && lista.length) setGrupo({ id: lista[0].id, ids: lista[0].ids, nivel: lista[0].nivel, scoreMin: lista[0].scoreMin, gabDiverge: lista[0].gabDiverge }) }, [lista]) // eslint-disable-line react-hooks/exhaustive-deps

  const carregarMembros = useCallback(async () => {
    if (!grupo) { setMembros(null); return }
    if (!inicial?.primeiro || grupo.manual || grupo.ids.join(',') !== inicial.primeiro.ids.join(',')) sementeMembros.current = false
    else if (sementeMembros.current) return // membros do 1º grupo vieram do SSR
    setErroG(null); setMembros(null)
    const j = await lerU<{ membros: MembroDup[] }>({ s: 'membros', ids: grupo.ids.join(',') })
    if (!j.ok) { setErroG(j.error ?? 'Falha ao carregar.'); return }
    const m = j.membros ?? []; setMembros(m)
    const s = sugerirMestre(m); setMestre(s.id); setMotivoMestre(s.motivo)
    const outras = m.filter((x) => x.id !== s.id && x.status !== 'arquivada').map((x) => x.id)
    if (s.id && outras.length) void previaU(s.id, outras).catch(() => {})
  }, [grupo])
  useEffect(() => { void carregarMembros() }, [carregarMembros])
  useEffect(() => aoMutar(() => { sementeMembros.current = false; void carregarMembros() }), [carregarMembros])

  const dups = (membros ?? []).filter((m) => m.id !== mestre && m.status !== 'arquivada')
  const ativas = (membros ?? []).filter((m) => m.status !== 'arquivada')
  const gabDiverge = useMemo(() => new Set((membros ?? []).map(gabTxt).filter(Boolean)).size > 1, [membros])
  const altSets = useMemo(() => { const por = new Map<string, Set<string>>(); for (const m of membros ?? []) por.set(m.id, new Set(m.alternativas.map((a) => plano(a.texto)))); return por }, [membros])
  const altDif = (m: MembroDup, t: string) => (membros ?? []).some((o) => o.id !== m.id && !altSets.get(o.id)?.has(plano(t)))
  const enunDif = (membros ?? []).length > 1 && new Set((membros ?? []).map((m) => plano(m.enunciado))).size > 1
  const idx = lista.findIndex((g) => g.id === grupo?.id)
  const irPara = (g?: GrupoU) => { if (g) setGrupo({ id: g.id, ids: g.ids, nivel: g.nivel, scoreMin: g.scoreMin, gabDiverge: g.gabDiverge }) }

  async function naoEDuplicada(ids: string[], contra?: string[], rotulo = 'Nenhuma destas questões é duplicada das outras') {
    if (!(await confirmar({ titulo: 'Marcar como “não é duplicada”', mensagem: `${rotulo}? Elas deixam de aparecer como duplicadas (nada é alterado nas questões). Dá para restaurar na visão “Ignoradas”.`, confirmar: 'Marcar' }))) return
    const r = await postU('ignorar', { ids, contra })
    if (r.ok) { toast.success('Marcado como “não é duplicada”.'); setGrupo(null); setMembros(null); return }
    if ((r as any).servidor === false) {
      const s = lerIgnLocal(); s.add(chaveGrupo(contra ? [...ids, ...contra] : ids)); gravarIgnLocal(s); setIgnLocal(s)
      toast.message('Guardado só neste navegador', { description: 'Aplique a migration 20261113050000 para gravar no servidor.' }); setGrupo(null); setMembros(null); return
    }
    toast.error(r.error || 'Não foi possível marcar.')
  }
  async function restaurar(ids: string[]) {
    const r = await postU('restaurar', { ids })
    if (r.ok) { toast.success('Voltou a ser tratado como possível duplicada.'); setGrupo(null); setMembros(null) } else toast.error(r.error || 'Não foi possível restaurar.')
  }

  const resumo = dados?.resumo
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <Trilho titulo="Grupos de duplicadas" rotulo="Grupos de questões duplicadas"
        acao={<span className="flex items-center gap-2">
          <button type="button" onClick={() => setHistoricoAberto(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" title="Unificações feitas (com desfazer)"><History className="h-3.5 w-3.5" />Histórico</button>
          <button type="button" onClick={() => { CACHE.clear(); void carregar(true) }} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" title="Recalcular a detecção agora"><RefreshCw className="h-3.5 w-3.5" />Recalcular</button>
        </span>}
        rodape={dados ? <>Detecção em {dados.totalQuestoes.toLocaleString('pt-BR')} questões · às {new Date(dados.geradoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} (cache de 5 min).{dados.degradado && ' Alguns blocos muito repetidos foram simplificados.'}</> : undefined}>
        <div className="space-y-2 px-1 pb-2">
          <div className="flex border-b" role="tablist" aria-label="Vista">
            {([['pendentes', 'Pendentes', resumo?.grupos], ['ignoradas', 'Ignoradas', resumo?.ignoradas], ['resolvidas', 'Resolvidas', resumo?.resolvidas]] as const).map(([id, nome, n]) => (
              <button key={id} type="button" role="tab" aria-selected={vista === id} onPointerEnter={() => { if (id !== vista) prefetchU({ ...filtros, vista: id, page: 1 }) }} onClick={() => { setVista(id); setPage(1); setGrupo(null); setMembros(null) }}
                className={cn('-mb-px flex flex-1 items-center justify-center gap-1 border-b-2 px-1.5 py-1.5 text-xs font-medium transition-colors', vista === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {nome}{!!n && <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold tabular-nums text-primary">{n.toLocaleString('pt-BR')}</span>}
              </button>
            ))}
          </div>
          {resumo && vista === 'pendentes' && (
            <p className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground">
              <b className="text-foreground">{resumo.grupos.toLocaleString('pt-BR')}</b> grupos · <b className="text-foreground">{resumo.questoes.toLocaleString('pt-BR')}</b> questões envolvidas
              {resumo.gabDiverge > 0 && <> · <b className="text-red-600 dark:text-red-400">{resumo.gabDiverge}</b> com gabarito divergente</>}
              {' '}· <b className="text-foreground">{resumo.emSimulado}</b> em simulado · <b className="text-foreground">{resumo.comRespostas}</b> com respostas
            </p>
          )}
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Enunciado, código ou código externo" aria-label="Buscar grupo" className={campoBusca} autoComplete="off" /></div>
          <button type="button" onClick={() => setFiltrosAbertos((v) => !v)} aria-expanded={filtrosAbertos} className="flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
            <span>Filtros{nFiltros > 0 ? ` (${nFiltros} ativo${nFiltros > 1 ? 's' : ''})` : ''}</span><ChevronRight className={cn('h-3.5 w-3.5 transition-transform', filtrosAbertos && 'rotate-90')} />
          </button>
          {filtrosAbertos && <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select className={selectBarra} value={nivel} onChange={(e) => { setNivel(e.target.value); setPage(1) }} aria-label="Tipo de coincidência">
              <option value="">Tipo: todos</option>{NIVEIS.map((n) => <option key={n} value={n}>{ROTULO_NIVEL_DUP[n]}{resumo ? ` (${resumo.porNivel[n]})` : ''}</option>)}
            </select>
            <select className={selectBarra} value={uso} onChange={(e) => { setUso(e.target.value as UsoFiltro); setPage(1) }} aria-label="Uso"><option value="">Uso: todos</option><option value="simulado">Em simulado</option><option value="respostas">Com respostas de alunos</option><option value="livre">Sem uso</option></select>
            <select className={selectBarra} value={disciplina} onChange={(e) => { setDisciplina(e.target.value); setPage(1) }} aria-label="Disciplina"><option value="">Disciplina: todas</option>{dados?.facetas.disciplinas.map((d) => <option key={d.id} value={d.id}>{d.nome} ({d.n})</option>)}</select>
            <select className={selectBarra} value={banca} onChange={(e) => { setBanca(e.target.value); setPage(1) }} aria-label="Banca"><option value="">Banca: todas</option>{dados?.facetas.bancas.map((d) => <option key={d.id} value={d.id}>{d.nome} ({d.n})</option>)}</select>
            <select className={selectBarra} value={ano} onChange={(e) => { setAno(e.target.value); setPage(1) }} aria-label="Ano"><option value="">Ano: todos</option>{dados?.facetas.anos.map((d) => <option key={d.id} value={d.id}>{d.nome} ({d.n})</option>)}</select>
            <select className={selectBarra} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Status"><option value="">Status: todos</option><option value="publicada">Ativa</option><option value="rascunho">Rascunho</option><option value="arquivada">Arquivada</option></select>
          </div>
          <select className={cn(selectBarra, 'w-full')} value={gabarito} onChange={(e) => { setGabarito(e.target.value); setPage(1) }} aria-label="Gabarito"><option value="">Gabarito: todos</option><option value="divergente">Só gabarito divergente</option><option value="ok">Só gabarito igual</option></select>
          <label className="block text-[11px] font-medium text-muted-foreground">
            <span className="flex justify-between"><span>Similaridade mínima (grupos “muito semelhantes”)</span><b className="tabular-nums text-foreground">{Math.round(limiar * 100)}%</b></span>
            <input type="range" min={Math.round(LIMIAR_MIN * 100)} max={100} step={1} value={Math.round(limiar * 100)} onChange={(e) => setLimiar(Number(e.target.value) / 100)} className="mt-1 w-full accent-[var(--primary)]" aria-label="Similaridade mínima" />
          </label>
          </div>}
        </div>
        {erro && !dados ? <ErroTentar msg={erro} onTentar={() => void carregar(true)} /> : !dados ? <Carregando linhas={7} /> : (
          <ul className={cn('space-y-1', carregando && 'opacity-60')}>
            {grupo?.manual && <li><ItemTrilho ativo onClick={() => {}} n={grupo.ids.length}><ShieldCheck className="h-4 w-4 shrink-0" />Seleção manual do Banco</ItemTrilho></li>}
            {lista.length === 0 && <li><Vazio>{vista === 'resolvidas' ? 'Nenhum grupo resolvido.' : vista === 'ignoradas' ? 'Nenhum grupo marcado como “não é duplicada”.' : q || nivel || uso || disciplina || banca || ano || status || gabarito ? 'Nenhum grupo com este filtro.' : 'Nenhuma duplicada pendente.'}</Vazio></li>}
            {lista.map((g) => (
              <li key={g.id}>
                <button type="button" onClick={() => irPara(g)} aria-current={grupo?.id === g.id} onPointerEnter={() => prefetchU({ s: 'membros', ids: g.ids.join(',') })} onFocus={() => prefetchU({ s: 'membros', ids: g.ids.join(',') })}
                  className={cn('flex w-full flex-col gap-1 rounded-lg border px-2.5 py-2 text-left', grupo?.id === g.id ? 'border-primary/50 bg-primary/10' : 'border-transparent hover:bg-muted')}>
                  <span className="flex flex-wrap items-center gap-1 text-[11px]">
                    <span className={cn('rounded-full px-1.5 py-0.5 font-semibold', COR_NIVEL[g.nivel])}>{ROTULO_NIVEL_DUP[g.nivel]}{g.nivel === 'semelhante' ? ` ${Math.round(g.scoreMin * 100)}%` : ''}</span>
                    <span className="tabular-nums text-muted-foreground">{g.n} questões</span>
                    {g.gabDiverge && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">gabarito divergente</span>}
                    {g.comRespostas ? <span className="ml-auto rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">com respostas</span> : g.emSimulado ? <span className="ml-auto rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">em simulado</span> : null}
                  </span>
                  <span className="line-clamp-2 text-xs text-foreground">{g.amostra || '(sem texto)'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {dados && dados.total > dados.pp && (
          <div className="mt-2 flex items-center justify-between px-1 text-xs text-muted-foreground">
            <Button size="icon-sm" variant="outline" disabled={page <= 1 || carregando} onClick={() => setPage(page - 1)} aria-label="Grupos anteriores"><ChevronLeft /></Button>
            <span>{((page - 1) * dados.pp + 1).toLocaleString('pt-BR')}–{Math.min(page * dados.pp, dados.total).toLocaleString('pt-BR')} de {dados.total.toLocaleString('pt-BR')}</span>
            <Button size="icon-sm" variant="outline" disabled={page * dados.pp >= dados.total || carregando} onClick={() => setPage(page + 1)} aria-label="Próximos grupos"><ChevronRight /></Button>
          </div>
        )}
        {dados && !dados.ignorarServidor && ignLocal.size > 0 && <p className="mt-2 px-1 text-[11px] text-amber-700 dark:text-amber-400">{ignLocal.size} marcação(ões) “não é duplicada” só neste navegador — aplique a migration 20261113050000.</p>}
      </Trilho>

      <PainelCard titulo="Revisão lado a lado"
        acao={grupo && !grupo.manual && idx >= 0 ? <><Button size="icon-sm" variant="outline" disabled={idx <= 0} onClick={() => irPara(lista[idx - 1])} aria-label="Grupo anterior"><ChevronLeft /></Button><Button size="icon-sm" variant="outline" disabled={idx >= lista.length - 1} onClick={() => irPara(lista[idx + 1])} aria-label="Próximo grupo"><ChevronRight /></Button></> : undefined}
        barra={grupo?.nivel ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className={cn('rounded-full px-1.5 py-0.5 font-semibold', COR_NIVEL[grupo.nivel])}>{ROTULO_NIVEL_DUP[grupo.nivel]}{grupo.nivel === 'semelhante' && grupo.scoreMin != null ? ` · ${Math.round(grupo.scoreMin * 100)}% parecidas` : ''}</span>
            <span>{DESC_NIVEL_DUP[grupo.nivel]}</span>
          </div>
        ) : grupo?.manual ? <p className="text-xs text-muted-foreground">Seleção manual: compare as questões escolhidas no Banco. A unificação completa só é liberada se forem idênticas.</p> : undefined}>
        {!grupo ? <Vazio>{dados && lista.length === 0 ? 'Nenhum grupo para revisar com esta vista/filtros.' : 'Escolha um grupo à esquerda para comparar as questões.'}</Vazio>
          : erroG ? <ErroTentar msg={erroG} onTentar={() => void carregarMembros()} />
          : !membros ? <Carregando linhas={6} /> : membros.length < 2 ? <Vazio>Este grupo não tem mais questões para comparar (já foi resolvido ou alguma foi excluída).</Vazio> : (
            <>
              {gabDiverge && (
                <div role="alert" className="mx-2 mb-2 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-700 dark:text-red-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><b>Gabarito divergente — revisar.</b> As alternativas corretas destas questões não coincidem; a unificação completa fica bloqueada. Confira a fonte oficial antes de arquivar qualquer uma.</span>
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-auto p-2">
                <div className="grid auto-cols-[minmax(19rem,1fr)] grid-flow-col gap-3">
                  {membros.map((m) => {
                    const ehMestre = m.id === mestre
                    return (
                      <article key={m.id} className={cn('flex min-w-0 flex-col gap-2 rounded-xl border p-3 text-sm', ehMestre && 'border-primary/60 bg-primary/5', m.status === 'arquivada' && 'opacity-70')}>
                        <header className="flex flex-wrap items-center gap-1.5">
                          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold"><input type="radio" name="mestre" checked={ehMestre} disabled={m.status === 'arquivada'} onChange={() => setMestre(m.id)} className="h-3.5 w-3.5 accent-[var(--primary)]" aria-label={`Escolher ${codigoQuestao(m.id, m.codigo)} como mestre`} />{ehMestre ? 'Mestre (fica)' : 'Duplicada'}</label>
                          <CopiarCodigo codigo={codigoQuestao(m.id, m.codigo)} />
                          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', m.status === 'publicada' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : m.status === 'rascunho' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-muted text-muted-foreground')}>{m.status === 'publicada' ? 'Ativa' : m.status === 'rascunho' ? 'Rascunho' : 'Arquivada'}</span>
                          {m.anulada && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">Anulada</span>}
                          <span className="text-[11px] text-muted-foreground">v{m.versao}</span>
                          {onAbrirBanco && <button type="button" className="ml-auto text-muted-foreground hover:text-primary" title="Ver esta questão no Banco" aria-label="Ver no Banco" onClick={() => onAbrirBanco({ q: codigoQuestao(m.id, m.codigo), page: 1 })}><Eye className="h-4 w-4" /></button>}
                        </header>
                        {ehMestre && motivoMestre && m.id === sugerirMestre(membros).id && <p className="text-[11px] text-primary">Sugerida: {motivoMestre}.</p>}
                        <div className="flex flex-wrap gap-1 text-[11px]">
                          {[m.disciplina && (m.assunto ? `${m.disciplina} › ${m.assunto}` : m.disciplina), m.banca, m.orgao, m.ano, m.cargo, m.nivel && NIVEL_TXT[m.nivel]].filter(Boolean).map((c, i) => <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{String(c)}</span>)}
                          {!m.disciplina && !m.banca && !m.ano && <span className="text-muted-foreground">sem classificação</span>}
                        </div>
                        <div className={cn('max-h-40 overflow-auto rounded-lg border bg-background p-2 text-[13px] leading-relaxed', enunDif && 'border-amber-500/50')}><MarkdownContent>{m.enunciado}</MarkdownContent></div>
                        <ul className="space-y-1">
                          {m.alternativas.map((a, i) => (
                            <li key={i} className={cn('rounded-md border px-2 py-1 text-xs', a.correta && (gabDiverge ? 'border-red-500/60 bg-red-500/10' : 'border-emerald-500/40'), !a.correta && altDif(m, a.texto) && 'bg-amber-500/10')}>
                              <b className={cn(a.correta && (gabDiverge ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'))}>{LETRAS[a.ordem] ?? '?'}){a.correta ? ' ✓' : ''}</b> <MarkdownContent inline>{a.texto}</MarkdownContent>
                            </li>
                          ))}
                          {m.alternativas.length === 0 && <li className="text-xs text-muted-foreground">Sem alternativas.</li>}
                        </ul>
                        {m.etiquetas.length > 0 && <div className="flex flex-wrap gap-1">{m.etiquetas.map((e) => <span key={e.id} className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${e.cor ?? '#64748b'}22`, color: e.cor ?? '#64748b' }}>{e.nome}</span>)}</div>}
                        <dl className="mt-auto grid grid-cols-3 gap-1 text-center text-[11px]">
                          {([['simulados', 'Simulados'], ['respostas', 'Respostas'], ['favoritos', 'Favoritos'], ['comentarios', 'Comentários'], ['bancos', 'Bancos'], ['feedbacks', 'Reportes']] as const).map(([k, r]) => (
                            <div key={k} className="rounded-md border px-1 py-1"><dd className="font-semibold tabular-nums text-foreground">{m.uso[k].toLocaleString('pt-BR')}</dd><dt className="text-muted-foreground">{r}</dt></div>
                          ))}
                        </dl>
                        {m.externalId && <p className="truncate text-[10.5px] text-muted-foreground" title={m.externalId}>código externo: {m.externalId}</p>}
                        {podeEditar && vista !== 'ignoradas' && !grupo.manual && membros.length > 2 && (
                          <button type="button" className="inline-flex items-center gap-1 self-start text-[11px] font-medium text-muted-foreground hover:text-primary" onClick={() => void naoEDuplicada([m.id], membros.filter((x) => x.id !== m.id).map((x) => x.id), 'Esta questão não é duplicada das outras do grupo')}><Ban className="h-3 w-3" />Não é duplicada das outras</button>
                        )}
                      </article>
                    )
                  })}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t px-2 pt-2.5">
                <p className="mr-auto min-w-48 flex-1 text-xs text-muted-foreground">
                  {gabDiverge ? <b className="text-red-600 dark:text-red-400">Gabarito divergente — revisar. </b> : null}
                  {dups.length ? <>Mestre fica ativa; {dups.length === 1 ? 'a outra ativa' : `as outras ${dups.length}`} {dups.length === 1 ? 'será arquivada' : 'serão arquivadas'}. Nada é apagado; respostas de alunos nunca são movidas.</> : ativas.length < 2 ? 'Grupo já resolvido: só há uma questão ativa.' : 'Escolha a mestre entre as ativas.'}
                </p>
                {podeEditar ? <>
                  {vista === 'ignoradas'
                    ? <Button variant="outline" onClick={() => void restaurar(membros.map((x) => x.id))}><Undo2 />Voltar a tratar como duplicada</Button>
                    : <Button variant="outline" onClick={() => void naoEDuplicada(membros.map((x) => x.id))}><Ban />Não é duplicada</Button>}
                  <Button variant="outline" disabled={!dups.length || !mestre} onClick={() => setAcao('arquivar')}><Archive />Arquivar duplicada{dups.length > 1 ? 's' : ''}…</Button>
                  <Button disabled={!dups.length || !mestre || gabDiverge} title={gabDiverge ? 'Gabarito divergente — revisar' : undefined} onClick={() => setAcao('completa')}><Merge />Unificar na mestre…</Button>
                </> : <span className="text-xs text-muted-foreground">Sem permissão para editar questões.</span>}
              </div>
            </>
          )}
      </PainelCard>

      {acao && mestre && (
        <PreviaDialog modo={acao} mestre={mestre} dups={dups.map((d) => d.id)} membros={membros ?? []} onClose={() => setAcao(null)}
          onFeito={() => { setAcao(null); setGrupo(null); setMembros(null) }} />
      )}
      {historicoAberto && <HistoricoDialog podeEditar={podeEditar} onClose={() => setHistoricoAberto(false)} />}
    </div>
  )
}

// ════════════════════════════════════════ PRÉVIA + CONFIRMAÇÃO ════════════════════════════════════════
function PreviaDialog({ modo, mestre, dups, membros, onClose, onFeito }: { modo: 'completa' | 'arquivar'; mestre: string; dups: string[]; membros: MembroDup[]; onClose: () => void; onFeito: () => void }) {
  const [p, setP] = useState<PreviaU | null>(null); const [erro, setErro] = useState<string | null>(null); const [enviando, setEnviando] = useState(false)
  const [reapontar, setReapontar] = useState(true); const [confirmaDiv, setConfirmaDiv] = useState(false)
  const dupKey = dups.join(',')
  useEffect(() => {
    let vivo = true
    void previaU(mestre, dupKey.split(',')).then((j) => { if (!vivo) return; if (j.ok) setP(j); else setErro(j.error ?? 'Não foi possível calcular a prévia.') })
    return () => { vivo = false }
  }, [mestre, dupKey])
  const cod = (id: string) => codigoQuestao(id, membros.find((x) => x.id === id)?.codigo)
  const bloqueada = modo === 'completa' && p && !p.modos.completa.permitido
  const precisaConfirmar = modo === 'arquivar' && !!p?.modos.arquivar.precisaConfirmar
  async function executar() {
    setEnviando(true)
    const r = await postU('unificar', { mestreId: mestre, dupIds: dups, modo, reapontar: modo === 'completa' && reapontar, confirmarDivergente: confirmaDiv })
    setEnviando(false)
    if (!r.ok) { toast.error(r.error || 'Não foi possível concluir.'); return }
    const n = r.resumo?.arquivadas ?? dups.length
    toast.success(modo === 'completa' ? `Unificadas em ${cod(mestre)}: ${n} arquivada(s).` : `${n} questão(ões) arquivada(s).`, {
      duration: 15000,
      action: { label: 'Desfazer', onClick: async () => {
        const u = await postU('desfazer', r.desfazer?.unificacaoId ? { unificacaoId: r.desfazer.unificacaoId } : { snapshot: r.desfazer?.snapshot, mestreId: r.desfazer?.mestreId, duplicadas: r.desfazer?.duplicadas })
        if (u.ok) toast.success('Desfeito: as duplicadas voltaram ao estado anterior.'); else toast.error(u.error || 'Não foi possível desfazer.')
      } },
    })
    onFeito()
  }
  const podeConfirmar = !!p && !bloqueada && (!precisaConfirmar || confirmaDiv)
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !enviando) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{modo === 'completa' ? 'Unificar na questão mestre' : 'Arquivar duplicada(s)'}</DialogTitle>
          <DialogDescription>Mestre: <b>{cod(mestre)}</b> · {dups.length === 1 ? 'duplicada' : 'duplicadas'}: {dups.map(cod).join(', ')}</DialogDescription>
        </DialogHeader>
        {erro && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-sm">{erro}</p>}
        {!p && !erro && <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Calculando o impacto…</div>}
        {p && (
          <div className="max-h-[60vh] space-y-3 overflow-auto text-sm">
            {p.gabaritoDivergente && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-700 dark:text-red-400"><b>Gabarito divergente — revisar.</b> {p.gabaritoDetalhe}</p>}
            {bloqueada && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs"><b>Unificação completa bloqueada:</b> {p.modos.completa.motivo} Neste caso só é seguro <b>arquivar a duplicada</b> — as questões podem não ser a mesma.</p>}
            {modo === 'completa' && !bloqueada && (
              <div className="rounded-lg border p-2.5">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passa para a mestre</p>
                <ul className="list-disc space-y-0.5 pl-5 text-xs">
                  <li>Etiquetas das duplicadas: {p.moveria.etiquetas ?? '—'} nova(s) (copiadas)</li>
                  <li>Favoritos de alunos: {p.moveria.favoritos} · Comentários: {p.moveria.comentarios} · Reportes de erro: {p.moveria.feedbacks}</li>
                  <li>Bancos (pastas de questões): {p.moveria.bancos} vínculo(s) copiado(s)</li>
                  <li>Campos vazios da mestre completados: {p.preenche.length ? p.preenche.join(', ') : 'nenhum'}</li>
                </ul>
                <label className={cn('mt-2 flex items-start gap-2 text-xs', p.simulados.reapontaveis === 0 && 'opacity-60')}>
                  <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-[var(--primary)]" checked={reapontar && p.simulados.reapontaveis > 0} disabled={p.simulados.reapontaveis === 0} onChange={(e) => setReapontar(e.target.checked)} />
                  <span>Trocar a duplicada pela mestre em <b>{p.simulados.reapontaveis}</b> simulado(s) que <b>ninguém iniciou</b> (sem nenhuma sessão de aluno). {p.simulados.semSessaoMasComMestre > 0 && `${p.simulados.semSessaoMasComMestre} já têm a mestre. `}Simulados com sessão/respostas nunca são alterados.</span>
                </label>
              </div>
            )}
            <div className="rounded-lg border p-2.5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fica como está (histórico preservado)</p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs">
                <li><b>{p.ficam.simulados}</b> simulado(s) usam as duplicadas e <b>{p.ficam.respostas.toLocaleString('pt-BR')}</b> resposta(s) de alunos continuam ligadas a elas (arquivadas) — notas e re-correção não mudam.</li>
                <li>{p.ficam.conteudos} vínculo(s) com conteúdos/cronograma continuam na duplicada.</li>
                {modo === 'arquivar' && <li>Comentários, favoritos, etiquetas, bancos e simulados não são movidos neste modo.</li>}
              </ul>
            </div>
            {precisaConfirmar && (
              <label className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
                <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-[var(--primary)]" checked={confirmaDiv} onChange={(e) => setConfirmaDiv(e.target.checked)} />
                <span>{p.modos.arquivar.motivo} Confirmo que revisei lado a lado e quero <b>arquivar mesmo assim</b>.</span>
              </label>
            )}
            <p className="text-xs text-muted-foreground">As duplicadas ficam <b>arquivadas</b> (somem para o aluno, nada é apagado) e a operação é auditada{p.vinculoServidor ? ' e registrada no histórico com opção de DESFAZER' : ' (o desfazer persistente depende da migration 20261113050000; por ora só logo após a ação)'}.</p>
          </div>
        )}
        <div className="-mx-4 -mb-4 mt-2 flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          {bloqueada ? <Button variant="outline" onClick={onClose}>Entendi</Button>
            : <Button disabled={!podeConfirmar || enviando} onClick={() => void executar()}>{enviando && <Loader2 className="animate-spin" />}{modo === 'completa' ? 'Confirmar: unificar e arquivar' : 'Confirmar: arquivar'}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ════════════════════════════════════════ HISTÓRICO / DESFAZER ════════════════════════════════════════
function HistoricoDialog({ podeEditar, onClose }: { podeEditar: boolean; onClose: () => void }) {
  const [d, setD] = useState<{ disponivel: boolean; itens: HistoricoU[] } | null>(null); const [erro, setErro] = useState<string | null>(null); const [busy, setBusy] = useState<string | null>(null)
  const carregar = useCallback(async () => { const j = await lerU<{ disponivel: boolean; itens: HistoricoU[] }>({ s: 'historico' }, true); if (j.ok) setD(j); else setErro(j.error ?? 'Falha ao carregar.') }, [])
  useEffect(() => { void carregar() }, [carregar])
  async function desfazer(id: string) {
    if (!(await confirmar({ titulo: 'Desfazer unificação', mensagem: 'As duplicadas voltam ao status anterior e os favoritos/comentários/reportes movidos voltam para elas.', confirmar: 'Desfazer' }))) return
    setBusy(id); const r = await postU('desfazer', { unificacaoId: id }); setBusy(null)
    if (r.ok) { toast.success('Unificação desfeita.'); void carregar() } else toast.error(r.error || 'Não foi possível desfazer.')
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Histórico de unificações</DialogTitle><DialogDescription>Últimas 30 ações. Dá para desfazer enquanto as questões não forem editadas de forma conflitante.</DialogDescription></DialogHeader>
        {erro ? <p className="text-sm text-destructive">{erro}</p> : !d ? <Carregando linhas={4} /> : !d.disponivel ? <Vazio>O histórico persistente ainda não está ativo — aplique a migration 20261113050000. As ações continuam auditadas em Auditoria.</Vazio> : d.itens.length === 0 ? <Vazio>Nenhuma unificação feita ainda.</Vazio> : (
          <ul className="max-h-[55vh] space-y-2 overflow-auto">
            {d.itens.map((h) => (
              <li key={h.id} className="flex items-center gap-2 rounded-lg border p-2.5 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{h.modo === 'completa' ? 'Unificação completa' : 'Arquivamento'} · {new Date(h.executadoEm).toLocaleString('pt-BR')}</p>
                  <p className="truncate text-muted-foreground">Mestre {codigoQuestao(h.mestreId, null)} · {h.duplicadas.length} duplicada(s) · {h.resumo?.favoritos ?? 0} fav., {h.resumo?.comentarios ?? 0} coment., {h.resumo?.simuladosReapontados ?? 0} simulado(s) trocados</p>
                </div>
                {h.desfeitoEm ? <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">desfeita</span>
                  : podeEditar ? <Button size="sm" variant="outline" disabled={busy === h.id} onClick={() => void desfazer(h.id)}>{busy === h.id ? <Loader2 className="animate-spin" /> : <Undo2 />}Desfazer</Button> : null}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
