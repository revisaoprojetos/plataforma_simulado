'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Archive, BookOpen, CheckCircle2, Check, Columns3, Folder, GraduationCap, Inbox, Keyboard, Loader2, Merge, Tag, Tags, Trash2, Wand2, X, FolderInput } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { Nota } from '@/components/admin/revisao/pedagogico-ui'
import { QuestoesTabelaBase, type QuestaoLinha } from '@/components/admin/questoes-tabela-base'
import { NovaQuestaoDialog } from '@/components/admin/nova-questao-dialog'
import { ExportQuestoesButton } from '@/components/admin/export-questoes-button'
import type { ArvoreBib, NoPasta } from '@/lib/admin-revisao/biblioteca-tipos'
import {
  AGRUPAMENTOS_Q, ESTADO_Q_PADRAO, PP_Q, VISOES_Q, hidratarResposta, paramsDeEstadoQ,
  type AgrupamentoQ, type EstadoQ, type OpcoesQ, type RespostaQ,
} from '@/lib/admin-revisao/biblioteca-questoes-tipos'
import type { ResumoClassif, SugestaoQ } from '@/lib/admin-revisao/biblioteca-questoes-gestao-tipos'
import type { UsoQuestao } from '@/app/admin/questoes/actions-tipos'
import { PastasPainel, RAIZ } from './pastas-painel'
import { PaginacaoBib } from './paginacao-bib'
import { ClassificarDialog, type PatchUI } from './classificar-dialog'
import { QuestaoPainel, limparCachePainel, prefetchPainel } from './questao-painel'
import { aoMutar, lerG, postG } from './questoes-api'

// ── cache cliente (60 s) + pré-carga: clicar numa disciplina/assunto/página já visitada responde em < 300 ms ──
const CACHE = new Map<string, { t: number; v: RespostaQ }>()
const ARV = new Map<AgrupamentoQ, { t: number; v: ArvoreBib }>()
let OPC: { t: number; v: OpcoesQ } | null = null
const TTL = 60_000
const chave = (s: EstadoQ) => paramsDeEstadoQ(s).toString() + '|' + s.agrupar
const lerCache = (s: EstadoQ) => { const e = CACHE.get(chave(s)); return e && Date.now() - e.t < TTL ? e.v : undefined }
const lerArv = (a: AgrupamentoQ) => { const e = ARV.get(a); return e && Date.now() - e.t < TTL ? e.v : undefined }
const lerOpc = () => (OPC && Date.now() - OPC.t < TTL ? OPC.v : undefined)
const URL_API = '/api/admin/revisao/biblioteca/questoes'
export function limparCacheBanco() { CACHE.clear(); ARV.clear(); OPC = null; limparCachePainel() }
aoMutar(limparCacheBanco) // qualquer mutação feita pelas outras sub-abas invalida o Banco

// Requisições em andamento: a MESMA URL nunca vai 2× (prefetch repetido) e o pré-aquecimento só roda com a rede livre.
const EM_VOO = new Map<string, Promise<RespostaQ>>()
const rede_livre = () => EM_VOO.size === 0
function buscarQ(s: EstadoQ, extra: Record<string, string> = {}): Promise<RespostaQ> {
  const p = paramsDeEstadoQ(s); p.set('ag', s.agrupar)
  for (const [k, v] of Object.entries(extra)) p.set(k, v)
  const url = `${URL_API}?${p}`
  const voo = EM_VOO.get(url); if (voo) return voo
  const pr = (async () => {
    const r = await fetch(url, { cache: 'no-store' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const j = hidratarResposta((await r.json()) as RespostaQ)!
    CACHE.set(chave(s), { t: Date.now(), v: j })
    if (j.arvore) ARV.set(s.agrupar, { t: Date.now(), v: j.arvore })
    if (j.opcoes) OPC = { t: Date.now(), v: j.opcoes }
    return j
  })().finally(() => EM_VOO.delete(url))
  EM_VOO.set(url, pr)
  return pr
}
/** Executa `fn` quando o navegador estiver ocioso (requestIdleCallback) — nunca compete com a carga principal. */
const quandoOcioso = (fn: () => void) => { const w = window as any; if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 4000 }); else setTimeout(fn, 1500) }
/** Pré-carrega (hover na aba Questões) a 1ª página + árvore do estado padrão. */
export function prefetchQuestoesBanco(s: EstadoQ = ESTADO_Q_PADRAO) {
  if (lerCache(s) && lerArv(s.agrupar) && lerOpc()) return
  void buscarQ(s, { tree: '1' }).catch(() => {})
}
export function totalBancoEmCache(): number | null { const e = CACHE.get(chave(ESTADO_Q_PADRAO)); return e ? e.v.totalBanco : null }

async function api<T = any>(acao: string, corpo: Record<string, unknown>): Promise<T & { ok: boolean; error?: string }> {
  try {
    const r = await fetch(URL_API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao, ...corpo }) })
    return (await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))) as any
  } catch { return { ok: false, error: 'Falha de rede.' } as any }
}

