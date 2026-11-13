'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { AlertTriangle, ChevronRight, CircleDot, Eye, EyeOff, FolderInput, History, Settings2, Users2, Layers, Loader2, Merge, Plus, Search, SquarePen, Tags, Trash2, X } from 'lucide-react'
import { LoteDialog, type InicialLote } from '@/components/biblioteca/lote-dialogs'
import { RegistrarAtualizacaoLote } from '@/components/biblioteca/registrar-atualizacao-lote'
import type { AlvoLote, AcaoLote, ResultadoLote } from '@/app/admin/biblioteca/lote-actions-tipos'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { RevisaoHead } from '@/components/admin/revisao/ui'
import { KpiGrade, Nota } from '@/components/admin/revisao/pedagogico-ui'
import { BarraMetadados, useColunasLista, type FiltrosMeta } from '@/components/biblioteca/metadados-toolbar'
import { CapaPaginaDialog } from '@/components/biblioteca/capa-pagina-dialog'
import { DocumentoAcesso } from '@/components/admin/documento-acesso'
import { BibliotecaDocSidebar } from '@/components/admin/biblioteca-doc-sidebar'
import { DriveNovoButton, DriveNovoStyles, DriveUploadPanel } from '@/components/admin/drive-novo'
import { DriveAcessoStyles } from '@/components/admin/drive-acesso'
import { DrivePastaStyles } from '@/components/admin/pasta-card-drive'
import { DriveAcessoWrapper, MoverConteudoDialog, Overlay } from '@/components/biblioteca/menus-drive'
import { useImportarArquivos } from '@/components/biblioteca/use-importar-arquivos'
import { NovoSimuladoDialog } from '@/components/admin/novo-simulado-dialog'
import { CAMPOS_META } from '@/lib/conteudo/metadados'
import type { AlvoCP } from '@/app/admin/biblioteca/capa-actions-tipos'
import { arquivarConteudo, definirVisibilidadeConteudo, salvarLeituraLegproc } from '@/app/admin/biblioteca/gestao-actions'
import { abrirEdicaoDocx, criarConteudoQuestoes, criarDocumentoBranco, criarPasta, definirCorPasta, moverDocumento, publicarDocumento, removerDocumento, urlDownloadDocumento } from '@/app/admin/biblioteca/actions'
import { TIPOS_BIB, ehTipoBib, type ArvoreBib, type EstadoBib, type LinhaMaterial, type OpcoesFiltroBib, type RespostaBib, type TipoBib } from '@/lib/admin-revisao/biblioteca-tipos'
import { ESTADO_Q_PADRAO, SUBABAS_Q, type EstadoQ, type RespostaQ, type SubAbaQ } from '@/lib/admin-revisao/biblioteca-questoes-tipos'
import { MateriaisTabela } from './materiais-tabela'
import { PastasPainel, RAIZ } from './pastas-painel'
import { PaginacaoBib } from './paginacao-bib'
import { QuestoesBanco, prefetchQuestoesBanco } from './questoes-banco'
import { QuestoesUnificar } from './questoes-unificar'
import { UnificarDisciplinas } from './unificar-disciplinas'
import { QuestoesClassificacao } from './questoes-classificacao'
import { QuestoesEtiquetas } from './questoes-etiquetas'
import type { InicialQuestoesUnificar } from './questoes-unificar'
import type { ListaEtiquetas } from '@/lib/admin-revisao/questoes-etiquetas-tipos'
import type { InicialDisciplinas } from '@/lib/admin-revisao/biblioteca-pastas-unificar-tipos'
import type { InicialClassificacao } from '@/lib/admin-revisao/questoes-classificacao-tipos'
import type { ResumoClassif } from '@/lib/admin-revisao/biblioteca-questoes-gestao-tipos'

/** Dados lidos no servidor (page.tsx) da sub-área ativa — valem só para a 1ª montagem; depois a API atende as interações. */
export interface SsrQuestoes { unificar?: InicialQuestoesUnificar | null; etiquetas?: ListaEtiquetas | null; disciplinas?: InicialDisciplinas | null; classificacao?: InicialClassificacao | null }

const PP = [10, 14, 25, 50, 100]
const SEM_FILTRO: Pick<EstadoBib, 'q' | 'vis' | 'status' | 'acesso' | 'meta'> = { q: '', vis: 'todos', status: '', acesso: '', meta: {} }

// Cache de páginas (60 s) + pré-carga da PRÓXIMA página: clicar numa aba/pasta/página já visitada é instantâneo (<300 ms).
const CACHE = new Map<string, { t: number; v: RespostaBib }>()
const chave = (s: EstadoBib) => JSON.stringify([s.aba, s.q, s.pasta, s.sub, s.vis, s.status, s.acesso, s.sort, s.dir, s.page, s.pp, s.meta])
const lerCache = (s: EstadoBib) => { const e = CACHE.get(chave(s)); return e && Date.now() - e.t < 60_000 ? e.v : undefined }
function paramsDe(s: EstadoBib, extra: Record<string, string> = {}) {
  const p = new URLSearchParams({ aba: s.aba, page: String(s.page), pp: String(s.pp), sort: s.sort, dir: s.dir, ...extra })
  if (s.q) p.set('q', s.q); if (s.pasta) p.set('pasta', s.pasta); if (!s.sub) p.set('sub', '0')
  if (s.vis !== 'todos') p.set('vis', s.vis); if (s.status) p.set('status', s.status); if (s.acesso) p.set('acesso', s.acesso)
  for (const [k, v] of Object.entries(s.meta)) if (v) p.set(`m_${k}`, v)
  return p
}
const EM_VOO = new Map<string, Promise<RespostaBib>>()
function buscar(s: EstadoBib, extra: Record<string, string> = {}): Promise<RespostaBib> {
  const url = `/api/admin/revisao/biblioteca?${paramsDe(s, extra)}`
  const voo = EM_VOO.get(url); if (voo) return voo // mesma URL já a caminho (ex.: prefetch da página 2 chamado 2×) → reaproveita
  const p = buscarReal(s, url).finally(() => EM_VOO.delete(url))
  EM_VOO.set(url, p)
  return p
}
async function buscarReal(s: EstadoBib, url: string): Promise<RespostaBib> {
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const j = (await r.json()) as RespostaBib
  CACHE.set(chave(s), { t: Date.now(), v: j })
  return j
}