const selectCls = 'h-9 rounded-lg border bg-card px-2.5 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
const VISOES_FILA = ['sem_classificacao', 'sem_disciplina', 'sem_assunto', 'sem_banca', 'sem_orgao', 'sem_ano', 'sem_dificuldade', 'sem_cargo', 'assunto_divergente']
const COLUNAS_SEL: { k: string; rot: string }[] = [
  { k: 'tipo', rot: 'Tipo' }, { k: 'disciplina', rot: 'Disciplina' }, { k: 'assunto', rot: 'Assunto' }, { k: 'detalhe', rot: 'Assunto específico' }, { k: 'banca', rot: 'Banca' },
  { k: 'orgao', rot: 'Órgão' }, { k: 'cargo', rot: 'Cargo' }, { k: 'ano', rot: 'Ano' }, { k: 'dif', rot: 'Dificuldade' }, { k: 'status', rot: 'Status' },
  { k: 'alt', rot: 'Nº de alternativas' }, { k: 'versao', rot: 'Versão' }, { k: 'atualizado', rot: 'Atualizada em' },
]
const LS_COL = 'bibq:colunas:v2'

/** Banco de questões (aba Questões da Biblioteca): árvore por taxonomia à esquerda (mesmo painel das pastas), lista REAL à direita
 *  (QuestoesTabelaBase em modo servidor), visões rápidas, seletor de colunas, painel lateral, atalhos de teclado, seleção + ações em massa.
 *  `modo="fila"` = fila de classificação (sem árvore, com coluna de sugestão) usada na sub-aba Classificação. */
export function QuestoesBanco({ inicial: inicialBruto, estadoInicial, podeEditar, podeExcluir, podeCriar, podeImportarPlataforma, onTotalBanco, contagensInicial, sel: selExt, setSel: setSelExt, modo = 'banco', onUnificarSelecionadas, onIrDuplicadas, onMudou }: {
  inicial: RespostaQ | null; estadoInicial: EstadoQ; podeEditar: boolean; podeExcluir: boolean; podeCriar: boolean; podeImportarPlataforma: boolean
  onTotalBanco?: (n: number) => void
  /** resumo das visões lido no servidor (SSR): os chips nascem com número, sem chamada no load */
  contagensInicial?: ResumoClassif | null
  /** seleção controlada pelo pai (persiste entre sub-abas) */
  sel?: Set<string>; setSel?: Dispatch<SetStateAction<Set<string>>>
  modo?: 'banco' | 'fila'
  onUnificarSelecionadas?: (ids: string[]) => void
  onIrDuplicadas?: (ids: string[]) => void
  /** avisa o pai que algo mudou (ex.: recarregar indicadores da Classificação) */
  onMudou?: () => void
}) {
  const fila = modo === 'fila'
  const inicial = useMemo(() => hidratarResposta(inicialBruto), []) // eslint-disable-line react-hooks/exhaustive-deps
  // semeia o cache cliente com o que veio do SSR (StrictMode/re-montagem/voltar à aba não refazem a chamada)
  const semeado = useRef(false)
  if (!semeado.current) { semeado.current = true; if (inicial && !fila) { const t = Date.now(); CACHE.set(chave(estadoInicial), { t, v: inicial }); if (inicial.arvore) ARV.set(estadoInicial.agrupar, { t, v: inicial.arvore }); if (inicial.opcoes) OPC = { t, v: inicial.opcoes } } }
  const [st, setSt] = useState<EstadoQ>(estadoInicial)
  const [dados, setDados] = useState<RespostaQ | null>(inicial ?? lerCache(estadoInicial) ?? null)
  const [arvores, setArvores] = useState<Partial<Record<AgrupamentoQ, ArvoreBib>>>(() => {
    const o: Partial<Record<AgrupamentoQ, ArvoreBib>> = {}
    for (const a of AGRUPAMENTOS_Q) { const v = a.id === estadoInicial.agrupar && inicial?.arvore ? inicial.arvore : lerArv(a.id); if (v) o[a.id] = v }
    return o
  })
  const [opcoes, setOpcoes] = useState<OpcoesQ | null>(inicial?.opcoes ?? lerOpc() ?? null)
  const [carregando, setCarregando] = useState(!inicial && !lerCache(estadoInicial))
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState(estadoInicial.q)
  const [selInt, setSelInt] = useState<Set<string>>(new Set())
  const sel = selExt ?? selInt
  const setSel = setSelExt ?? setSelInt
  const [ocultarVazias, setOcultarVazias] = useState(true)
  const [emLote, setEmLote] = useState<string | null>(null)
  const [classificar, setClassificar] = useState(false)
  const [etiquetar, setEtiquetar] = useState(false)
  const [painelId, setPainelId] = useState<string | null>(null)
  const [contagens, setContagens] = useState<ResumoClassif | null>(contagensInicial ?? null)
  const [ocultas, setOcultas] = useState<Set<string>>(new Set())
  const [menuCols, setMenuCols] = useState(false)
  const [sugestoes, setSugestoes] = useState<Record<string, SugestaoQ>>({})
  const [aplicando, setAplicando] = useState<string | null>(null)
  const seq = useRef(0)
  const primeira = useRef(!!(inicial || lerCache(estadoInicial)))
  const arvoresRef = useRef(arvores); arvoresRef.current = arvores
  const opcoesRef = useRef(opcoes); opcoesRef.current = opcoes
  const colRef = useRef<HTMLDivElement>(null)

  const arvore = arvores[st.agrupar] ?? null
  const ag = AGRUPAMENTOS_Q.find((a) => a.id === st.agrupar)!

  const aplicar = useCallback((j: RespostaQ, s: EstadoQ) => {
    setDados(j)
    if (j.arvore) setArvores((a) => ({ ...a, [s.agrupar]: j.arvore! }))
    if (j.opcoes) setOpcoes(j.opcoes)
    onTotalBanco?.(j.totalBanco)
  }, [onTotalBanco])

  const proxima = useCallback((s: EstadoQ, total: number) => { if (s.page * s.pp >= total) return; const n = { ...s, page: s.page + 1 }; quandoOcioso(() => { if (!lerCache(n) && rede_livre()) void buscarQ(n).catch(() => {}) }) }, [])
  const carregar = useCallback(async (s: EstadoQ, opts: { fresh?: boolean } = {}) => {
    const mine = ++seq.current
    setErro(null)
    const precisaArvore = !!opts.fresh || (!fila && !arvoresRef.current[s.agrupar]) || !opcoesRef.current
    const extra: Record<string, string> = {}
    if (opts.fresh) extra.fresh = '1'
    if (precisaArvore) { if (fila) extra.opcoes = '1'; else extra.tree = '1' } // fila: só as opções (sem a árvore de ~170 KB)
    if (!opts.fresh) {
      const hit = lerCache(s)
      if (hit && (!precisaArvore || ((fila || lerArv(s.agrupar)) && lerOpc()))) {
        aplicar({ ...hit, arvore: hit.arvore ?? lerArv(s.agrupar), opcoes: hit.opcoes ?? lerOpc() }, s); setCarregando(false)
        if (s.page * s.pp < hit.total) proxima(s, hit.total) // próxima página já a caminho (ocioso)
        return
      }
    }
    setCarregando(true)
    try {
      const j = await buscarQ(s, extra)
      if (mine !== seq.current) return
      aplicar(j, s)
      if (s.page * s.pp < j.total) proxima(s, j.total)
    } catch (e: any) { if (mine === seq.current) setErro(e?.message ?? 'Falha ao carregar.') }
    finally { if (mine === seq.current) setCarregando(false) }
  }, [aplicar, fila])

  // 1ª montagem com dados prontos (SSR/cache): só completa árvore/opções se faltarem; depois, qualquer mudança de estado recarrega.
  useEffect(() => {
    if (primeira.current) { primeira.current = false; if ((!fila && !arvoresRef.current[st.agrupar]) || !opcoesRef.current) void carregar(st); return }
    void carregar(st)
  }, [st]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (busca === st.q) return; const t = setTimeout(() => setSt((s) => ({ ...s, q: busca.trim(), page: 1 })), 300); return () => clearTimeout(t) }, [busca, st.q])
  // Pré-aquece (em segundo plano, escalonado) a 1ª página dos primeiros itens da árvore: o clique neles fica instantâneo.
  useEffect(() => {
    const nos = arvore?.nos
    if (fila || !nos?.length) return
    // só os 2 maiores nós, depois que o navegador ficar ocioso e SEM requisição pendente (não compete com a carga principal)
    const alvos = nos.filter((n) => !n.paiId && n.total > 0).sort((a, b) => b.total - a.total).slice(0, 2)
    let vivo = true
    quandoOcioso(() => { void (async () => { for (const n of alvos) { if (!vivo || !rede_livre()) return; const e = { ...st, no: n.id, page: 1 }; if (!lerCache(e)) await buscarQ(e).catch(() => {}) } })() })
    return () => { vivo = false }
  }, [arvore, st.agrupar]) // eslint-disable-line react-hooks/exhaustive-deps
  // URL compartilhável (a Biblioteca deixa a URL desta sub-aba por conta deste componente)
  useEffect(() => {
    if (fila) return
    const p = paramsDeEstadoQ(st); p.set('aba', 'questoes')
    window.history.replaceState(null, '', `${window.location.pathname}?${p}`)
  }, [st, fila])
  // contagens das visões rápidas (SQL agregado, cache 60 s) — depois da 1ª lista, sem bloquear
  const carregarContagens = useCallback((fresh = false) => { void lerG<ResumoClassif>({ s: 'resumo' }, { fresh }).then((j) => { if (j.ok) setContagens(j) }) }, [])
  useEffect(() => { if (contagensInicial) return; const t = setTimeout(() => carregarContagens(), 150); return () => clearTimeout(t) }, [carregarContagens]) // eslint-disable-line react-hooks/exhaustive-deps
  // colunas visíveis: preferência por navegador
  useEffect(() => { try { const raw = localStorage.getItem(LS_COL); if (raw) setOcultas(new Set(JSON.parse(raw))) } catch { /* sem storage */ } }, [])
  const alternarColuna = (k: string) => setOcultas((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); try { localStorage.setItem(LS_COL, JSON.stringify([...n])) } catch { /* no-op */ } return n })
  useEffect(() => {
    if (!menuCols) return
    const fecha = (e: MouseEvent) => { if (!colRef.current?.contains(e.target as Node)) setMenuCols(false) }
    document.addEventListener('mousedown', fecha); return () => document.removeEventListener('mousedown', fecha)
  }, [menuCols])

  const prefetch = useCallback((s: EstadoQ) => { if (!lerCache(s)) void buscarQ(s).catch(() => {}) }, [])
  const recarregar = useCallback(() => { limparCacheBanco(); void carregarContagens(true); onMudou?.(); return carregar(st, { fresh: true }) }, [carregar, st, carregarContagens, onMudou])

  const temFiltro = !!(st.q || st.status || st.dif || st.tipo || st.banca || st.orgao || st.ano || (st.vis && !fila))
  const limparFiltros = () => { setBusca(''); setSt((s) => ({ ...s, q: '', status: '', dif: '', tipo: '', banca: '', orgao: '', ano: '', vis: fila ? s.vis : '', page: 1 })) }
  const noAtual: NoPasta | null = st.no && st.no !== RAIZ ? arvore?.nos.find((n) => n.id === st.no) ?? null : null
  const rotuloNo = st.no === RAIZ ? ag.sem : noAtual ? noAtual.nome : null
  // ao pairar no seletor, pré-carrega (1ª página + árvore) de cada agrupamento: trocar de agrupamento passa a ser instantâneo
  const prefetchAgrupamentos = () => { for (const a of AGRUPAMENTOS_Q) { const s = { ...st, agrupar: a.id, no: null, page: 1 }; if (!lerCache(s) || !lerArv(a.id)) void buscarQ(s, { tree: '1' }).catch(() => {}) } }
  const trocarAgrupar = (a: AgrupamentoQ) => { if (a === st.agrupar) return; setSel(new Set()); setSt((s) => ({ ...s, agrupar: a, no: null, page: 1 })) }
  const trocarVisao = (v: string) => { setSel(new Set()); setSt((s) => ({ ...s, vis: v, page: 1 })) }

  const rows = dados?.rows ?? []
  const total = dados?.total ?? 0
  const totalBanco = dados?.totalBanco ?? 0
  const ids = [...sel]

  const linhas: QuestaoLinha[] = useMemo(() => rows.map((r) => ({
    id: r.id, codigo: r.codigo, enunciado: r.enunciado, tipo: r.tipo, formato: r.formato, nivel_dificuldade: r.nivel_dificuldade, status: r.status,
    disciplina: r.disciplina, assunto: r.assunto, assuntoDetalhe: r.assuntoDetalhe, banca: r.banca, orgao: r.orgao, ano: r.ano,
    cargo: r.cargo, nAlternativas: r.nAlternativas, versao: r.versao, anulada: r.anulada, atualizadoEm: r.atualizadoEm,
  })), [rows])

  // sugestões de classificação da página (só na fila): sinais reais calculados no servidor
  const idsPagina = useMemo(() => rows.map((r) => r.id).join(','), [rows])
  useEffect(() => {
    if (!fila || !idsPagina) { setSugestoes({}); return }
    let vivo = true
    void lerG<{ sugestoes: Record<string, SugestaoQ> }>({ s: 'sugestoes', ids: idsPagina }).then((j) => { if (vivo) setSugestoes(j.ok ? j.sugestoes ?? {} : {}) })
    return () => { vivo = false }
  }, [fila, idsPagina])

  const ordenar = (k: string) => setSt((s) => ({ ...s, sort: k, dir: s.sort === k ? (s.dir === 'asc' ? 'desc' : 'asc') : (k === 'atualizado' ? 'desc' : 'asc'), page: 1 }))
  const onSel = (id: string, v: boolean) => setSel((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n })
  const onSelPagina = (v: boolean) => setSel((s) => { const n = new Set(s); for (const r of rows) { if (v) n.add(r.id); else n.delete(r.id) } return n })

  // ── atalhos de teclado (ignorados ao digitar ou com diálogo/painel aberto) ──
  const totalPag = Math.max(1, Math.ceil(total / st.pp))
  const atalhosRef = useRef({ st, totalPag, painelId, sel, onSelPagina }); atalhosRef.current = { st, totalPag, painelId, sel, onSelPagina }
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      const digitando = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      const a = atalhosRef.current
      if (e.key === 'Escape') { if (!a.painelId && !digitando && a.sel.size) { setSel(new Set()) } return }
      if (digitando || document.querySelector('[role="dialog"]') || a.painelId) return
      if (e.key === '/') { const el = document.querySelector<HTMLInputElement>('[data-busca-questoes]'); if (el) { e.preventDefault(); el.focus(); el.select() } }
      else if (e.key === 'n' || e.key === 'N') { if (a.st.page < a.totalPag) setSt((s) => ({ ...s, page: s.page + 1 })) }
      else if (e.key === 'p' || e.key === 'P') { if (a.st.page > 1) setSt((s) => ({ ...s, page: s.page - 1 })) }
      else if (e.key === 'x' || e.key === 'X') { a.onSelPagina(true) }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [setSel])

  // ── ações em massa ──
  async function concluir(r: { ok: boolean; error?: string }, okMsg: string) {
    setEmLote(null)
    if (!r.ok) { toast.error(r.error || 'Não foi possível concluir.'); return false }
    toast.success(okMsg); setSel(new Set()); await recarregar(); return true
  }
  async function avisoDeUso(lista: string[]): Promise<string> {
    const u = await api<{ itens?: UsoQuestao[] }>('uso', { ids: lista })
    const n = u.ok ? (u.itens?.length ?? 0) : 0
    if (!n) return ''
    const resp = (u.itens ?? []).reduce((s, x) => s + x.respostas, 0)
    return `\n\nAtenção: ${n} ${n === 1 ? 'questão já está' : 'questões já estão'} em algum banco/simulado${resp ? ` e ${resp.toLocaleString('pt-BR')} resposta(s) de alunos` : ''}.`
  }
  async function mudarStatus(status: 'publicada' | 'rascunho' | 'arquivada') {
    if (!ids.length || emLote) return
    const n = ids.length, pl = n === 1 ? 'questão' : 'questões'
    const verbo = status === 'publicada' ? 'Publicar' : status === 'arquivada' ? 'Arquivar' : 'Voltar para rascunho'
    const efeito = status === 'publicada' ? 'Só questões publicadas aparecem para os alunos.' : 'Questões arquivadas ou em rascunho deixam de aparecer para os alunos (os simulados continuam com o histórico de respostas).'
    const aviso = status === 'publicada' ? '' : await avisoDeUso(ids)
    if (!(await confirmar({ titulo: `${verbo} ${n} ${pl}?`, mensagem: `${efeito}${aviso}`, confirmar: verbo.split(' ')[0] }))) return
    setEmLote(verbo)
    await concluir(await api('status', { ids, status }), `${n} ${pl} atualizada(s).`)
  }
  async function excluir() {
    if (!ids.length || emLote) return
    const n = ids.length
    const aviso = await avisoDeUso(ids)
    if (!(await confirmar({ titulo: `Excluir ${n} ${n === 1 ? 'questão' : 'questões'}?`, mensagem: `Vão para a Lixeira (reversível).${aviso}`, confirmar: 'Excluir', destrutivo: true }))) return
    setEmLote('Excluindo')
    await concluir(await api('excluir', { ids }), `${n} ${n === 1 ? 'questão enviada' : 'questões enviadas'} para a Lixeira.`)
  }
  async function aplicarSugestao(id: string, s: SugestaoQ) {
    const patch: PatchUI = {}
    if (s.disciplinaId) patch.disciplinaId = s.disciplinaId
    if (s.assuntoId) patch.assuntoId = s.assuntoId
    if (s.bancaId) patch.bancaId = s.bancaId
    if (s.orgaoId) patch.orgaoId = s.orgaoId
    if (s.ano != null) patch.ano = s.ano
    setAplicando(id)
    const r = await postG('classificar', { ids: [id], patch, soPreencher: true })
    setAplicando(null)
    if (!r.ok) { toast.error(r.error || 'Não foi possível aplicar a sugestão.'); return }
    toast.success(r.atualizadas ? 'Sugestão aplicada.' : 'Nada a preencher: os campos já estavam classificados.'); await recarregar()
  }

  const iconeNo = (n: NoPasta) => {
    const sty = n.cor ? { color: n.cor } : undefined
    if (n.id.startsWith('d:')) return <GraduationCap className="h-4 w-4 shrink-0" style={sty} />
    if (n.id.startsWith('a:')) return <BookOpen className="h-4 w-4 shrink-0" style={sty} />
    if (n.id.startsWith('sa:')) return <Inbox className="h-4 w-4 shrink-0" />
    if (st.agrupar === 'etiqueta') return <Tag className="h-4 w-4 shrink-0" style={sty} />
    return <Folder className="h-4 w-4 shrink-0" style={sty} />
  }

  const visoesMostradas = fila ? VISOES_Q.filter((v) => VISOES_FILA.includes(v.id)) : VISOES_Q
  const chips = (
    <div className="flex w-full flex-wrap items-center gap-1.5" role="group" aria-label="Visões rápidas">
      {!fila && (
        <button type="button" onClick={() => trocarVisao('')} aria-pressed={!st.vis}
          className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors', !st.vis ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
          Todas
        </button>
      )}
      {visoesMostradas.map((v) => {
        const n = contagens?.visoes?.[v.id]
        const ativo = st.vis === v.id
        return (
          <button key={v.id} type="button" onClick={() => trocarVisao(ativo && !fila ? '' : v.id)} aria-pressed={ativo} title={v.desc}
            className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors', ativo ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground', n === 0 && !ativo && 'opacity-50')}>
            {v.nome}{n !== undefined && <span className={cn('rounded-full px-1.5 text-[10px] font-semibold tabular-nums', ativo ? 'bg-primary/15' : 'bg-muted')}>{n.toLocaleString('pt-BR')}</span>}
          </button>
        )
      })}
    </div>
  )

  const filtros = (
    <>
      {chips}
      <select className={selectCls} aria-label="Filtrar por status" value={st.status} onChange={(e) => setSt((s) => ({ ...s, status: e.target.value, page: 1 }))}>
        <option value="">Status: todos</option><option value="publicada">Publicada</option><option value="rascunho">Rascunho</option><option value="arquivada">Arquivada</option>
      </select>
      <select className={selectCls} aria-label="Filtrar por dificuldade" value={st.dif} onChange={(e) => setSt((s) => ({ ...s, dif: e.target.value, page: 1 }))}>
        <option value="">Dificuldade: todas</option><option value="facil">Fácil</option><option value="medio">Médio</option><option value="dificil">Difícil</option>
      </select>
      <select className={selectCls} aria-label="Filtrar por tipo" value={st.tipo} onChange={(e) => setSt((s) => ({ ...s, tipo: e.target.value, page: 1 }))}>
        <option value="">Tipo: todos</option><option value="objetiva">Objetiva</option><option value="discursiva">Discursiva</option>
      </select>
      <select className={cn(selectCls, 'max-w-44')} aria-label="Filtrar por banca" value={st.banca} onChange={(e) => setSt((s) => ({ ...s, banca: e.target.value, page: 1 }))}>
        <option value="">Banca: todas</option>{(opcoes?.bancas ?? []).map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
      </select>
      <select className={cn(selectCls, 'max-w-44')} aria-label="Filtrar por órgão" value={st.orgao} onChange={(e) => setSt((s) => ({ ...s, orgao: e.target.value, page: 1 }))}>
        <option value="">Órgão: todos</option>{(opcoes?.orgaos ?? []).map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
      </select>
      <select className={selectCls} aria-label="Filtrar por ano" value={st.ano} onChange={(e) => setSt((s) => ({ ...s, ano: e.target.value, page: 1 }))}>
        <option value="">Ano: todos</option>{(opcoes?.anos ?? []).map((a) => <option key={a} value={String(a)}>{a}</option>)}
      </select>
      {temFiltro && <button type="button" onClick={limparFiltros} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" />Limpar busca e filtros</button>}
      {rotuloNo && !fila && <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{ag.nome.split(' ')[0]}: {rotuloNo}</span>}
    </>
  )

  const discNo = st.agrupar === 'disciplina' && st.no && /^(d|sa):/.test(st.no) ? st.no.split(':')[1] : ''
  const visaoAtual = VISOES_Q.find((v) => v.id === st.vis)
  const vazio = totalBanco === 0
    ? 'O banco ainda não tem questões. Use “Nova questão” para criar ou importar.'
    : st.vis && !temFiltroSemVis(st) && !st.no ? `Nenhuma questão em “${visaoAtual?.nome ?? 'esta visão'}” — nada pendente por aqui.`
    : temFiltro || st.no ? 'Nenhuma questão encontrada com esta seleção e estes filtros.' : 'Nenhuma questão.'

  const destinoIds = painelId
  const barraMassa = podeEditar && sel.size > 0 && createPortal(
    <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card px-3 py-2 shadow-xl" role="toolbar" aria-label="Ações em massa nas questões">
      <b className="mr-1 text-sm">{sel.size} {sel.size === 1 ? 'selecionada' : 'selecionadas'}</b>
      <Button size="sm" variant="outline" disabled={!!emLote} onClick={() => void mudarStatus('publicada')}><CheckCircle2 />Publicar</Button>
      <Button size="sm" variant="outline" disabled={!!emLote} onClick={() => void mudarStatus('arquivada')}><Archive />Arquivar</Button>
      <Button size="sm" variant="outline" disabled={!!emLote} onClick={() => void mudarStatus('rascunho')}>Voltar p/ rascunho</Button>
      <Button size="sm" variant="outline" disabled={!!emLote} onClick={() => setClassificar(true)}><FolderInput />Classificar…</Button>
      <Button size="sm" variant="outline" disabled={!!emLote} onClick={() => setEtiquetar(true)}><Tags />Etiquetas…</Button>
      {onUnificarSelecionadas && sel.size >= 2 && sel.size <= 12 && <Button size="sm" variant="outline" disabled={!!emLote} onClick={() => onUnificarSelecionadas(ids)}><Merge />Comparar / unificar</Button>}
      {podeExcluir && <Button size="sm" variant="destructive" disabled={!!emLote} onClick={() => void excluir()}><Trash2 />Excluir</Button>}
      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSel(new Set())}><X />Limpar seleção</Button>
      {emLote && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>, document.body,
  )

  return (
    <div className={cn('grid items-start gap-4', !fila && 'xl:grid-cols-[17rem_minmax(0,1fr)]')}>
      {barraMassa}

      {!fila && (
        <PastasPainel arvore={arvore} pasta={st.no} onPasta={(id) => { setSel(new Set()); setSt((s) => ({ ...s, no: id, page: 1 })) }} onPrefetch={(id) => prefetch({ ...st, no: id, page: 1 })}
          podeEditar={false} ocultarVazias={ocultarVazias} onOcultarVazias={setOcultarVazias} onMudou={() => {}} onAcessoPasta={() => {}} onCapaPasta={() => {}} carregando={carregando}
          totalGeral={totalBanco} iconeNo={iconeNo} dicaNo={(n) => `${n.nome} — ${n.total.toLocaleString('pt-BR')} ${n.total === 1 ? 'questão' : 'questões'}`}
          rotulos={{ titulo: 'Organização das questões', todas: 'Todas as questões', sem: ag.sem, ocultar: 'Ocultar itens sem questões', vazio: 'Nenhum item com questões.', aria: 'Árvore de organização das questões' }}
          cabecalho={(
            <div className="px-2 pb-2" onPointerEnter={prefetchAgrupamentos}>
              <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">Agrupar por
                <select className={cn(selectCls, 'w-full')} aria-label="Agrupar a árvore por" value={st.agrupar} onChange={(e) => trocarAgrupar(e.target.value as AgrupamentoQ)}>
                  {AGRUPAMENTOS_Q.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </label>
              {st.agrupar === 'etiqueta' && <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground">Uma questão pode ter várias etiquetas — a soma passa do total.</p>}
            </div>
          )} />
      )}

      <div className="min-w-0">
        {erro && <div className="mb-3 rounded-xl border p-4 text-center text-sm"><p className="mb-2 text-destructive">Não foi possível carregar ({erro}).</p><Button variant="outline" onClick={() => void carregar(st, { fresh: true })}>Tentar de novo</Button></div>}
        {dados?.degradado && <Nota>Consulta SQL indisponível: lista no modo reduzido (ordenação, busca e algumas visões limitadas). Verifique DATABASE_URL.</Nota>}
        <QuestoesTabelaBase
          questoes={linhas} titulo="Banco de questões" semCabecalho
          carregarDetalhe={async (id) => { try { const r = await fetch(`${URL_API}?detalhe=${id}`, { cache: 'no-store' }); return await r.json() } catch { return { ok: false } } }}
          acao={(
            <div className="flex items-center gap-2">
              {carregando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Carregando" />}
              <div ref={colRef} className="relative">
                <Button type="button" variant="outline" size="sm" onClick={() => setMenuCols((v) => !v)} aria-haspopup="true" aria-expanded={menuCols}><Columns3 />Colunas{ocultas.size > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{COLUNAS_SEL.length - ocultas.size}/{COLUNAS_SEL.length}</span>}</Button>
                {menuCols && (
                  <div className="absolute right-0 top-full z-30 mt-1.5 w-60 rounded-xl border bg-popover p-1.5 shadow-lg" role="menu">
                    <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Colunas da lista</p>
                    {COLUNAS_SEL.map((c) => {
                      const on = !ocultas.has(c.k)
                      return (
                        <button key={c.k} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => alternarColuna(c.k)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted">
                          <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>{on && <Check className="h-3 w-3" />}</span>{c.rot}
                        </button>
                      )
                    })}
                    <p className="px-2 pb-1 pt-1.5 text-[11px] text-muted-foreground">Código e enunciado sempre aparecem. A escolha fica salva neste navegador.</p>
                  </div>
                )}
              </div>
              {!fila && <ExportQuestoesButton filtros={{ q: st.q, status: st.status, disciplina: discNo, dificuldade: st.dif, tipo: st.tipo }} />}
              {podeEditar && <Button type="button" variant="outline" size="sm" disabled={!sel.size} onClick={() => setClassificar(true)} title={sel.size ? 'Classificar as questões selecionadas' : 'Selecione questões para classificar'}><FolderInput />Classificar{sel.size ? ` (${sel.size})` : ''}</Button>}
              {podeCriar && !fila && <NovaQuestaoDialog podeImportarPlataforma={podeImportarPlataforma} />}
            </div>
          )}
          servidor={{
            total, page: st.page, pp: st.pp, carregando,
            busca, onBusca: setBusca, placeholder: 'Buscar por enunciado, código (Q-XXXXXXXX) ou assunto específico   ( / )',
            sort: { key: st.sort, dir: st.dir }, onSort: ordenar, filtros, sel, onSel, onSelPagina, vazio,
            colunasOcultas: ocultas, onAbrir: setPainelId, onHoverAbrir: prefetchPainel, destaqueId: painelId,
            colunaExtra: fila ? {
              titulo: 'Sugestão', largura: 'w-72',
              render: (q) => {
                const s = sugestoes[q.id]
                if (!s) return <span className="text-muted-foreground">{Object.keys(sugestoes).length || !idsPagina ? 'Sem sinal confiável para sugerir.' : 'Calculando…'}</span>
                const partes = [s.disciplina && `${s.disciplina}${s.assunto ? ' › ' + s.assunto : ''}`, !s.disciplina && s.assunto && s.assunto, s.banca && `Banca ${s.banca}`, s.orgao && `Órgão ${s.orgao}`, s.ano != null && `Ano ${s.ano}`].filter(Boolean) as string[]
                return (
                  <div className="space-y-1">
                    {partes.map((p, i) => <div key={i} className="font-medium text-foreground">{p}</div>)}
                    <div className="text-[11px] text-muted-foreground">{s.fonte}</div>
                    {podeEditar && <Button size="xs" variant="outline" disabled={aplicando === q.id} onClick={() => void aplicarSugestao(q.id, s)}>{aplicando === q.id ? <Loader2 className="animate-spin" /> : <Wand2 />}Aplicar sugestão</Button>}
                  </div>
                )
              },
            } : undefined,
          }} />
        <PaginacaoBib total={total} page={st.page} pp={st.pp} opcoesPP={PP_Q} selecionados={sel.size} carregando={carregando} rotuloVazio="Nenhuma questão"
          onPage={(p) => setSt((s) => ({ ...s, page: p }))} onPP={(n) => setSt((s) => ({ ...s, pp: n, page: 1 }))} />
        <p className="mt-1 hidden items-center gap-1.5 text-[11px] text-muted-foreground xl:flex"><Keyboard className="h-3.5 w-3.5" aria-hidden />Atalhos: <kbd className="rounded border px-1">/</kbd> buscar · <kbd className="rounded border px-1">N</kbd>/<kbd className="rounded border px-1">P</kbd> próxima/anterior · <kbd className="rounded border px-1">X</kbd> selecionar a página · <kbd className="rounded border px-1">Esc</kbd> limpar seleção</p>
      </div>

      <QuestaoPainel id={destinoIds} opcoes={opcoes} podeEditar={podeEditar} onFechar={() => setPainelId(null)} onMudou={() => { void recarregar() }}
        onIrDuplicadas={(g) => { setPainelId(null); onIrDuplicadas?.(g) }} />

      {classificar && <ClassificarDialog n={ids.length} opcoes={opcoes} padraoSoPreencher={fila} onClose={() => setClassificar(false)}
        onConfirm={async (patch, soPreencher) => {
          setClassificar(false); setEmLote('Classificando')
          const r = await postG('classificar', { ids, patch, soPreencher })
          await concluir(r, soPreencher ? `${r.atualizadas ?? 0} de ${ids.length} questões receberam a classificação (campos já preenchidos foram mantidos).` : `${r.atualizadas ?? ids.length} ${(r.atualizadas ?? ids.length) === 1 ? 'questão classificada' : 'questões classificadas'}.`)
        }} />}
      {etiquetar && <EtiquetaDialog n={ids.length} opcoes={opcoes} onClose={() => setEtiquetar(false)}
        onConfirm={async (etiquetaId, modo) => { setEtiquetar(false); setEmLote('Etiquetando'); await concluir(await api('etiqueta', { ids, etiquetaId, modo }), modo === 'remover' ? 'Etiqueta removida.' : 'Etiqueta aplicada.') }} />}
    </div>
  )
}

function temFiltroSemVis(s: EstadoQ) { return !!(s.q || s.status || s.dif || s.tipo || s.banca || s.orgao || s.ano) }

function EtiquetaDialog({ n, opcoes, onClose, onConfirm }: { n: number; opcoes: OpcoesQ | null; onClose: () => void; onConfirm: (etiquetaId: string, modo: 'aplicar' | 'remover') => void }) {
  const [et, setEt] = useState('')
  const [modo, setModo] = useState<'aplicar' | 'remover'>('aplicar')
  const lista = opcoes?.etiquetas ?? []
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Etiquetas de {n} {n === 1 ? 'questão' : 'questões'}</DialogTitle>
          <DialogDescription>Aplica ou remove uma etiqueta das questões selecionadas. As etiquetas são criadas e gerenciadas em Questões › Etiquetas.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex gap-4 text-sm" role="radiogroup" aria-label="Ação">
            <label className="flex items-center gap-1.5"><input type="radio" name="modo-et" checked={modo === 'aplicar'} onChange={() => setModo('aplicar')} className="accent-[var(--primary)]" />Aplicar</label>
            <label className="flex items-center gap-1.5"><input type="radio" name="modo-et" checked={modo === 'remover'} onChange={() => setModo('remover')} className="accent-[var(--primary)]" />Remover</label>
          </div>
          <select className="h-9 rounded-lg border bg-background px-2 text-sm" value={et} onChange={(e) => setEt(e.target.value)} aria-label="Etiqueta">
            <option value="">{lista.length ? 'Escolha a etiqueta' : 'Nenhuma etiqueta cadastrada'}</option>{lista.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>
        <div className="-mx-4 -mb-4 mt-2 flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!et} onClick={() => onConfirm(et, modo)}>{modo === 'aplicar' ? 'Aplicar' : 'Remover'} em {n}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