/** Biblioteca (Pedagógico): pastas e subpastas à esquerda, tabela com seleção + ações em massa e as colunas do legado. Client-driven por
 *  rota de API (/api/admin/revisao/biblioteca): aba/pasta/busca/filtro/ordem/página respondem sem navegação completa. */
export function BibliotecaApp({ inicial, estadoInicial, arvoreInicial, opcoesInicial, podeEditar, podeCriarSimulado, subQInicial, inicialQ, estadoQInicial, qPerm, unificarInicial = false, contagensInicialQ = null, ssr }: {
  inicial: RespostaBib; estadoInicial: EstadoBib; arvoreInicial: ArvoreBib | null; opcoesInicial: OpcoesFiltroBib; podeEditar: boolean; podeCriarSimulado: boolean
  /** Aba Questões: sub-aba inicial (banco | unificar | classificacao | etiquetas), 1º quadro do banco (SSR) e permissões. */
  subQInicial: SubAbaQ; inicialQ: RespostaQ | null; estadoQInicial: EstadoQ
  qPerm: { ver: boolean; editar: boolean; excluir: boolean; criar: boolean; importarPlataforma: boolean; taxonomia: boolean }
  /** ?modo=unificar-disciplinas: abre direto a visão Unificar disciplinas das abas de conteúdo. */
  unificarInicial?: boolean
  /** resumo das visões do Banco (SSR) e dados SSR da sub-área ativa */
  contagensInicialQ?: ResumoClassif | null
  ssr?: SsrQuestoes
}) {
  const [st, setSt] = useState<EstadoBib>(estadoInicial)
  const [dados, setDados] = useState<RespostaBib>(inicial)
  const [arvores, setArvores] = useState<Partial<Record<TipoBib, { arvore: ArvoreBib; opcoes: OpcoesFiltroBib }>>>(arvoreInicial ? { [estadoInicial.aba]: { arvore: arvoreInicial, opcoes: opcoesInicial } } : {})
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState(estadoInicial.q)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [ocultarVazias, setOcultarVazias] = useState(false)
  const [colunas, setColunas] = useColunasLista()
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const [acessoDoc, setAcessoDoc] = useState<LinhaMaterial | null>(null)
  const [acessoPasta, setAcessoPasta] = useState<{ id: string; nome: string } | null>(null)
  const [capa, setCapa] = useState<AlvoCP | null>(null)
  const [moverLote, setMoverLote] = useState(false)
  const [metaLote, setMetaLote] = useState(false)
  const [emLote, setEmLote] = useState<string | null>(null)
  // Ações em lote unificadas (mesmo LoteDialog/lote-actions da Biblioteca do Drive): status, acesso, configurar, registrar atualização
  const [loteDlg, setLoteDlg] = useState<{ titulo: string; alvo: AlvoLote; secoes: AcaoLote['tipo'][]; config?: boolean; inicial?: InicialLote } | null>(null)
  const [regAtualizacao, setRegAtualizacao] = useState<AlvoLote | null>(null)
  const ancora = useRef<string | null>(null)
  const [subQ, setSubQ] = useState<SubAbaQ>(subQInicial)
  const [totalBancoQ, setTotalBancoQ] = useState<number | null>(inicial.resumo.bancoQuestoes ?? null)
  // Banco: estado inicial reaplicável (links vindos de Etiquetas/Classificação/Unificar) + seleção que atravessa as sub-abas
  const [estadoBanco, setEstadoBanco] = useState<EstadoQ>(estadoQInicial)
  const [bancoKey, setBancoKey] = useState(0)
  const [selQ, setSelQ] = useState<Set<string>>(new Set())
  const [unificar, setUnificar] = useState(unificarInicial)
  const seq = useRef(0)
  const primeira = useRef(true)
  const ssrOk = useRef(true) // o SSR só vale para a 1ª montagem da sub-área inicial
  useEffect(() => { if (subQ !== subQInicial || st.aba !== estadoInicial.aba || unificar !== unificarInicial) ssrOk.current = false }, [subQ, st.aba, unificar]) // eslint-disable-line react-hooks/exhaustive-deps
  const ssrQ = ssrOk.current && subQ === subQInicial && st.aba === estadoInicial.aba ? ssr : undefined

  const categoria: 'conteudo' | 'jurisclub' = st.aba === 'jurisclub' ? 'jurisclub' : 'conteudo'
  const ehDoc = !['flashcards', 'simulados'].includes(st.aba)
  const ehQ = st.aba === 'questoes'
  const docsVisiveis = ehDoc && !ehQ
  const modoUnificar = unificar && docsVisiveis
  const tipoAtual = TIPOS_BIB.find((t) => t.id === st.aba)!
  // A árvore (pastas + contagens) é igual em todas as abas da mesma categoria → ao trocar de aba reaproveita a já carregada (sem piscar/recolher).
  const arv = arvores[st.aba] ?? (st.aba === 'jurisclub' ? undefined : (Object.entries(arvores).find(([k, v]) => k !== 'jurisclub' && v)?.[1] as typeof arvores[TipoBib] | undefined))
  const pastaReal = st.pasta && st.pasta !== RAIZ ? st.pasta : null

  const aplicar = useCallback((j: RespostaBib, s: EstadoBib) => {
    setDados(j)
    if (j.arvore) setArvores((a) => ({ ...a, [s.aba]: { arvore: j.arvore!, opcoes: j.opcoes ?? {} } }))
  }, [])
  const carregar = useCallback(async (s: EstadoBib, opts: { fresh?: boolean } = {}) => {
    if (s.aba === 'questoes') { setCarregando(false); return } // a aba Questões (banco e gestão) carrega por conta própria
    const mine = ++seq.current
    setErro(null)
    const precisaArvore = opts.fresh || (!['flashcards', 'simulados'].includes(s.aba) && !arvoresRef.current[s.aba])
    const extra: Record<string, string> = {}
    if (opts.fresh) extra.fresh = '1'
    if (precisaArvore) extra.tree = '1'
    if (!opts.fresh) { const hit = lerCache(s); if (hit && !precisaArvore) { aplicar(hit, s); setCarregando(false); return } }
    setCarregando(true)
    try {
      const j = await buscar(s, extra)
      if (mine !== seq.current) return
      aplicar(j, s)
      if (s.page * s.pp < j.total) void buscar({ ...s, page: s.page + 1 }).catch(() => {})
    } catch (e: any) { if (mine === seq.current) setErro(e?.message ?? 'Falha ao carregar.') }
    finally { if (mine === seq.current) setCarregando(false) }
  }, [aplicar])
  const arvoresRef = useRef(arvores); arvoresRef.current = arvores

  useEffect(() => { if (primeira.current) { primeira.current = false; return } void carregar(st) }, [st, carregar])
  useEffect(() => { if (busca === st.q) return; const t = setTimeout(() => setSt((s) => ({ ...s, q: busca.trim(), page: 1 })), 300); return () => clearTimeout(t) }, [busca, st.q])
  // URL compartilhável
  useEffect(() => {
    if (st.aba === 'questoes' && subQ === 'banco') return // a URL do banco é mantida pelo próprio QuestoesBanco
    if (unificar && st.aba !== 'questoes') { const u = new URLSearchParams(); if (st.aba !== 'pdfull') u.set('aba', st.aba); u.set('modo', 'unificar-disciplinas'); window.history.replaceState(null, '', `${window.location.pathname}?${u}`); return }
    const p = new URLSearchParams(); if (st.aba !== 'pdfull') p.set('aba', st.aba)
    if (st.aba === 'questoes') { p.set('aba', 'questoes'); p.set('modo', subQ); window.history.replaceState(null, '', `${window.location.pathname}?${p}`); return }
    if (st.q) p.set('q', st.q); if (st.pasta) p.set('pasta', st.pasta); if (!st.sub) p.set('sub', '0'); if (st.vis !== 'todos') p.set('vis', st.vis)
    if (st.status) p.set('status', st.status); if (st.acesso) p.set('acesso', st.acesso)
    if (st.sort !== 'titulo' || st.dir !== 'asc') { p.set('sort', st.sort); p.set('dir', st.dir) } if (st.page > 1) p.set('page', String(st.page)); if (st.pp !== 14) p.set('pp', String(st.pp))
    for (const [k, v] of Object.entries(st.meta)) if (v) p.set(`m_${k}`, v)
    window.history.replaceState(null, '', `${window.location.pathname}${p.toString() ? `?${p}` : ''}`)
  }, [st, subQ, unificar])

  /** Pré-carrega (hover) a 1ª página de uma aba/pasta — o clique seguinte responde do cache. */
  const prefetch = useCallback((s: EstadoBib) => { if (!lerCache(s) && !(s.aba !== st.aba && !arvoresRef.current[s.aba])) void buscar(s).catch(() => {}) }, [st.aba])
  const recarregar = useCallback(() => { CACHE.clear(); return carregar(st, { fresh: true }) }, [carregar, st])
  // Clicar numa subpasta de OUTRO tipo (ex.: "PDFull" estando na aba PDFlash) leva para a aba desse tipo, já dentro daquela pasta.
  const abrirPasta = (id: string | null) => {
    const tipo = id && id !== RAIZ ? arv?.arvore?.nos.find((n) => n.id === id)?.tipoMaterial : null
    if (tipo && ehTipoBib(tipo) && tipo !== st.aba && tipo !== 'simulados' && tipo !== 'flashcards') { setBusca(''); setSel(new Set()); setSt((s) => ({ ...s, ...SEM_FILTRO, aba: tipo, pasta: id, page: 1, sort: 'titulo', dir: 'asc' })); return }
    setSt((s) => ({ ...s, pasta: id, page: 1 }))
  }
  const mudarAba = (aba: TipoBib) => { if (aba === st.aba) return; setUnificar(false); setBusca(''); setSel(new Set()); setSt({ ...st, ...SEM_FILTRO, aba, pasta: null, page: 1, sort: 'titulo', dir: 'asc' }) }
  // Abre o Banco já filtrado (links das outras sub-abas: "ver estas questões no Banco")
  const irUnificarSelecionadas = useCallback((_ids: string[]) => { setSubQ('unificar') }, [])
  const ordenar = (k: string) => setSt((s) => ({ ...s, sort: k, dir: s.sort === k && s.dir === 'asc' ? 'desc' : 'asc', page: 1 }))
  const filtros: FiltrosMeta = st.meta
  const nFiltrosExtra = (st.vis !== 'todos' ? 1 : 0) + (st.status ? 1 : 0) + (st.acesso ? 1 : 0)
  const limparTudo = () => { setBusca(''); setSt((s) => ({ ...s, ...SEM_FILTRO, page: 1 })) }
  const temFiltro = !!st.q || nFiltrosExtra > 0 || Object.values(st.meta).some(Boolean)

  // ── seleção ──
  const onSel = (id: string, v: boolean) => setSel((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n })
  const onToggle = (id: string, shift: boolean) => {
    const ordem = dados.rows.map((r) => r.id); const a = ancora.current
    setSel((prev) => {
      const n = new Set(prev)
      if (shift && a && a !== id) {
        const i = ordem.indexOf(a), j = ordem.indexOf(id)
        if (i >= 0 && j >= 0) { const marcar = !prev.has(id); for (let k = Math.min(i, j); k <= Math.max(i, j); k++) { if (marcar) n.add(ordem[k]); else n.delete(ordem[k]) } return n }
      }
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
    ancora.current = id
  }
  const alvoSel = (): AlvoLote => ({ docIds: [...sel], pastaIds: [], incluirSubpastas: false, categoria })
  const abrirLote = (titulo: string, secoes: AcaoLote['tipo'][], extra?: { config?: boolean; inicial?: InicialLote }) => setLoteDlg({ titulo, alvo: alvoSel(), secoes, ...extra })
  const configurarPasta = (id: string, nome: string) => setLoteDlg({ titulo: `Configurar pasta “${nome}”`, alvo: { docIds: [], pastaIds: [id], incluirSubpastas: true, categoria }, secoes: ['categoria', 'status', 'acesso', 'visibilidade', 'legenda'], config: true })
  function loteConcluido(r: ResultadoLote) {
    setLoteDlg(null)
    const falhos = r.itens.filter((i) => !i.ok).map((i) => i.id)
    setSel(new Set(falhos)); void recarregar()
  }
  useEffect(() => {
    if (sel.size === 0) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loteDlg && !regAtualizacao && !moverLote && !metaLote) setSel(new Set()) }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [sel.size, loteDlg, regAtualizacao, moverLote, metaLote])
  const onSelPagina = (v: boolean) => setSel((s) => { const n = new Set(s); for (const r of dados.rows) { if (v) n.add(r.id); else n.delete(r.id) } return n })

  // ── ações em massa (REUSAM as actions do legado; 5 em paralelo) ──
  async function lote(rotulo: string, ids: string[], fn: (id: string) => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    if (!ids.length || emLote) return
    setEmLote(rotulo)
    const tid = toast.loading(`${rotulo}… 0/${ids.length}`)
    let feitos = 0; const falhas: string[] = []; let motivo = ''
    const fila = [...ids]
    await Promise.all(Array.from({ length: Math.min(5, fila.length) }, async () => {
      while (fila.length) {
        const id = fila.shift()!
        try { const r = await fn(id); if (!r.ok) { falhas.push(id); motivo = motivo || (r.error ?? '') } } catch (e: any) { falhas.push(id); motivo = motivo || (e?.message ?? '') }
        feitos++; toast.loading(`${rotulo}… ${feitos}/${ids.length}`, { id: tid })
      }
    }))
    toast.dismiss(tid)
    if (falhas.length) toast.error(`${ids.length - falhas.length} de ${ids.length} concluídos. ${falhas.length} falharam${motivo ? `: ${motivo}` : '.'}`)
    else toast.success(`${okMsg} (${ids.length}).`)
    setSel(new Set(falhas))
    setEmLote(null)
    await recarregar()
  }
  const ids = [...sel]
  async function excluirLote() {
    if (!(await confirmar({ titulo: `Excluir ${ids.length} ${ids.length === 1 ? 'material' : 'materiais'}`, mensagem: 'Os documentos vão para a Lixeira (30 dias). Materiais ligados às aulas não são apagados.', confirmar: 'Excluir', destrutivo: true }))) return
    await lote('Excluindo', ids, removerDocumento, 'Enviados para a Lixeira')
  }
  async function arquivarLote() {
    if (!(await confirmar({ titulo: `Arquivar ${ids.length} ${ids.length === 1 ? 'material' : 'materiais'}`, mensagem: 'O status vira “Arquivado”. Os documentos continuam na Biblioteca.', confirmar: 'Arquivar' }))) return
    await lote('Arquivando', ids, arquivarConteudo, 'Arquivados')
  }

  // ── criação (Novo) ──
  const imp = useImportarArquivos({ pastaId: pastaReal, categoria, onConcluido: () => { void recarregar() } })
  async function novoBranco() {
    const titulo = await pedirTexto({ titulo: 'Documento em branco', placeholder: 'Título do documento', confirmar: 'Criar' })
    if (!titulo) return
    const r = await criarDocumentoBranco({ titulo, pastaId: pastaReal, categoria }); if (!r.ok) return toast.error(r.error || 'Falha ao criar.')
    toast.success('Documento em branco criado.'); void recarregar()
  }
  async function novoQuestoes() {
    const titulo = await pedirTexto({ titulo: 'Novo conjunto de questões', placeholder: 'Título do conjunto', confirmar: 'Criar' })
    if (!titulo) return
    const r = await criarConteudoQuestoes({ titulo, pastaId: pastaReal, categoria }); if (!r.ok) return toast.error(r.error || 'Falha ao criar.')
    toast.success('Conjunto de questões criado.'); void recarregar()
  }

  const resumo = dados.resumo
  // Aba Questões = total REAL do banco (simulado_questoes); os conjuntos-documento têm contador próprio na sub-aba.
  const contagemAba = (t: TipoBib) => (t === 'questoes' ? (totalBancoQ ?? resumo.bancoQuestoes ?? resumo.porTipo.questoes) : resumo.porTipo[t])
  const pastasMover = useMemo(() => (arv?.arvore.nos ?? []).map((n) => ({ id: n.id, nome: n.nome, pai_id: n.paiId })), [arv])
  const nomePasta = pastaReal ? arv?.arvore.nos.find((n) => n.id === pastaReal)?.nome : st.pasta === RAIZ ? 'Sem pasta' : null

  // "Novo" (Drive) das abas de documentos: fica na barra de ferramentas, à direita de "Importar planilha".
  const novoDoc = podeEditar && ehDoc ? (
    <DriveNovoButton rotuloBranco="Documento em branco"
      onNovaPasta={async (nome, cor) => { const r = await criarPasta(nome, pastaReal, categoria); if (!r.ok) return toast.error(r.error || 'Falha ao criar a pasta.'); if (cor && r.id) await definirCorPasta(r.id, cor); toast.success('Pasta criada.'); void recarregar() }}
      onUploadArquivos={(f) => void imp.importarArquivos(f, false)} onUploadPasta={(f) => void imp.importarArquivos(f, true)}
      onDocumentoBranco={novoBranco} onNovoQuestoes={categoria === 'jurisclub' ? undefined : novoQuestoes} onToast={(m) => toast.message(m)} />
  ) : undefined
  const acoesTopo = !podeEditar || ehDoc ? undefined : st.aba === 'simulados' ? (
    podeCriarSimulado ? <NovoSimuladoDialog origem="aplicacao" trigger={<Button type="button"><Plus />Novo simulado</Button>} /> : undefined
  ) : (
    <Link href="/admin/conteudos/flashcards" className={buttonVariants()}><Plus />Novo baralho</Link>
  )

  const selectCls = 'h-9 rounded-lg border bg-card px-2.5 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40'

  return (
    <div className="w-full">
      <DrivePastaStyles /><DriveNovoStyles /><DriveAcessoStyles />
      <RevisaoHead secao="Pedagógico" titulo="Biblioteca"
        subtitulo="Os materiais de leitura e estudo num só lugar: PDFs, LegProc, flashcards, links de questões, simulados e JurisClub. As videoaulas ficam na Videoteca. Ao trocar um arquivo, a versão anterior fica no histórico e os grifos e anotações dos alunos continuam."
        acoes={acoesTopo} />

      <KpiGrade itens={[
        { valor: resumo.total, rotulo: 'materiais na biblioteca' }, { valor: resumo.pdfs, rotulo: 'PDFs (PDFull, PDFlash e PDFight)' },
        { valor: resumo.escondidos, rotulo: 'escondidos dos alunos' }, { valor: resumo.reportesAbertos, rotulo: 'problemas reportados pelos alunos', alerta: true },
      ]} />
      {resumo.reportesAbertos > 0 && (
        <Nota destaque icone={<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />}>
          {resumo.reportesAbertos} problemas reportados pelos alunos em materiais.{' '}
          <Link href="/admin/atendimento?tab=demandas" className="font-medium text-primary underline underline-offset-2">Ver o que foi apontado</Link>
        </Nota>
      )}
      {!resumo.temOculto && <Nota destaque>Aplique a migration 20261026000000 (acesso v2) para controlar a visibilidade dos materiais.</Nota>}
      {dados.degradado && <Nota>Consulta SQL indisponível: lista no modo reduzido (sem ordenação por coluna, filtros de pasta e de metadados). Verifique DATABASE_URL.</Nota>}

      <div className="mb-4 flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="Tipo de material">
        {TIPOS_BIB.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={st.aba === t.id} onClick={() => mudarAba(t.id)} onPointerEnter={() => (t.id === 'questoes' ? prefetchQuestoesBanco() : prefetch({ ...st, ...SEM_FILTRO, aba: t.id, pasta: null, page: 1, sort: 'titulo', dir: 'asc' }))}
            className={cn('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors', st.aba === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t.nome}{contagemAba(t.id) > 0 && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">{contagemAba(t.id).toLocaleString('pt-BR')}</span>}
          </button>
        ))}
      </div>

      {st.aba === 'questoes' && (
        <div className="mb-3 flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="Conteúdo da aba Questões">
          {SUBABAS_Q.map((a) => {
            const n = a.id === 'banco' ? contagemAba('questoes') : 0
            return (
              <button key={a.id} type="button" role="tab" aria-selected={subQ === a.id} onClick={() => setSubQ(a.id)} onPointerEnter={() => { if (a.id === 'banco') prefetchQuestoesBanco() }}
                className={cn('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors', subQ === a.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {a.nome}{n > 0 && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">{n.toLocaleString('pt-BR')}</span>}
              </button>
            )
          })}
        </div>
      )}

      {docsVisiveis && !modoUnificar && <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por aula, disciplina, lei, assunto, tribunal ou título" aria-label="Buscar material" autoComplete="off"
          className="h-11 w-full rounded-xl border bg-card pl-10 pr-10 text-[13.5px] outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20" />
        {carregando && <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Carregando" />}
      </div>}

      {/* Explicação da aba: recolhida por padrão (não ocupa espaço); abre pelo "Como funciona". */}
      <details className="group mb-3 text-[0.84rem] text-muted-foreground">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />Como funciona esta aba
        </summary>
        <p className="mt-1.5 max-w-[78ch]">
          {ehQ ? (subQ === 'banco' ? 'O banco real de questões: filtre por visões rápidas, taxonomia e busca, abra uma questão no painel lateral e use as ações em massa.' : subQ === 'unificar' ? 'Junta o que está repetido: questões duplicadas (revisão lado a lado, com prévia do impacto) e termos repetidos da taxonomia (bancas, órgãos, cargos, disciplinas…).' : subQ === 'classificacao' ? 'Acompanha a qualidade da classificação (disciplina, assunto, banca, órgão, ano…), mostra a fila do que falta, sugere e aplica em massa, e organiza o cadastro da taxonomia.' : 'Gerencia as etiquetas das questões: criar, renomear, cor, função, mesclar, excluir com aviso de uso e aplicar/remover em massa a partir da seleção do Banco.')
            : <>{tipoAtual.desc}{st.aba === 'pdfull' ? ' Excluir um PDFull envia o documento para a Lixeira; os materiais ligados à aula continuam.' : ''}{ehDoc && ' Desligue “Visível ao aluno” para esconder sem excluir.'}</>}
        </p>
      </details>

      {docsVisiveis && !modoUnificar && (
        <div className="mb-3 space-y-2">
          <BarraMetadados docIds={[]} metadados={{}} colunas={colunas} onColunas={setColunas} filtros={filtros}
            onFiltros={(f) => setSt((s) => ({ ...s, meta: Object.fromEntries(Object.entries(f).filter(([, v]) => !!v)) as Record<string, string>, page: 1 }))}
            pastaId={pastaReal} categoria={categoria} opcoesFiltro={arv?.opcoes ?? {}} acaoFinal={novoDoc}
            escopoRotulo={pastaReal ? `a pasta “${nomePasta ?? ''}” (e subpastas)` : categoria === 'jurisclub' ? 'todo o JurisClub' : 'toda a biblioteca'} onImportado={() => void recarregar()} />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select className={selectCls} aria-label="Filtrar por status" value={st.status} onChange={(e) => setSt((s) => ({ ...s, status: e.target.value, page: 1 }))}>
              <option value="">Status: todos</option><option value="publicado">Publicado</option><option value="rascunho">Rascunho</option><option value="arquivado">Arquivado</option>
            </select>
            <select className={selectCls} aria-label="Filtrar por visibilidade" value={st.vis} disabled={!resumo.temOculto} onChange={(e) => setSt((s) => ({ ...s, vis: e.target.value as EstadoBib['vis'], page: 1 }))}>
              <option value="todos">Visibilidade: todas</option><option value="visiveis">Visíveis ao aluno</option><option value="escondidos">Só escondidos</option>
            </select>
            <select className={selectCls} aria-label="Filtrar por acesso" value={st.acesso} onChange={(e) => setSt((s) => ({ ...s, acesso: e.target.value as EstadoBib['acesso'], page: 1 }))}>
              <option value="">Acesso: todos</option><option value="restrito">Só restritos</option><option value="todos">Liberados a todos</option>
            </select>
            <label className="flex cursor-pointer items-center gap-1.5 text-muted-foreground" title="Mostra também os documentos das subpastas da pasta escolhida">
              <input type="checkbox" checked={st.sub} onChange={(e) => setSt((s) => ({ ...s, sub: e.target.checked, page: 1 }))} className="h-3.5 w-3.5 accent-[var(--primary)]" />Incluir subpastas
            </label>
            {temFiltro && <button type="button" onClick={limparTudo} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" />Limpar busca e filtros</button>}
            {(nomePasta) && <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">Pasta: {nomePasta}</span>}
          </div>
        </div>
      )}

      {podeEditar && sel.size > 0 && !loteDlg && !regAtualizacao && createPortal(
        <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card px-3 py-2 shadow-xl" role="toolbar" aria-label="Ações em massa">
          <b className="mr-1 text-sm">{sel.size} {sel.size === 1 ? 'selecionado' : 'selecionados'}</b>
          <Button size="sm" variant="outline" disabled={!!emLote || !resumo.temOculto} onClick={() => void lote('Mostrando ao aluno', ids, (id) => definirVisibilidadeConteudo(id, true), 'Visíveis ao aluno')}><Eye />Mostrar ao aluno</Button>
          <Button size="sm" variant="outline" disabled={!!emLote || !resumo.temOculto} onClick={() => void lote('Escondendo do aluno', ids, (id) => definirVisibilidadeConteudo(id, false), 'Escondidos do aluno')}><EyeOff />Ocultar do aluno</Button>
          <Button size="sm" variant="outline" disabled={!!emLote} onClick={() => setMoverLote(true)}><FolderInput />Mover para…</Button>
          <Button size="sm" variant="outline" disabled={!!emLote} onClick={() => setMetaLote(true)}><Tags />Editar metadados</Button>
          <Button size="sm" variant="outline" disabled={!!emLote} onClick={() => void lote('Publicando', ids, (id) => publicarDocumento(id), 'Publicados')}><SquarePen />Publicar</Button>
          <Button size="sm" variant="outline" disabled={!!emLote} onClick={() => void lote('Marcando como LegProc', ids, (id) => salvarLeituraLegproc(id, true), 'Marcados como LegProc')}><Layers />Leitura LegProc</Button>
          <Button size="sm" variant="outline" disabled={!!emLote} onClick={() => abrirLote('Alterar status', ['status'])}><CircleDot />Status</Button>
          <Button size="sm" variant="outline" disabled={!!emLote} onClick={() => abrirLote('Configurar acesso', ['acesso'])}><Users2 />Acesso</Button>
          <Button size="sm" variant="outline" disabled={!!emLote} onClick={() => setRegAtualizacao(alvoSel())}><History />Registrar atualização</Button>
          <Button size="sm" variant="outline" disabled={!!emLote} onClick={() => abrirLote('Configurar em lote', ['categoria', 'status', 'acesso', 'visibilidade', 'legenda'], { config: true })}><Settings2 />Configurar em lote…</Button>
          <Button size="sm" variant="outline" disabled={!!emLote} onClick={() => void arquivarLote()}>Arquivar</Button>
          <Button size="sm" variant="destructive" disabled={!!emLote} onClick={() => void excluirLote()}><Trash2 />Excluir</Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSel(new Set())}><X />Limpar seleção</Button>
          {emLote && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>, document.body,
      )}

      {ehQ ? (qPerm.ver ? (
        subQ === 'banco' ? (
          <QuestoesBanco key={bancoKey} inicial={bancoKey === 0 ? inicialQ : null} estadoInicial={estadoBanco} podeEditar={qPerm.editar} podeExcluir={qPerm.excluir} podeCriar={qPerm.criar}
            podeImportarPlataforma={qPerm.importarPlataforma} onTotalBanco={setTotalBancoQ} sel={selQ} setSel={setSelQ} onUnificarSelecionadas={irUnificarSelecionadas}
            onIrDuplicadas={irUnificarSelecionadas} contagensInicial={bancoKey === 0 && ssrOk.current ? contagensInicialQ : null} />
        ) : subQ === 'unificar' ? (
          <QuestoesUnificar podeEditar={qPerm.editar} inicial={ssrQ?.unificar} />
        ) : subQ === 'classificacao' ? (
          <QuestoesClassificacao podeEditar={qPerm.editar} inicial={ssrQ?.classificacao ?? undefined} />
        ) : (
          <QuestoesEtiquetas podeEditar={qPerm.editar} inicial={ssrQ?.etiquetas} />
        )
      ) : <Nota destaque>Você não tem permissão para ver o banco de questões (questoes:view).</Nota>) : modoUnificar ? (
        <UnificarDisciplinas inicial={ssrQ?.disciplinas} categoria={categoria} podeEditar={podeEditar} podeTaxonomiaVer={qPerm.ver} podeTaxonomiaEditar={qPerm.editar} onMudou={() => void recarregar()} onVoltar={() => setUnificar(false)} />
      ) : (
      <div className={cn('grid items-start gap-4', ehDoc && 'xl:grid-cols-[17rem_minmax(0,1fr)]')}>
        {docsVisiveis && (
          <PastasPainel arvore={arv?.arvore ?? null} pasta={st.pasta} onPasta={abrirPasta} onPrefetch={(id) => prefetch({ ...st, pasta: id, page: 1 })} podeEditar={podeEditar}
            ocultarVazias={ocultarVazias} onOcultarVazias={setOcultarVazias} onMudou={() => void recarregar()}
            onAcessoPasta={(id, nome) => setAcessoPasta({ id, nome })} onCapaPasta={(id) => setCapa({ tipo: 'pasta', id })} carregando={carregando}
            onConfigurarPasta={podeEditar ? configurarPasta : undefined}
            cabecalho={podeEditar ? (
              <div className="px-2 pb-1.5">
                <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={() => setUnificar(true)} title="Juntar disciplinas (pastas) repetidas ou parecidas"><Merge />Unificar disciplinas</Button>
              </div>
            ) : undefined} />
        )}
        <div className="min-w-0">
          {erro && <div className="mb-3 rounded-xl border p-4 text-center text-sm"><p className="mb-2 text-destructive">Não foi possível carregar ({erro}).</p><Button variant="outline" onClick={() => void carregar(st, { fresh: true })}>Tentar de novo</Button></div>}

          {docsVisiveis && (
            <MateriaisTabela tipo={st.aba} rows={dados.rows} inicio={(st.page - 1) * st.pp} podeEditar={podeEditar} controleVisivel={resumo.temOculto} rotuloTipo={tipoAtual.nome}
              categoria={categoria} colunas={colunas} sel={sel} onSel={onSel} onToggle={onToggle} onSelPagina={onSelPagina} sort={st.sort} dir={st.dir} onSort={ordenar} carregando={carregando}
              onMudou={() => void recarregar()} onDetalhe={setDetalheId} onAcessoDoc={setAcessoDoc} onCapa={(id) => setCapa({ tipo: 'documento', id })} mostrarPasta={!pastaReal || st.sub} />
          )}

          {st.aba === 'flashcards' && (
            <>
              {dados.aviso && <Nota>{dados.aviso}</Nota>}
              <TabelaSimples cols={['Baralho', 'Nº de cards', 'Status', 'Alcance', '']} vazio="Nenhum baralho cadastrado. Use “Novo baralho” para criar em Conteúdos › Flashcards." numericas={[1]}
                linhas={(dados.baralhos ?? []).map((b) => [<b key="n" className="font-medium">{b.nome}</b>, b.cartoes, b.status === 'publicado' ? 'Publicado' : 'Rascunho', b.alcance === 'grupos' ? 'Somente grupos' : 'Todos', <Link key="a" href={`/admin/conteudos/flashcards?sel=${b.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Abrir</Link>])} />
            </>
          )}
          {st.aba === 'simulados' && (
            <TabelaSimples cols={['Simulado', 'Modo', 'Questões', 'Duração (min)', 'Disponível a partir de', 'Status', '']} numericas={[2, 3]}
              vazio={podeCriarSimulado ? 'Nenhum simulado cadastrado. Use “Novo simulado” para criar.' : 'Nenhum simulado cadastrado.'}
              linhas={(dados.simulados ?? []).map((s) => [<b key="n" className="font-medium">{s.titulo}</b>, s.modo === 'janela_fixa' ? 'Janela fixa' : s.modo === 'prazo_relativo' ? 'Prazo relativo' : s.modo === 'aberto' ? 'Aberto' : '—', s.questoes, s.duracaoMin ?? '—', formatBrt(s.inicio) ?? '—', s.status === 'publicado' ? 'Publicado' : s.status === 'encerrado' ? 'Encerrado' : 'Rascunho', <Link key="a" href={`/admin/simulados/${s.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Abrir</Link>])} />
          )}

          <PaginacaoBib total={dados.total} page={st.page} pp={st.pp} opcoesPP={PP} selecionados={sel.size} carregando={carregando}
            onPage={(p) => setSt((s) => ({ ...s, page: p }))} onPP={(n) => setSt((s) => ({ ...s, pp: n, page: 1 }))} />
        </div>
      </div>
      )}

      {imp.uploads && imp.uploads.length > 0 && <DriveUploadPanel itens={imp.uploads} onClose={imp.fechar}
        onRetry={(id) => { if (imp.temArquivo(id)) void imp.tentarDeNovo([id]) }}
        onRetryTodos={() => void imp.tentarDeNovo(imp.uploads!.filter((x) => x.status === 'erro' && imp.temArquivo(x.id)).map((x) => x.id))} />}
      {detalheId && (
        <BibliotecaDocSidebar documentoId={detalheId} pastaLabel={dados.rows.find((r) => r.id === detalheId)?.pastaCaminho ?? 'Início'} onFechar={() => setDetalheId(null)} onMudou={() => void recarregar()}
          onGerenciarAcesso={() => { const r = dados.rows.find((x) => x.id === detalheId); if (r) setAcessoDoc(r) }}
          onEditarOffice={async () => { const r = await abrirEdicaoDocx(detalheId); if (!r.ok || !r.versaoId) return toast.error(r.error || 'Edição no editor disponível só para .docx.'); window.location.href = `/admin/biblioteca/editar/${r.versaoId}?origem=${encodeURIComponent(window.location.pathname + window.location.search)}` }}
          onBaixar={async () => { const r = await urlDownloadDocumento(detalheId); if (!r.ok || !r.url) return toast.error(r.error || 'Falha ao gerar o link.'); window.open(r.url, '_blank') }} />
      )}
      {loteDlg && (
        <LoteDialog titulo={loteDlg.titulo} alvoBase={loteDlg.alvo} secoes={loteDlg.secoes} config={loteDlg.config} inicial={loteDlg.inicial}
          pausado={!!capa || !!regAtualizacao} onFechar={() => setLoteDlg(null)} onConcluido={loteConcluido}
          onCapa={loteDlg.alvo.pastaIds.length === 1 ? () => setCapa({ tipo: 'pasta', id: loteDlg.alvo.pastaIds[0] }) : undefined}
          onAtualizacao={(alvo) => setRegAtualizacao(alvo)} />
      )}
      {regAtualizacao && <RegistrarAtualizacaoLote alvo={regAtualizacao} onFechar={() => setRegAtualizacao(null)} onDone={() => void recarregar()} />}
      {capa && <CapaPaginaDialog alvo={capa} onFechar={() => setCapa(null)} onSalvo={() => void recarregar()} />}
      {acessoPasta && <DriveAcessoWrapper pastaId={acessoPasta.id} categoria={categoria} onFechar={() => { setAcessoPasta(null); void recarregar() }} />}
      {acessoDoc && (
        <Overlay onFechar={() => { setAcessoDoc(null); void recarregar() }} largura="max-w-3xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Acesso dos alunos — documento “{acessoDoc.titulo}”</h2>
            <button onClick={() => { setAcessoDoc(null); void recarregar() }} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">Sem nenhum grupo/aluno marcado = <strong>liberado para todos</strong> (respeitando o acesso das pastas acima).</p>
          <DocumentoAcesso documentoId={acessoDoc.id} />
        </Overlay>
      )}
      {moverLote && (
        <MoverConteudoDialog titulo={`Mover ${ids.length} ${ids.length === 1 ? 'material' : 'materiais'}`} subtitulo="Escolha a pasta de destino — entre nas pastas ou clique para selecionar" pastas={pastasMover} atualId={null}
          onConfirm={async (destino) => { setMoverLote(false); await lote('Movendo', ids, (id) => moverDocumento(id, destino), 'Movidos') }} onClose={() => setMoverLote(false)} />
      )}
      {metaLote && <MetadadosLoteDialog n={ids.length} onClose={() => setMetaLote(false)} onSalvo={() => { setMetaLote(false); setSel(new Set()); void recarregar() }} ids={ids} />}
    </div>
  )
}

/** Edição EM MASSA dos metadados dos conteúdos selecionados (rota nova /api/admin/revisao/biblioteca/lote). */
function MetadadosLoteDialog({ n, ids, onClose, onSalvo }: { n: number; ids: string[]; onClose: () => void; onSalvo: () => void }) {
  const [v, setV] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  async function salvar() {
    setSalvando(true)
    try {
      const r = await fetch('/api/admin/revisao/biblioteca/lote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao: 'metadados', ids, valores: v }) })
      const j = await r.json().catch(() => null)
      if (!j?.ok) { toast.error(j?.error || 'Não foi possível salvar.'); return }
      toast.success(`Metadados atualizados em ${j.atualizados} ${j.atualizados === 1 ? 'conteúdo' : 'conteúdos'}.`); onSalvo()
    } catch { toast.error('Falha de rede ao salvar.') } finally { setSalvando(false) }
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salvando) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar metadados de {n} {n === 1 ? 'conteúdo' : 'conteúdos'}</DialogTitle>
          <DialogDescription>Campo vazio mantém o valor atual; escreva <code className="rounded bg-muted px-1">-</code> para apagar o valor nos selecionados.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {CAMPOS_META.map((c) => (
            <label key={c.k} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">{c.rot}
              <input value={v[c.k] ?? ''} onChange={(e) => setV((s) => ({ ...s, [c.k]: e.target.value }))} placeholder={c.dica} className="h-9 rounded-lg border bg-background px-2 text-sm font-normal text-foreground" />
            </label>
          ))}
        </div>
        <div className="-mx-4 -mb-4 mt-2 flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !Object.values(v).some((x) => x.trim())}>{salvando && <Loader2 className="animate-spin" />}Aplicar a {n}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TabelaSimples({ cols, linhas, vazio, numericas = [] }: { cols: string[]; linhas: React.ReactNode[][]; vazio: string; numericas?: number[] }) {
  return (
    <section className="rounded-2xl border bg-card p-2 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">{cols.map((c, i) => <th key={i} className={cn('px-3 py-2.5 font-medium', numericas.includes(i) && 'text-right')}>{c}</th>)}</tr></thead>
          <tbody>
            {linhas.length === 0 && <tr><td colSpan={cols.length} className="px-3 py-10 text-center text-muted-foreground">{vazio}</td></tr>}
            {linhas.map((l, i) => <tr key={i} className="border-b last:border-0">{l.map((c, j) => <td key={j} className={cn('px-3 py-2.5 align-middle', numericas.includes(j) && 'text-right tabular-nums')}>{c}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </section>
  )
}
