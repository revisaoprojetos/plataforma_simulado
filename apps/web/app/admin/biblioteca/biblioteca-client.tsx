'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  FolderPlus, Upload, Folder, FileText, FileType2, FileCode2, LayoutGrid, List as ListIcon,
  ChevronRight, ChevronLeft, MoreVertical, Loader2, X, CircleCheck, CircleDashed, Archive,
  Download, Pencil, Info, Trash2, FolderInput, Layers, Link2, RotateCcw, Clock, ExternalLink, Users2,
  Lock, Palette, Check, Settings2, Copy, Files, Search, Home, FolderTree, CalendarClock, GraduationCap, Music, Image as ImageIcon, SquareCheckBig,
} from 'lucide-react'
import { CapaPaginaDialog } from '@/components/biblioteca/capa-pagina-dialog'
import { CheckSelecao, BarraLote, useSelecaoIds, type AcaoBarra } from '@/components/biblioteca/selecao-lote'
import { LoteDialog, type InicialLote } from '@/components/biblioteca/lote-dialogs'
import { RegistrarAtualizacaoLote } from '@/components/biblioteca/registrar-atualizacao-lote'
import type { AlvoLote, AcaoLote, ResultadoLote } from './lote-actions-tipos'
import type { AlvoCP } from './capa-actions-tipos'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
import { ModuloAcesso } from '@/components/admin/modulo-acesso'
import { DocumentoAcesso } from '@/components/admin/documento-acesso'
import { DrivePastaStyles } from '@/components/admin/pasta-card-drive'
import { BibliotecaDocSidebar } from '@/components/admin/biblioteca-doc-sidebar'
import { DriveAcessoDialog, DriveAcessoStyles, type DriveNode, type DrivePapel } from '@/components/admin/drive-acesso'
import { DriveNovoButton, DriveNovoStyles, DriveUploadPanel, type DriveUploadItem } from '@/components/admin/drive-novo'
import { MenuPortal, ItemMenu } from '@/components/conteudo/menu-drive'
import { CardPasta } from '@/components/biblioteca/card-pasta'
import { CardConteudo } from '@/components/biblioteca/card-conteudo'
import { SeloTipo } from '@/components/biblioteca/selo-tipo'
import { BarraMetadados, useColunasLista, passaFiltrosMeta, type FiltrosMeta } from '@/components/biblioteca/metadados-toolbar'
import { CAMPOS_META, listaMulti, textoMeta, type Metadados } from '@/lib/conteudo/metadados'
import { BuscaDrive, ResultadosBusca, type OpcaoChip, type SugestaoBusca, type ResultadoBusca } from '@/components/biblioteca/busca-drive'
import { cardGrid, FOLDER_MIN, POSTER_MIN } from '@/components/aluno/card-grid'
import { TIPOS_CONTEUDO, kindPorArquivo, type KindConteudo } from '@/lib/biblioteca/tipos-conteudo'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { createClient } from '@/lib/supabase/client'
import { SeloCronograma, MenuPasta, MenuDoc, MoverConteudoDialog, Overlay, DriveAcessoWrapper } from '@/components/biblioteca/menus-drive'
import { formatBrt } from '@/lib/brt'
import type { PastaConteudo, Categoria, NoAcesso } from './actions-tipos'
import { listarArvore, criarPasta, removerPasta, renomearPasta, moverPasta, definirCorPasta, moverDocumento, importarDocumento, prepararUploadConteudo, importarDeStorage, criarDocumentoBranco, criarConteudoQuestoes, publicarDocumento, publicarNovaVersao, removerDocumento, detalheDocumento, abrirEdicaoDocx, renomearDocumento, urlDownloadDocumento, listarPastasConteudo, dadosVisualizacao, thumbDocumento, pdfPreviewDocumento, midiaPreviewDocumento, conteudoPreviewAdmin, duplicarDocumento, definirPastaDisciplinaCronograma, removerPastaDisciplinaCronograma, definirTipoMaterialSubpasta, definirLegendaTabelaPasta, carregarArvoreAcesso, montarArvoreAcessoDrive, salvarAcessoNo, resolverEstudantePorEmail, listarGruposBiblioteca, buscarAlunosBiblioteca, gruposDoEstudante } from './actions'

declare global { interface Window { DocsAPI?: any } }

type Doc = Awaited<ReturnType<typeof listarArvore>>['documentos'][number]
type StatusFiltro = 'todos' | 'rascunho' | 'publicado' | 'arquivado'

const ICONE_TIPO: Record<string, typeof FileText> = { docx: FileType2, pdf: FileText, html: FileCode2 }

// Mapeia o tipo_origem armazenado (docx|pdf|html|video|audio) para o KindConteudo dos selos/cards.
// html = documento. Vídeo/áudio ganham selo/ícone próprios no card (placeholder do CardConteudo).
function docKind(tipoOrigem: string): KindConteudo {
  return tipoOrigem === 'pdf' ? 'pdf'
    : tipoOrigem === 'video' ? 'video'
    : tipoOrigem === 'audio' ? 'audio'
    : tipoOrigem === 'questoes' ? 'questoes'
    : 'docx'
}

/** Miniatura do card: tenta a IMAGEM FIEL do .docx (1ª página, render do OnlyOffice) — igual aos Modelos
 *  de Caderno. Se falhar (não-docx, OnlyOffice indisponível), cai na folha de trechos ou no ícone. */
function CardThumb({ doc, thumbUrl, trechos }: { doc: Doc; thumbUrl?: string; trechos?: { tipo: string; texto: string }[] }) {
  // CAPA = 1ª página (PNG cacheado), carregada LAZY pela rota (só cache; nunca gera OnlyOffice no render).
  // Se faltar (404), o onError cai na folha de trechos (instantânea) — nunca renderiza o doc inteiro.
  const [url, setUrl] = useState<string | null>(thumbUrl ?? (doc.tipo_origem === 'docx' && doc.versao_atual_id ? `/api/admin/biblioteca/capa/${doc.versao_atual_id}` : null))
  const [imgRuim, setImgRuim] = useState(false)
  const Icone = ICONE_TIPO[doc.tipo_origem] ?? FileText
  if (url && !imgRuim) return (
    <div className="absolute inset-0 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" loading="lazy" className="h-full w-full object-cover object-top" onError={() => { setUrl(null); setImgRuim(true) }} />
    </div>
  )
  if (trechos?.length) return <CardFolhaPrevia trechos={trechos} />
  return <div className="flex h-full items-center justify-center"><Icone className="h-10 w-10 text-neutral-300" /></div>
}

/** Fallback da miniatura: folha A4 (794px) escalada à largura do card, borda-a-borda. */
function CardFolhaPrevia({ trechos }: { trechos: { tipo: string; texto: string }[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.28)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const medir = () => { const w = el.clientWidth; if (w > 10) setScale(w / 794) }
    medir(); const ro = new ResizeObserver(medir); ro.observe(el); return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden bg-white">
      <div style={{ width: 794, transform: `scale(${scale})`, transformOrigin: 'top left' }} className="pointer-events-none">
        <div className="bg-white px-16 py-14 text-[15px] leading-relaxed text-neutral-900" style={{ width: 794 }}>
          {trechos.map((t, i) => {
            if (t.tipo === 'titulo') return <h2 key={i} className="mb-2 mt-4 text-2xl font-bold first:mt-0">{t.texto}</h2>
            if (t.tipo === 'capitulo') return <h3 key={i} className="mb-1 mt-3 text-lg font-semibold text-neutral-600">{t.texto}</h3>
            return <p key={i} className="mb-2">{t.texto}</p>
          })}
        </div>
      </div>
    </div>
  )
}

function BadgeStatus({ s }: { s: string }) {
  const map: Record<string, { cor: string; Icone: typeof CircleCheck; txt: string }> = {
    publicado: { cor: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10', Icone: CircleCheck, txt: 'Publicado' },
    rascunho: { cor: 'text-amber-600 dark:text-amber-400 bg-amber-500/10', Icone: CircleDashed, txt: 'Rascunho' },
    arquivado: { cor: 'text-muted-foreground bg-muted', Icone: Archive, txt: 'Arquivado' },
  }
  const v = map[s] ?? map.rascunho
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${v.cor}`}><v.Icone className="h-3 w-3" />{v.txt}</span>
}

/** Badge do TIPO do arquivo (canto da miniatura), estilo mockup: DOCX (marca), PDF (vermelho), HTML. */
function BadgeTipo({ t }: { t: string }) {
  const map: Record<string, { txt: string; cls: string }> = {
    docx: { txt: 'DOCX', cls: 'bg-primary text-primary-foreground' },
    pdf: { txt: 'PDF', cls: 'bg-rose-600 text-white' },
    html: { txt: 'HTML', cls: 'bg-amber-600 text-white' },
  }
  const v = map[t] ?? { txt: (t || '—').toUpperCase(), cls: 'bg-muted text-foreground' }
  return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider shadow-sm ${v.cls}`}>{v.txt}</span>
}

/** Rótulo de acesso do card: "Todos" (sem restrição) ou "Restrito" (acesso_geral = restrito). */
function AccessLabel({ restrito }: { restrito?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground" title={restrito ? 'Acesso restrito' : 'Liberado a todos'}>
      <Users2 className="h-3 w-3" />{restrito ? 'Restrito' : 'Todos'}
    </span>
  )
}

type TipoFiltro = 'todos' | 'docx' | 'pdf'
// ?tab= → coleção: 'modelos' (menu lateral) e 'jurisclub' (aba abaixo do título); qualquer outro valor = Conteúdos.
const categoriaDaTab = (t: string | null): Categoria => (t === 'modelos' ? 'modelo_caderno' : t === 'jurisclub' ? 'jurisclub' : 'conteudo')
type Ordenar = 'atualizados' | 'nome' | 'criados'

export function BibliotecaClient() {
  const searchParams = useSearchParams()
  const routerTopo = useRouter()
  const [categoria, setCategoria] = useState<Categoria>(categoriaDaTab(searchParams.get('tab')))
  const ehModelo = categoria === 'modelo_caderno'
  const ehJurisclub = categoria === 'jurisclub'
  const [pastaAtual, setPastaAtual] = useState<string | null>(null)
  const [pastas, setPastas] = useState<PastaConteudo[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [previas, setPrevias] = useState<Record<string, { tipo: string; texto: string }[]>>({})
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [breadcrumb, setBreadcrumb] = useState<PastaConteudo[]>([])
  const [contagens, setContagens] = useState<Record<string, number>>({})
  const [restritasPasta, setRestritasPasta] = useState<Record<string, boolean>>({})
  const [restritoDoc, setRestritoDoc] = useState<Record<string, boolean>>({})
  const [resumo, setResumo] = useState<{ nGrupos: number; nAlunos: number }>({ nGrupos: 0, nAlunos: 0 })
  const [metadados, setMetadados] = useState<Record<string, Metadados>>({}) // colunas da lista (disciplina, tribunal…)
  const [colunas, setColunas] = useColunasLista()                            // colunas visíveis (preferência local)
  const [filtrosMeta, setFiltrosMeta] = useState<FiltrosMeta>({})            // filtros por metadado
  const [carregando, setCarregando] = useState(true)
  const [view, setView] = useState<'grid' | 'lista'>('grid')
  const [busca, setBusca] = useState('')
  const [buscaAtiva, setBuscaAtiva] = useState<string | null>(null) // termo submetido (Enter) → tela de resultados
  const [filtro, setFiltro] = useState<StatusFiltro>('todos')
  const [tipo, setTipo] = useState<TipoFiltro>('todos')
  const [ordenar, setOrdenar] = useState<Ordenar>('atualizados')
  const [importAberto, setImportAberto] = useState(false)
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const [acessoPasta, setAcessoPasta] = useState<PastaConteudo | null>(null) // pasta cujo acesso se gerencia
  const [acessoDoc, setAcessoDoc] = useState<Doc | null>(null) // documento cujo acesso se gerencia
  const [capaDlg, setCapaDlg] = useState<AlvoCP | null>(null) // "Capa e página inicial" (pasta ou documento)
  const [gerenciarAberto, setGerenciarAberto] = useState(false) // painel "Gerenciar acessos" hierárquico
  const [acessoDrive, setAcessoDrive] = useState<{ id: string; nome: string } | null>(null) // "Liberar acesso" estilo Drive (árvore)
  const [uploads, setUploads] = useState<DriveUploadItem[] | null>(null) // painel de progresso do import
  const [, start] = useTransition()

  // ── Seleção múltipla + ações em lote (persiste ao alternar card/tabela; limpa ao trocar de pasta/coleção) ──
  const [modoSel, setModoSel] = useState(false)
  const selDocs = useSelecaoIds()
  const selPastas = useSelecaoIds()
  const [loteDlg, setLoteDlg] = useState<{ titulo: string; alvo: AlvoLote; secoes: AcaoLote['tipo'][]; config?: boolean; inicial?: InicialLote } | null>(null)
  const [regAtualizacao, setRegAtualizacao] = useState<AlvoLote | null>(null)
  const limparSelecao = () => { selDocs.limpar(); selPastas.limpar() }
  const sairSelecao = () => { limparSelecao(); setModoSel(false) }

  async function carregar(pastaId: string | null, cat: Categoria = categoria, push = true) {
    if (pastaId !== pastaAtual || cat !== categoria) { selDocs.limpar(); selPastas.limpar() }
    setCarregando(true)
    try {
      const r = await listarArvore(pastaId, cat)
      if (!r.ok) { toast.error(r.error || 'Falha ao carregar.'); return }
      setPastas(r.pastas); setDocs(r.documentos); setPrevias(r.previas || {}); setThumbs(r.thumbs || {}); setBreadcrumb(r.breadcrumb); setPastaAtual(pastaId)
      setContagens(r.contagens || {}); setRestritasPasta(r.restritasPasta || {}); setRestritoDoc(r.restritoDoc || {}); setResumo(r.resumo || { nGrupos: 0, nAlunos: 0 }); setMetadados(r.metadados || {})
      // Histórico: cada navegação de pasta vira uma entrada (URL inalterada, preservando o estado do Next)
      // → o "Voltar" do navegador sobe de pasta em vez de sair da Biblioteca. push=false quando a
      // própria navegação já veio de um popstate (voltar/avançar do navegador).
      if (push && typeof window !== 'undefined') {
        try { window.history.pushState({ ...(window.history.state || {}), _bibPasta: pastaId }, '') } catch { /* no-op */ }
      }
    } catch (e) {
      toast.error('Falha ao carregar a Biblioteca.')
    } finally {
      setCarregando(false)
    }
  }
  // A coleção (Conteúdos × Modelos) vem do ?tab= do menu lateral — sincroniza ao navegar.
  useEffect(() => {
    const cat: Categoria = categoriaDaTab(searchParams.get('tab'))
    setCategoria((prev) => (prev === cat ? prev : cat))
    setBusca(''); setBuscaAtiva(null); setFiltro('todos')
  }, [searchParams])

  useEffect(() => {
    // Base da coleção = raiz, sem empilhar histórico; marca a entrada atual como raiz (_bibPasta:null)
    // para o "Voltar" do navegador reconhecer o fundo da pilha da Biblioteca.
    if (typeof window !== 'undefined') { try { window.history.replaceState({ ...(window.history.state || {}), _bibPasta: null }, '') } catch { /* no-op */ } }
    selDocs.limpar(); selPastas.limpar()
    carregar(null, categoria, false) /* eslint-disable-next-line */
  }, [categoria])

  // Voltar/avançar do navegador → carrega a pasta da entrada do histórico (sem re-empilhar).
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = e.state as { _bibPasta?: string | null } | null
      if (st && '_bibPasta' in st) carregar(st._bibPasta ?? null, categoria, false)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    /* eslint-disable-next-line */
  }, [categoria])

  const docsFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const arr = docs
      .filter((d) => filtro === 'todos' || d.status === filtro)
      .filter((d) => tipo === 'todos' || d.tipo_origem === tipo)
      .filter((d) => !q || d.titulo.toLowerCase().includes(q))
      .filter((d) => passaFiltrosMeta(metadados[d.id], filtrosMeta))
    const ord = [...arr]
    if (ordenar === 'nome') ord.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
    else if (ordenar === 'criados') ord.sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))
    else ord.sort((a, b) => String(b.atualizado_em).localeCompare(String(a.atualizado_em)))
    return ord
  }, [docs, busca, filtro, tipo, ordenar, metadados, filtrosMeta])

  // ── Lote: ordem visível (p/ shift-click), alvo, ações da barra e Esc ──
  const ordemDocs = useMemo(() => docsFiltrados.map((d) => d.id), [docsFiltrados])
  const ordemPastas = useMemo(() => pastas.map((p) => p.id), [pastas])
  const nSelDocs = selDocs.sel.size, nSelPastas = selPastas.sel.size
  const totalVisivel = ordemDocs.length + ordemPastas.length
  const todosMarcados = totalVisivel > 0 && ordemDocs.every((i) => selDocs.sel.has(i)) && ordemPastas.every((i) => selPastas.sel.has(i))
  const alvoSelecao = (): AlvoLote => ({ docIds: [...selDocs.sel], pastaIds: [...selPastas.sel], incluirSubpastas: false, categoria })
  const selecionarTodos = () => {
    if (todosMarcados) { limparSelecao(); return }
    selDocs.manter(ordemDocs); selPastas.manter(ordemPastas)
  }
  function acaoLote(a: AcaoBarra) {
    const alvo = alvoSelecao()
    if (a === 'atualizacao') { setRegAtualizacao(alvo); return }
    const abrir = (titulo: string, secoes: AcaoLote['tipo'][], extra?: { config?: boolean; inicial?: InicialLote }) => setLoteDlg({ titulo, alvo, secoes, ...extra })
    if (a === 'mover') abrir('Mover para a pasta', ['mover'])
    else if (a === 'status') abrir('Alterar status', ['status'])
    else if (a === 'categoria') abrir('Alterar categoria', ['categoria'])
    else if (a === 'acesso') abrir('Configurar acesso', ['acesso'])
    else if (a === 'visibilidade_mostrar') abrir('Mostrar ao aluno', ['visibilidade'], { inicial: { oculto: false } })
    else if (a === 'visibilidade_ocultar') abrir('Ocultar do aluno', ['visibilidade'], { inicial: { oculto: true } })
    else if (a === 'legenda') abrir('Legenda de grifos', ['legenda'])
    else if (a === 'lixeira') abrir('Enviar para a lixeira', ['lixeira'])
    else abrir('Configurar em lote', ['categoria', 'status', 'acesso', 'visibilidade', 'legenda'], { config: true })
  }
  function configurarPasta(p: PastaConteudo) {
    setLoteDlg({
      titulo: `Configurar pasta “${p.nome}”`,
      alvo: { docIds: [], pastaIds: [p.id], incluirSubpastas: true, categoria },
      secoes: ['categoria', 'status', 'acesso', 'visibilidade', 'legenda'], config: true,
    })
  }
  function loteConcluido(r: ResultadoLote) {
    setLoteDlg(null)
    // Mantém selecionados só os documentos que falharam (para repetir); pastas saem da seleção.
    const falhos = r.itens.filter((i) => !i.ok).map((i) => i.id)
    if (falhos.length === 0) sairSelecao(); else { selPastas.limpar(); selDocs.manter(falhos) }
    carregar(pastaAtual)
  }
  const dialogoAberto = !!(loteDlg || regAtualizacao || capaDlg || acessoDrive || detalheId || acessoDoc || acessoPasta || gerenciarAberto || importAberto || uploads)
  useEffect(() => {
    if (!modoSel) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !dialogoAberto) sairSelecao() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [modoSel, dialogoAberto])

  async function novaPasta() {
    const nome = await pedirTexto({ titulo: 'Nova pasta', placeholder: 'Nome da pasta', confirmar: 'Criar' })
    if (!nome) return
    const r = await criarPasta(nome, pastaAtual, categoria)
    if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success('Pasta criada.'); carregar(pastaAtual)
  }
  async function novoBranco() {
    const titulo = await pedirTexto({ titulo: ehModelo ? 'Novo modelo em branco' : 'Documento em branco', placeholder: 'Título do documento', confirmar: 'Criar' })
    if (!titulo) return
    const r = await criarDocumentoBranco({ titulo, pastaId: pastaAtual, categoria })
    if (!r.ok) return toast.error(r.error || 'Falha ao criar.')
    toast.success('Documento em branco criado.'); carregar(pastaAtual)
  }
  async function novoConjuntoQuestoes() {
    const titulo = await pedirTexto({ titulo: 'Novo conjunto de questões', placeholder: 'Título do conjunto', confirmar: 'Criar' })
    if (!titulo) return
    const r = await criarConteudoQuestoes({ titulo, pastaId: pastaAtual, categoria })
    if (!r.ok) return toast.error(r.error || 'Falha ao criar.')
    toast.success('Conjunto de questões criado.'); carregar(pastaAtual)
  }
  // "Gerenciar acessos": dentro de uma pasta → árvore Drive daquela pasta; na raiz → painel hierárquico antigo.
  function abrirGerenciarAcessos() {
    if (pastaAtual) setAcessoDrive({ id: pastaAtual, nome: breadcrumb[breadcrumb.length - 1]?.nome ?? 'Pasta' })
    else setGerenciarAberto(true)
  }

  // PUT direto ao storage com progresso de bytes (XHR). Devolve o resultado com o HTTP p/ diagnóstico.
  function subirComProgresso(signedUrl: string, f: File, onProg: (frac: number) => void): Promise<{ ok: boolean; status: number; corpo: string }> {
    return new Promise((resolve) => {
      try {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', signedUrl)
        if (f.type) xhr.setRequestHeader('content-type', f.type)
        xhr.setRequestHeader('x-upsert', 'true')
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProg(e.loaded / e.total) }
        xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, corpo: String(xhr.responseText || '').slice(0, 300) })
        xhr.onerror = () => resolve({ ok: false, status: 0, corpo: 'Falha de rede (conexão caiu, bloqueio de CORS ou URL inacessível).' })
        xhr.ontimeout = () => resolve({ ok: false, status: 0, corpo: 'Tempo esgotado no envio.' })
        xhr.send(f)
      } catch (e: any) { resolve({ ok: false, status: 0, corpo: e?.message ?? 'Erro ao iniciar o envio.' }) }
    })
  }
  // Cor do ícone no painel de progresso: selo do tipo detectado (token fixo por tipo), com fallback à marca.
  const corTipo = (nome: string) => {
    const k = kindPorArquivo(nome)
    return k ? `var(--sel-${TIPOS_CONTEUDO[k].seloSlug})` : 'var(--brand-primary, var(--primary))'
  }

  /** Traduz a falha do PUT ao storage em mensagem clara (o HTTP cru vai no detalhe). */
  function erroDoEnvio(status: number, corpo: string): string {
    if (status === 0) return 'Não foi possível enviar o arquivo (conexão interrompida ou bloqueada).'
    if (status === 413 || /too large|exceeded|maximum allowed size/i.test(corpo)) return 'Arquivo maior que o limite do armazenamento.'
    if (status === 400 && /mime|content.?type|not supported/i.test(corpo)) return 'O armazenamento recusou o tipo do arquivo.'
    if (status === 401 || status === 403 || /signature|expired|jwt/i.test(corpo)) return 'O link de envio expirou ou foi recusado. Tente de novo.'
    if (status === 404 || /bucket not found/i.test(corpo)) return 'Pasta de armazenamento não encontrada (bucket). Verifique a configuração do storage.'
    if (status >= 500) return 'O armazenamento está instável no momento. Tente de novo em instantes.'
    return `O armazenamento recusou o envio (HTTP ${status}).`
  }
  /** Traduz o erro do servidor (conversão/ingestão) em mensagem clara, mantendo a original no detalhe. */
  function erroDoProcessamento(msg: string): string {
    if (/formato não suportado/i.test(msg)) return msg
    if (/body exceeded|payload too large|413/i.test(msg)) return 'Arquivo grande demais para o servidor processar.'
    if (/convers|gotenberg|onlyoffice|mammoth|pdf/i.test(msg) && /vazi|empty/i.test(msg)) return 'O arquivo não tem texto legível (vazio ou só imagens escaneadas).'
    if (/convers|gotenberg|onlyoffice|ECONNREFUSED|fetch failed/i.test(msg)) return 'O serviço de conversão de documentos não respondeu.'
    if (/timeout|timed out|504/i.test(msg)) return 'O processamento demorou demais e foi interrompido.'
    if (/permiss|unauthor|forbidden|não autorizado/i.test(msg)) return 'Sem permissão para importar nesta biblioteca.'
    if (/ler o arquivo enviado/i.test(msg)) return 'O arquivo foi enviado, mas o servidor não conseguiu lê-lo do armazenamento.'
    return msg || 'Falha ao processar o arquivo.'
  }

  // Arquivos da importação atual por id do item → permite "Tentar de novo" sem escolher de novo.
  const uploadFilesRef = useRef(new Map<string, { file: File; destino: string | null }>())
  const patchUpload = (id: string, p: Partial<DriveUploadItem>) => setUploads((prev) => (prev ? prev.map((x) => (x.id === id ? { ...x, ...p } : x)) : prev))

  /** Sobe + ingere UM arquivo, registrando a ETAPA e a MENSAGEM real de qualquer falha. */
  async function processarUpload(id: string, f: File, destino: string | null): Promise<boolean> {
    const falhar = (etapa: DriveUploadItem['etapa'], erro: string, detalhe?: string) => {
      patchUpload(id, { status: 'erro', pct: 100, etapa, erro, detalhe })
      console.error(`[biblioteca/import] ${f.name} — ${etapa}: ${erro}`, detalhe ?? '')
      return false
    }
    patchUpload(id, { status: 'enviando', pct: 0, etapa: undefined, erro: undefined, detalhe: undefined })
    if (f.size === 0) return falhar('validacao', 'O arquivo está vazio (0 bytes).')
    try {
      const prep = await prepararUploadConteudo(f.name)
      if (!prep.ok || !prep.path || !prep.uploadUrl) return falhar('preparo', prep.error || 'Não foi possível preparar o envio.', prep.error)
      // PUT direto ao storage (Supabase signed URL ou S3 presigned PUT) — mesma mecânica XHR com progresso.
      const put = await subirComProgresso(prep.uploadUrl, f, (frac) => patchUpload(id, { pct: Math.min(99, Math.round(frac * 100)) }))
      let subiu = put.ok
      let detalheEnvio = `HTTP ${put.status || 'sem resposta'}${put.corpo ? ` — ${put.corpo}` : ''}`
      if (!subiu && prep.kind === 'supabase' && prep.token && prep.bucket) { // fallback Supabase (sem progresso de bytes)
        const up = await createClient().storage.from(prep.bucket).uploadToSignedUrl(prep.path, prep.token, f, { contentType: f.type || undefined })
        subiu = !up.error
        if (up.error) detalheEnvio += ` | fallback: ${up.error.message}`
      }
      if (!subiu) return falhar('envio', erroDoEnvio(put.status, put.corpo), detalheEnvio)
      patchUpload(id, { status: 'processando', pct: 100 })
      const r = await importarDeStorage({ path: prep.path, titulo: f.name.replace(/\.[^.]+$/, ''), nomeArquivo: f.name, mime: f.type, pastaId: destino, categoria })
      if (!r.ok) return falhar('processamento', erroDoProcessamento(r.error ?? ''), r.error)
      patchUpload(id, { status: 'ok' })
      return true
    } catch (e: any) {
      // Exceção na server action (rede, timeout do servidor, corpo grande…) — mostra a mensagem real.
      const msg = String(e?.message ?? e ?? '')
      return falhar('processamento', erroDoProcessamento(msg) || 'Erro inesperado.', msg || undefined)
    }
  }

  /** Reenvia arquivos que falharam (um ou todos). */
  async function tentarDeNovo(ids: string[]) {
    let ok = 0
    for (const id of ids) {
      const it = uploadFilesRef.current.get(id)
      if (it && (await processarUpload(id, it.file, it.destino))) ok++
    }
    if (ok) { toast.success(ok === 1 ? 'Arquivo importado.' : `${ok} arquivos importados.`); carregar(pastaAtual) }
  }

  // Upload direto (sem pop-up) com painel de progresso (total + por arquivo). comoPasta=true recria a
  // árvore de subpastas pelo webkitRelativePath. Sobe DIRETO ao storage e ingere a partir de lá.
  async function importarArquivos(files: File[], comoPasta: boolean) {
    // Ignora arquivos ocultos/de sistema que vêm junto ao subir uma pasta (.DS_Store, Thumbs.db, ~$temp).
    const visiveis = files.filter((f) => !/^(\.|~\$)/.test(f.name) && !/^(thumbs\.db|desktop\.ini)$/i.test(f.name))
    const base = Date.now()
    // Arquivos de formato não suportado ENTRAM no painel como erro (com o motivo) — nada some calado.
    const itens: DriveUploadItem[] = visiveis.map((f, i) => {
      const suportado = kindPorArquivo(f.name, f.type) !== null
      const ext = (f.name.match(/\.[^./\\]+$/)?.[0] ?? '').toLowerCase()
      return {
        id: `${base}-${i}-${f.name}`, nome: f.name, cor: corTipo(f.name), pct: suportado ? 0 : 100, tamanho: f.size,
        status: suportado ? 'enviando' : 'erro',
        ...(suportado ? {} : {
          etapa: 'validacao' as const,
          erro: ext === '.doc' ? 'Formato .doc (Word antigo) não é aceito — abra no Word e "Salvar como" .docx.' : `Formato ${ext || 'sem extensão'} não é aceito.`,
          detalhe: 'Aceitos: .docx, .pdf, .html, .pptx/.ppt, .xlsx/.xls, vídeo (.mp4, .webm, .mov, .m4v) e áudio (.mp3, .m4a, .wav, .ogg).',
        }),
      }
    })
    if (!itens.length) { toast.error('Nenhum arquivo selecionado.'); return }
    setUploads(itens)
    uploadFilesRef.current = new Map()

    const cache = new Map<string, string | null>([['', pastaAtual]])
    const garantirPasta = async (segmentos: string[]): Promise<string | null> => {
      let acc = '', pai = pastaAtual
      for (const seg of segmentos) {
        const chave = acc ? `${acc}/${seg}` : seg
        if (cache.has(chave)) { pai = cache.get(chave)!; acc = chave; continue }
        const r = await criarPasta(seg, pai, categoria)
        if (!r.ok || !r.id) throw new Error(r.error || 'Falha ao criar a subpasta.')
        cache.set(chave, r.id); pai = r.id; acc = chave
      }
      return pai
    }

    let ok = 0, erros = itens.filter((x) => x.status === 'erro').length
    for (let i = 0; i < visiveis.length; i++) {
      const f = visiveis[i], it = itens[i]
      if (it.status === 'erro') continue
      let destino: string | null = pastaAtual
      if (comoPasta) {
        try { destino = await garantirPasta(String((f as any).webkitRelativePath || f.name).split('/').slice(0, -1)) } catch (e: any) {
          patchUpload(it.id, { status: 'erro', pct: 100, etapa: 'preparo', erro: 'Não foi possível criar a subpasta de destino.', detalhe: e?.message })
          erros++; continue
        }
      }
      uploadFilesRef.current.set(it.id, { file: f, destino })
      if (await processarUpload(it.id, f, destino)) ok++; else erros++
    }
    if (ok) carregar(pastaAtual)
    if (erros) toast.error(erros === 1 ? '1 arquivo não foi importado — veja o motivo no painel.' : `${erros} arquivos não foram importados — veja os motivos no painel.`)
  }
  async function excluirPasta(p: PastaConteudo) {
    if (!(await confirmar({ titulo: 'Excluir pasta?', mensagem: `"${p.nome}" — os documentos voltam para a raiz.`, confirmar: 'Excluir', destrutivo: true }))) return
    const r = await removerPasta(p.id); if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success('Pasta excluída.'); carregar(pastaAtual)
  }
  async function moverPastaFn(p: PastaConteudo, destinoId: string | null) {
    const r = await moverPasta(p.id, destinoId); if (!r.ok) return toast.error(r.error || 'Falha ao mover.')
    toast.success('Pasta movida.'); carregar(pastaAtual)
  }
  async function renomearPastaInline(p: PastaConteudo, novo: string) {
    const r = await renomearPasta(p.id, novo); if (!r.ok) return toast.error(r.error || 'Falha ao renomear.')
    carregar(pastaAtual)
  }
  async function mudarCorPasta(p: PastaConteudo, cor: string | null) {
    const r = await definirCorPasta(p.id, cor); if (!r.ok) return toast.error(r.error || 'Falha ao mudar a cor.')
    carregar(pastaAtual)
  }
  // ── Cronograma Adaptativo por pasta ──
  async function marcarDisciplinaCron(p: PastaConteudo, classificacao: string | null) {
    const r = await definirPastaDisciplinaCronograma(p.id, { classificacao }); if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success(`"${p.nome}" usada no cronograma como disciplina.`); carregar(pastaAtual)
  }
  async function removerDisciplinaCron(p: PastaConteudo) {
    const r = await removerPastaDisciplinaCronograma(p.id); if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success('Pasta removida do cronograma.'); carregar(pastaAtual)
  }
  async function definirTipoMaterialCron(p: PastaConteudo, tipo: string | null) {
    const r = await definirTipoMaterialSubpasta(p.id, tipo); if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success(tipo ? 'Tipo de material definido.' : 'Tipo de material removido.'); carregar(pastaAtual)
  }
  async function definirLegendaTabela(p: PastaConteudo, ocultar: boolean | null) {
    const r = await definirLegendaTabelaPasta(p.id, ocultar); if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success(ocultar === false ? 'Tabela de legenda VISÍVEL nesta pasta.' : ocultar ? 'Tabela de legenda oculta nesta pasta.' : 'Tabela de legenda volta ao padrão (oculta).')
  }
  async function renomear(p: PastaConteudo) {
    const nome = await pedirTexto({ titulo: 'Renomear pasta', valorInicial: p.nome, confirmar: 'Salvar' })
    if (!nome) return
    const r = await renomearPasta(p.id, nome); if (!r.ok) return toast.error(r.error || 'Falha.')
    carregar(pastaAtual)
  }
  // ── Ações do documento (menu de 3 pontos) ──
  async function editarDocOffice(d: Doc) {
    const t = toast.loading('Abrindo o editor…')
    try {
      const r = await abrirEdicaoDocx(d.id)
      toast.dismiss(t)
      if (!r.ok || !r.versaoId) return toast.error(r.error || 'Edição no editor disponível só para .docx.')
      window.location.href = `/admin/biblioteca/editar/${r.versaoId}?origem=${encodeURIComponent(window.location.pathname + window.location.search)}`
    } catch (e: any) {
      toast.dismiss(t)
      toast.error('Falha ao abrir o editor: ' + (e?.message || 'erro desconhecido'))
    }
  }
  async function baixarDoc(d: Doc) {
    const r = await urlDownloadDocumento(d.id)
    if (!r.ok || !r.url) return toast.error(r.error || 'Falha ao gerar o link.')
    window.open(r.url, '_blank')
  }
  async function renomearDoc(d: Doc) {
    const titulo = await pedirTexto({ titulo: 'Renomear documento', valorInicial: d.titulo, confirmar: 'Salvar' })
    if (!titulo) return
    const r = await renomearDocumento(d.id, titulo); if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success('Renomeado.'); carregar(pastaAtual)
  }
  async function moverDoc(d: Doc, pastaId: string | null) {
    const r = await moverDocumento(d.id, pastaId); if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success('Documento movido.'); carregar(pastaAtual)
  }
  async function arquivarDoc(d: Doc) {
    if (!(await confirmar({ titulo: 'Arquivar documento?', mensagem: `"${d.titulo}" deixa de aparecer para os alunos.`, confirmar: 'Arquivar', destrutivo: true }))) return
    const r = await removerDocumento(d.id); if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success('Documento arquivado.'); carregar(pastaAtual)
  }
  async function duplicarDoc(d: Doc) {
    const t = toast.loading('Criando cópia…')
    const r = await duplicarDocumento(d.id)
    toast.dismiss(t)
    if (!r.ok) return toast.error(r.error || 'Falha ao copiar.')
    toast.success('Cópia criada.'); carregar(pastaAtual)
  }

  // ── Dados derivados para a busca estilo Drive ──
  const caminhoAtual = breadcrumb.map((b) => b.nome).join(' › ') || 'Início'
  const tiposChip: OpcaoChip[] = [
    { k: 'todos', label: 'Todos', ativo: tipo === 'todos' },
    { k: 'docx', label: 'Documentos', ativo: tipo === 'docx' },
    { k: 'pdf', label: 'PDF', ativo: tipo === 'pdf' },
  ]
  const statusChip: OpcaoChip[] = [
    { k: 'todos', label: 'Qualquer status', ativo: filtro === 'todos' },
    { k: 'publicado', label: 'Publicado', ativo: filtro === 'publicado' },
    { k: 'rascunho', label: 'Rascunho', ativo: filtro === 'rascunho' },
    { k: 'arquivado', label: 'Arquivado', ativo: filtro === 'arquivado' },
  ]
  const sugestoesBusca: SugestaoBusca[] = busca.trim()
    ? docsFiltrados.slice(0, 5).map((d) => ({ id: d.id, kind: docKind(d.tipo_origem), titulo: d.titulo, caminho: caminhoAtual }))
    : []
  const resultadosBusca: ResultadoBusca[] = docsFiltrados.map((d) => ({
    id: d.id, kind: docKind(d.tipo_origem), titulo: d.titulo, caminho: caminhoAtual, status: <BadgeStatus s={d.status} />,
  }))

  return (
    <div className="w-full space-y-5">
      <DrivePastaStyles />
      <DriveAcessoStyles />
      <DriveNovoStyles />

      {/* Cabeçalho: voltar redondo (só dentro de pasta) + breadcrumb + título + resumo + ações */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {pastaAtual !== null && (
            <button
              onClick={() => carregar(breadcrumb.length >= 2 ? breadcrumb[breadcrumb.length - 2].id : null)}
              title="Voltar para a pasta anterior" aria-label="Voltar"
              className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:-translate-x-0.5 hover:bg-muted hover:text-foreground"
            ><ChevronLeft className="h-5 w-5" /></button>
          )}
          <div className="min-w-0">
            <nav className="mb-0.5 flex flex-wrap items-center gap-1 text-xs">
              <button onClick={() => carregar(null)} className={`rounded px-1.5 py-0.5 hover:bg-muted ${pastaAtual === null ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{ehModelo ? 'Modelos' : ehJurisclub ? 'JurisClub' : 'Biblioteca'}</button>
              {breadcrumb.map((b) => (
                <span key={b.id} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <button onClick={() => carregar(b.id)} className={`rounded px-1.5 py-0.5 hover:bg-muted ${pastaAtual === b.id ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{b.nome}</button>
                </span>
              ))}
            </nav>
            <h1 className="truncate text-2xl font-bold tracking-tight text-primary">
              {ehModelo
                ? 'Modelos de Caderno (OnlyOffice)'
                : pastaAtual && breadcrumb.length
                  ? breadcrumb[breadcrumb.length - 1].nome
                  : 'Biblioteca de Conteúdos'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {ehModelo
                ? 'Modelos de caderno em .docx, editados 100% no OnlyOffice — organização em Drive (pastas).'
                : pastaAtual
                  ? `${pastas.length} ${pastas.length === 1 ? 'pasta' : 'pastas'} · ${docs.length} ${docs.length === 1 ? 'material' : 'materiais'} · entrega a ${resumo.nGrupos} ${resumo.nGrupos === 1 ? 'grupo' : 'grupos'} e ${resumo.nAlunos} ${resumo.nAlunos === 1 ? 'aluno' : 'alunos'}`
                  : ehJurisclub
                    ? `${pastas.length} ${pastas.length === 1 ? 'pasta' : 'pastas'} · materiais produzidos para o JurisClub — entregues aos alunos pelo gerenciador de produtos`
                    : `${pastas.length} ${pastas.length === 1 ? 'pasta' : 'pastas'} · documentos versionados — os grifos sobrevivem às edições`}
            </p>
          </div>
        </div>
        {/* Menu "Novo" ACIMA da busca (z-index do menu fica acima da barra) */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Modelos de caderno não têm aluno (só admin): sem "Gerenciar acessos". */}
          {!ehModelo && <button onClick={abrirGerenciarAcessos} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"><Users2 className="h-4 w-4" />Gerenciar acessos</button>}
          <DriveNovoButton
            rotuloBranco={ehModelo ? 'Modelo em branco' : 'Documento em branco'}
            onNovaPasta={async (nome, cor) => {
              const r = await criarPasta(nome, pastaAtual, categoria)
              if (!r.ok) return toast.error(r.error || 'Falha ao criar a pasta.')
              if (cor && r.id) await definirCorPasta(r.id, cor)
              toast.success('Pasta criada.'); carregar(pastaAtual)
            }}
            onUploadArquivos={(files) => importarArquivos(files, false)}
            onUploadPasta={(files) => importarArquivos(files, true)}
            onDocumentoBranco={novoBranco}
            onNovoQuestoes={ehModelo || ehJurisclub ? undefined : novoConjuntoQuestoes}
            onToast={(m) => toast.message(m)}
          />
        </div>
      </div>

      {/* Abas da coleção (sublinhado): Conteúdos | JurisClub — logo abaixo do título. Modelos tem entrada própria no menu. */}
      {!ehModelo && (
        <div role="tablist" aria-label="Coleção da biblioteca" className="flex gap-1 border-b">
          {([['conteudo', 'Conteúdos'], ['jurisclub', 'JurisClub']] as [Categoria, string][]).map(([k, label]) => (
            <button
              key={k} role="tab" aria-selected={categoria === k}
              onClick={() => {
                if (categoria === k) return
                // Troca de coleção 100% no cliente (sem round-trip do RSC): o efeito [categoria] recarrega a árvore;
                // a URL acompanha via history (Next sincroniza o useSearchParams).
                setBusca(''); setBuscaAtiva(null); setFiltro('todos'); setCategoria(k)
                try { window.history.replaceState({ ...(window.history.state || {}) }, '', k === 'jurisclub' ? '/admin/biblioteca?tab=jurisclub' : '/admin/biblioteca') } catch { /* no-op */ }
              }}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${categoria === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >{label}</button>
          ))}
        </div>
      )}

      {/* Busca estilo Drive (Ctrl/⌘+K) */}
      <BuscaDrive
        valor={busca}
        onValor={setBusca}
        onSubmit={(t) => setBuscaAtiva(t)}
        onLimpar={() => { setBusca(''); setBuscaAtiva(null) }}
        tipos={tiposChip}
        onTipo={(k) => setTipo(k as TipoFiltro)}
        status={statusChip}
        onStatus={(k) => setFiltro(k as StatusFiltro)}
        sugestoes={sugestoesBusca}
        onAbrirSugestao={(s) => setDetalheId(s.id)}
        escopoLabel={ehModelo ? 'Modelos' : ehJurisclub ? 'Todo o JurisClub' : 'Toda a biblioteca'}
        placeholder={ehModelo ? 'Buscar modelos pelo título…' : 'Buscar na biblioteca — títulos, pastas…'}
      />

      {/* Filtros por tipo (esq.) + ordenar/view (dir.) — ocultos na tela de resultados */}
      {buscaAtiva === null && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {([['todos', 'Todos'], ['docx', 'Documentos'], ['pdf', 'PDF']] as [TipoFiltro, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setTipo(k)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${tipo === k ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as StatusFiltro)} aria-label="Filtrar por status" className="h-9 rounded-lg border bg-background px-2.5 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <option value="todos">Status: todos</option>
              <option value="publicado">Publicado</option>
              <option value="rascunho">Rascunho</option>
              <option value="arquivado">Arquivado</option>
            </select>
            <select value={ordenar} onChange={(e) => setOrdenar(e.target.value as Ordenar)} aria-label="Ordenar" className="h-9 rounded-lg border bg-background px-2.5 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <option value="atualizados">Ordenar: Atualizados</option>
              <option value="criados">Ordenar: Criados</option>
              <option value="nome">Ordenar: Nome</option>
            </select>
            <button
              type="button" aria-pressed={modoSel}
              onClick={() => { if (modoSel) sairSelecao(); else setModoSel(true) }}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${modoSel ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            ><SquareCheckBig className="h-4 w-4" />Selecionar</button>
            <div className="flex items-center rounded-lg border p-0.5">
              <button onClick={() => setView('grid')} aria-label="Grade" className={`rounded-md p-1.5 ${view === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}><LayoutGrid className="h-4 w-4" /></button>
              <button onClick={() => setView('lista')} aria-label="Lista" className={`rounded-md p-1.5 ${view === 'lista' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}><ListIcon className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      )}

      {/* Colunas + Filtros por metadado + Planilha (exportar/importar) — só na coleção de conteúdos */}
      {buscaAtiva === null && !ehModelo && (
        <BarraMetadados
          docIds={docs.map((d) => d.id)}
          metadados={metadados}
          colunas={colunas}
          onColunas={setColunas}
          filtros={filtrosMeta}
          onFiltros={setFiltrosMeta}
          pastaId={pastaAtual}
          categoria={categoria}
          escopoRotulo={pastaAtual ? `a pasta “${breadcrumb[breadcrumb.length - 1]?.nome ?? ''}” (e subpastas)` : ehJurisclub ? 'todo o JurisClub' : 'toda a biblioteca'}
          onImportado={() => carregar(pastaAtual)}
        />
      )}

      {carregando ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando…</div>
      ) : buscaAtiva !== null ? (
        <ResultadosBusca
          termo={buscaAtiva}
          resultados={resultadosBusca}
          onAbrir={(r) => setDetalheId(r.id)}
          onLimpar={() => { setBusca(''); setBuscaAtiva(null) }}
          voltarLabel={pastaAtual ? (breadcrumb[breadcrumb.length - 1]?.nome ?? undefined) : undefined}
        />
      ) : (
        <div className="space-y-5">
          {/* Pastas */}
          {pastas.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><Folder className="h-4 w-4" />Pastas</span>
                  <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">{pastas.length}</span>
                </div>
                <button onClick={novaPasta} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><FolderPlus className="h-3.5 w-3.5" />Nova pasta</button>
              </div>
              <div style={cardGrid(FOLDER_MIN, 12)}>
                {pastas.map((p) => (
                  <CardPasta
                    key={p.id}
                    nome={p.nome}
                    cor={p.cor ?? null}
                    capaUrl={p.capa_url ?? null}
                    contagem={contagens[p.id] != null ? `${contagens[p.id]} ${contagens[p.id] === 1 ? 'item' : 'itens'}` : undefined}
                    pilulas={(restritasPasta[p.id] || p.disciplina_id || p.cronograma_tipo_material) ? (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {restritasPasta[p.id] && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400"><Lock className="h-3 w-3" />Restrito</span>}
                        <SeloCronograma p={p} />
                      </span>
                    ) : undefined}
                    onClick={() => carregar(p.id)}
                    selecao={modoSel ? { marcado: selPastas.sel.has(p.id), onToggle: (sh) => selPastas.alternar(p.id, sh, ordemPastas), rotulo: `Selecionar pasta ${p.nome}` } : undefined}
                    acoes={
                      <MenuPasta
                        p={p}
                        categoria={categoria}
                        ancestralEhDisciplina={breadcrumb.some((b) => !!b.disciplina_id)}
                        onAbrir={() => carregar(p.id)}
                        onAcesso={() => setAcessoDrive({ id: p.id, nome: p.nome })}
                        onCapaPagina={() => setCapaDlg({ tipo: 'pasta', id: p.id })}
                        onRenomear={() => renomear(p)}
                        onMudarCor={(c) => mudarCorPasta(p, c)}
                        onMover={(dest) => moverPastaFn(p, dest)}
                        onCopiarLink={() => { navigator.clipboard?.writeText(window.location.href).catch(() => {}); toast.success(`Link de "${p.nome}" copiado.`) }}
                        onExcluir={() => excluirPasta(p)}
                        onDisciplinaCron={(cls) => marcarDisciplinaCron(p, cls)}
                        onRemoverDisciplinaCron={() => removerDisciplinaCron(p)}
                        onTipoMaterialCron={(t) => definirTipoMaterialCron(p, t)}
                        onLegendaTabela={(o) => definirLegendaTabela(p, o)}
                        onConfigurar={ehModelo ? undefined : () => configurarPasta(p)}
                      />
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {/* Divisória Pastas / Documentos (também dentro de pastas) */}
          {pastas.length > 0 && docsFiltrados.length > 0 && <div className="border-t" />}

          {/* Documentos */}
          <section>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><FileText className="h-4 w-4" />{ehModelo ? 'Modelos' : 'Documentos'}</span>
              <span className="rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-bold text-primary">{docsFiltrados.length}</span>
            </div>
            {docsFiltrados.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-muted/30 px-6 py-14 text-center text-sm text-muted-foreground">
                {ehModelo ? 'Nenhum modelo aqui. Crie um a partir de um .docx — você edita no OnlyOffice.' : 'Nenhum documento aqui. Use o botão “Novo” para enviar um arquivo.'}
              </div>
            ) : view === 'grid' ? (
              <div style={cardGrid(POSTER_MIN, 12)}>
                {docsFiltrados.map((d) => (
                  <DocCard
                    key={d.id}
                    d={d}
                    categoria={categoria}
                    thumbInicial={thumbs[d.id]}
                    restrito={restritoDoc[d.id]}
                    selecao={modoSel ? { marcado: selDocs.sel.has(d.id), onToggle: (sh) => selDocs.alternar(d.id, sh, ordemDocs), rotulo: `Selecionar ${d.titulo}` } : undefined}
                    onAbrir={() => { if (d.tipo_origem === 'questoes') { routerTopo.push(`/admin/biblioteca/conteudo/${d.id}/gerenciar`) } else setDetalheId(d.id) }}
                    onAcesso={() => setAcessoDoc(d)}
                    onCapaPagina={() => setCapaDlg({ tipo: 'documento', id: d.id })}
                    onEditarOffice={() => editarDocOffice(d)}
                    onBaixar={() => baixarDoc(d)}
                    onRenomear={() => renomearDoc(d)}
                    onMover={(p) => moverDoc(d, p)}
                    onArquivar={() => arquivarDoc(d)}
                    onDuplicar={() => duplicarDoc(d)}
                  />
                ))}
              </div>
            ) : (
              // Rolagem LATERAL: com muitas colunas a tabela não estoura o layout — o nome (esq.) e o menu "⋮"
              // (dir.) ficam fixos enquanto as colunas do meio rolam.
              <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
                <table className="w-full min-w-max text-sm">
                  <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="sticky left-0 z-10 bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))] px-4 py-2.5 font-semibold shadow-[inset_-1px_0_0_var(--border)]">
                        <span className="flex items-center gap-2">
                          <CheckSelecao marcado={ordemDocs.length > 0 && ordemDocs.every((i) => selDocs.sel.has(i)) ? true : ordemDocs.some((i) => selDocs.sel.has(i)) ? 'mixed' : false} onToggle={() => { setModoSel(true); selDocs.todos(ordemDocs) }} rotulo="Selecionar todos os documentos da lista" />
                          Documento
                        </span>
                      </th>
                      {colunas.tipo && <th className="px-4 py-2.5 text-center font-semibold">Tipo</th>}
                      {!ehModelo && colunas.status && <th className="px-4 py-2.5 text-center font-semibold">Status</th>}
                      {!ehModelo && CAMPOS_META.map((c) => colunas[c.k] && <th key={c.k} className="whitespace-nowrap px-4 py-2.5 font-semibold">{c.rot}</th>)}
                      {!ehModelo && colunas.atualizado_em && <th className="whitespace-nowrap px-4 py-2.5 font-semibold">Atualização</th>}
                      <th className="sticky right-0 z-10 w-10 bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))] shadow-[inset_1px_0_0_var(--border)]" />
                    </tr>
                  </thead>
                  <tbody>
                    {docsFiltrados.map((d) => {
                      const Icone = ICONE_TIPO[d.tipo_origem] ?? FileText
                      return (
                        <tr key={d.id} onClick={(e) => { if (modoSel) selDocs.alternar(d.id, e.shiftKey, ordemDocs); else setDetalheId(d.id) }} aria-selected={modoSel ? selDocs.sel.has(d.id) : undefined} className={`group cursor-pointer border-b last:border-0 hover:bg-muted/40 ${modoSel && selDocs.sel.has(d.id) ? 'bg-primary/5' : ''}`}>
                          <td className="sticky left-0 z-10 min-w-[16rem] max-w-[26rem] bg-card px-4 py-2.5 shadow-[inset_-1px_0_0_var(--border)] group-hover:bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))]"><span className="flex items-center gap-2"><CheckSelecao marcado={selDocs.sel.has(d.id)} onToggle={(sh) => { setModoSel(true); selDocs.alternar(d.id, sh, ordemDocs) }} rotulo={`Selecionar ${d.titulo}`} /><Icone className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 truncate font-medium" title={d.titulo}>{d.titulo}</span></span></td>
                          {colunas.tipo && <td className="px-4 py-2.5 text-center"><SeloTipo kind={docKind(d.tipo_origem)} tamanho="sm" /></td>}
                          {!ehModelo && colunas.status && <td className="px-4 py-2.5 text-center"><BadgeStatus s={d.status} /></td>}
                          {!ehModelo && CAMPOS_META.map((c) => colunas[c.k] && (
                            c.k === 'selos' ? (
                              <td key={c.k} className="px-4 py-2.5" title={textoMeta(metadados[d.id], 'selos')}>
                                {listaMulti(metadados[d.id]?.selos).length ? (
                                  <div className="flex max-w-[18rem] gap-1 overflow-hidden">
                                    {listaMulti(metadados[d.id]?.selos).map((s) => <span key={s} className="whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{s}</span>)}
                                  </div>
                                ) : <span className="text-muted-foreground opacity-40">—</span>}
                              </td>
                            ) : (
                              <td key={c.k} className="max-w-[16rem] truncate px-4 py-2.5 text-muted-foreground" title={textoMeta(metadados[d.id], c.k)}>{textoMeta(metadados[d.id], c.k) || <span className="opacity-40">—</span>}</td>
                            )
                          ))}
                          {!ehModelo && colunas.atualizado_em && <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-muted-foreground">{formatBrt(d.atualizado_em) ?? '—'}</td>}
                          <td className="sticky right-0 z-10 bg-card px-2 py-2.5 text-right shadow-[inset_1px_0_0_var(--border)] group-hover:bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))]" onClick={(e) => e.stopPropagation()}>
                            <MenuDoc d={d} categoria={categoria} onAbrir={() => setDetalheId(d.id)} onAcesso={() => setAcessoDoc(d)} onCapaPagina={() => setCapaDlg({ tipo: 'documento', id: d.id })} onEditarOffice={() => editarDocOffice(d)} onBaixar={() => baixarDoc(d)} onRenomear={() => renomearDoc(d)} onMover={(p) => moverDoc(d, p)} onArquivar={() => arquivarDoc(d)} onDuplicar={() => duplicarDoc(d)} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {modoSel && !loteDlg && !regAtualizacao && (
        <BarraLote
          nDocs={nSelDocs} nPastas={nSelPastas} totalVisivel={totalVisivel} todosMarcados={todosMarcados} ehModelo={ehModelo}
          onTodos={selecionarTodos} onLimpar={limparSelecao} onSair={sairSelecao} onAcao={acaoLote}
        />
      )}
      {loteDlg && (
        <LoteDialog
          titulo={loteDlg.titulo} alvoBase={loteDlg.alvo} secoes={loteDlg.secoes} config={loteDlg.config} inicial={loteDlg.inicial} ehModelo={ehModelo}
          pausado={!!capaDlg || !!regAtualizacao}
          onFechar={() => setLoteDlg(null)} onConcluido={loteConcluido}
          onCapa={loteDlg.alvo.pastaIds.length === 1 && !ehModelo ? () => setCapaDlg({ tipo: 'pasta', id: loteDlg.alvo.pastaIds[0] }) : undefined}
          onAtualizacao={(alvo) => setRegAtualizacao(alvo)}
        />
      )}
      {regAtualizacao && <RegistrarAtualizacaoLote alvo={regAtualizacao} onFechar={() => setRegAtualizacao(null)} onDone={() => { carregar(pastaAtual) }} />}
      {capaDlg && <CapaPaginaDialog alvo={capaDlg} onFechar={() => setCapaDlg(null)} onSalvo={() => carregar(pastaAtual)} />}
      {acessoDrive && <DriveAcessoWrapper pastaId={acessoDrive.id} categoria={categoria} onFechar={() => setAcessoDrive(null)} />}
      {uploads && uploads.length > 0 && <DriveUploadPanel itens={uploads} onClose={() => setUploads(null)}
        onRetry={(id) => { if (uploadFilesRef.current.has(id)) void tentarDeNovo([id]) }}
        onRetryTodos={() => void tentarDeNovo(uploads.filter((x) => x.status === 'erro' && uploadFilesRef.current.has(x.id)).map((x) => x.id))} />}
      {importAberto && <ImportDialog pastaId={pastaAtual} categoria={categoria} onFechar={() => setImportAberto(false)} onPronto={() => { setImportAberto(false); carregar(pastaAtual) }} />}
      {detalheId && (
        <BibliotecaDocSidebar
          documentoId={detalheId}
          pastaLabel={breadcrumb.map((b) => b.nome).join(' · ') || 'Início'}
          onFechar={() => setDetalheId(null)}
          onMudou={() => carregar(pastaAtual)}
          onGerenciarAcesso={() => { const dd = docs.find((x) => x.id === detalheId); if (dd) setAcessoDoc(dd) }}
          onEditarOffice={() => { const dd = docs.find((x) => x.id === detalheId); if (dd) editarDocOffice(dd) }}
          onBaixar={() => { const dd = docs.find((x) => x.id === detalheId); if (dd) baixarDoc(dd) }}
          semAcesso={ehModelo}
        />
      )}
      {acessoPasta && (
        <Overlay onFechar={() => setAcessoPasta(null)} largura="max-w-3xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Acesso dos alunos — pasta “{acessoPasta.nome}”</h2>
            <button onClick={() => setAcessoPasta(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">Sem nenhum grupo/aluno marcado = <strong>liberado para todos</strong>. Bloquear esta pasta esconde também as subpastas e documentos dentro dela.</p>
          <ModuloAcesso pastaId={acessoPasta.id} area="biblioteca" />
        </Overlay>
      )}
      {acessoDoc && (
        <Overlay onFechar={() => setAcessoDoc(null)} largura="max-w-3xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Acesso dos alunos — documento “{acessoDoc.titulo}”</h2>
            <button onClick={() => setAcessoDoc(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">Sem nenhum grupo/aluno marcado = <strong>liberado para todos</strong> (respeitando o acesso das pastas acima).</p>
          <DocumentoAcesso documentoId={acessoDoc.id} />
        </Overlay>
      )}
      {gerenciarAberto && (
        <GerenciarAcessosDialog
          raizId={pastaAtual}
          raizNome={pastaAtual ? (breadcrumb[breadcrumb.length - 1]?.nome ?? 'Pasta atual') : 'Biblioteca inteira'}
          categoria={categoria}
          onFechar={() => setGerenciarAberto(false)}
        />
      )}
    </div>
  )
}


/** Card de documento (grid) — CardConteudo + selo por tipo + capa lazy (thumb docx) + menu "…". */
function DocCard({ d, categoria, thumbInicial, restrito, selecao, onAbrir, onAcesso, onCapaPagina, onEditarOffice, onBaixar, onRenomear, onMover, onArquivar, onDuplicar }: {
  d: Doc; categoria: Categoria; thumbInicial?: string; restrito?: boolean
  selecao?: { marcado: boolean; onToggle: (shift: boolean) => void; rotulo?: string }
  onAbrir: () => void; onAcesso: () => void; onCapaPagina: () => void; onEditarOffice: () => void; onBaixar: () => void
  onRenomear: () => void; onMover: (pastaId: string | null) => void; onArquivar: () => void; onDuplicar: () => void
}) {
  const kind = docKind(d.tipo_origem)
  // Capa fiel (1ª página docx) carregada LAZY pela rota (só cache; NUNCA gera OnlyOffice no render → acaba
  // com o "thundering herd" de conversões ao abrir a pasta). Uncached → 404 → placeholder do tipo.
  const capaUrl = thumbInicial ?? (d.tipo_origem === 'docx' && d.versao_atual_id ? `/api/admin/biblioteca/capa/${d.versao_atual_id}` : undefined)
  return (
    <CardConteudo
      kind={kind}
      titulo={d.titulo}
      capaUrl={capaUrl}
      onClick={onAbrir}
      selecao={selecao}
      pilulas={categoria === 'modelo_caderno' ? undefined : <><BadgeStatus s={d.status} /><AccessLabel restrito={restrito} /></>}
      acoes={<MenuDoc d={d} categoria={categoria} onAbrir={onAbrir} onAcesso={onAcesso} onCapaPagina={onCapaPagina} onEditarOffice={onEditarOffice} onBaixar={onBaixar} onRenomear={onRenomear} onMover={onMover} onArquivar={onArquivar} onDuplicar={onDuplicar} />}
    />
  )
}




const INP = 'h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30'
const FILE_INPUT = 'block w-full cursor-pointer text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground file:transition-opacity hover:file:opacity-90'

function ImportDialog({ pastaId, categoria, onFechar, onPronto }: { pastaId: string | null; categoria: Categoria; onFechar: () => void; onPronto: () => void }) {
  const ehModelo = categoria === 'modelo_caderno'
  const [titulo, setTitulo] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar() {
    if (!titulo.trim() || !arquivo) { toast.error('Preencha o título e escolha um arquivo.'); return }
    setEnviando(true)
    try {
      const dataBase64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(arquivo) })
      const r = await importarDocumento({ titulo, pastaId, nomeArquivo: arquivo.name, mime: arquivo.type, dataBase64, categoria })
      if (!r.ok) { toast.error(r.error || 'Falha ao importar.'); setEnviando(false); return }
      toast.success(`Importado — ${r.trechos ?? 0} trechos estruturados.`); onPronto()
    } catch (e) { toast.error(`Falha ao importar: ${(e as Error)?.message || 'não foi possível ler/enviar o arquivo'}`); setEnviando(false) }
  }

  return (
    <Overlay onFechar={onFechar}>
      <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{ehModelo ? 'Novo modelo de caderno (.docx)' : 'Importar documento'}</h2><button onClick={onFechar} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button></div>
      <div className="space-y-3">
        <Campo rotulo="Título"><input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={INP} placeholder={ehModelo ? 'Ex.: Modelo de diagnóstico AGU' : 'Ex.: Lei Seca — Direito Constitucional'} /></Campo>
        <p className="text-xs text-muted-foreground">A origem é registrada automaticamente com a sua conta.</p>
        <Campo rotulo={ehModelo ? 'Arquivo .docx (editável no OnlyOffice)' : 'Arquivo (.docx, .pdf ou .html)'}>
          <input type="file" accept={ehModelo ? '.docx' : '.docx,.pdf,.html,.htm'} onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            setArquivo(f)
            // Se nenhum título foi digitado, puxa o nome do arquivo (sem a extensão) como título.
            if (f && !titulo.trim()) setTitulo(f.name.replace(/\.[^.]+$/, ''))
          }} className={FILE_INPUT} />
        </Campo>
        {ehModelo && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">O modelo é editado 100% no OnlyOffice. Use .docx para poder editar depois.</p>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onFechar} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">Cancelar</button>
        <button onClick={enviar} disabled={enviando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">{enviando && <Loader2 className="h-4 w-4 animate-spin" />}Importar</button>
      </div>
    </Overlay>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{rotulo}</span>{children}</label>
}

type AbaDetalhe = 'versoes' | 'detalhes'

function DetalheDialog({ documentoId, pdfUrlInicial, capaInicial, onFechar, onMudou }: { documentoId: string; pdfUrlInicial?: string; capaInicial?: string; onFechar: () => void; onMudou: () => void }) {
  const [dados, setDados] = useState<Awaited<ReturnType<typeof detalheDocumento>> | null>(null)
  const [novaVersao, setNovaVersao] = useState<File | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aba, setAba] = useState<AbaDetalhe>('versoes')
  async function recarregar() { setDados(await detalheDocumento(documentoId)) }
  // A prévia inline usa o CONTEÚDO (PreviaConteudo), não o OnlyOffice — então NÃO carregamos mais
  // dadosVisualizacao nem pré-aquecemos o api.js do OnlyOffice ao abrir (era o que deixava lento/falho).
  useEffect(() => { recarregar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [documentoId])
  useEffect(() => { const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar(); document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc) }, [onFechar])

  async function enviarVersao(publicar: boolean) {
    if (!novaVersao) { toast.error('Escolha um arquivo.'); return }
    setOcupado(true)
    try {
      const dataBase64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(novaVersao) })
      const r = await publicarNovaVersao({ documentoId, nomeArquivo: novaVersao.name, mime: novaVersao.type, dataBase64, publicar })
      if (!r.ok) { toast.error(r.error || 'Falha.'); setOcupado(false); return }
      const rc = r.reconc
      toast.success(`Nova versão — ${rc?.carregados ?? 0} trechos mantidos, ${rc?.novos ?? 0} novos. Anotações: ${rc?.anotacoes?.alteradas ?? 0} alteradas, ${rc?.anotacoes?.orfas ?? 0} órfãs.`)
      setNovaVersao(null); await recarregar(); onMudou()
    } catch { toast.error('Falha ao ler o arquivo.') } finally { setOcupado(false) }
  }
  async function publicar(versaoId: string) {
    setOcupado(true); const r = await publicarDocumento(documentoId, versaoId); setOcupado(false)
    if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success('Versão publicada.'); await recarregar(); onMudou()
  }
  async function excluir() {
    if (!(await confirmar({ titulo: 'Arquivar documento?', mensagem: 'Ele deixa de aparecer para os alunos.', confirmar: 'Arquivar', destrutivo: true }))) return
    const r = await removerDocumento(documentoId); if (!r.ok) return toast.error(r.error || 'Falha.')
    toast.success('Documento arquivado.'); onMudou(); onFechar()
  }
  async function editarNoOffice() {
    setOcupado(true); const r = await abrirEdicaoDocx(documentoId); setOcupado(false)
    if (!r.ok || !r.versaoId) return toast.error(r.error || 'Falha ao abrir o editor.')
    window.location.href = `/admin/biblioteca/editar/${r.versaoId}?origem=${encodeURIComponent(window.location.pathname + window.location.search)}`
  }

  const doc = dados && dados.ok ? dados.doc : null
  const Icone = doc ? (ICONE_TIPO[doc.tipo_origem] ?? FileText) : FileText
  const ABAS: { k: AbaDetalhe; rotulo: string; Icone: typeof Layers }[] = [
    { k: 'versoes', rotulo: 'Versões', Icone: Layers },
    { k: 'detalhes', rotulo: 'Detalhes', Icone: Info },
  ]

  // Visualizador em tela cheia (estilo Modelos de Caderno): folha no centro + lateral direita com as informações.
  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-neutral-900/80 backdrop-blur-sm duration-200 animate-in fade-in">
      {/* Barra superior escura */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 bg-neutral-950/90 px-3 text-neutral-100">
        <div className="flex min-w-0 items-center gap-2">
          <button onClick={onFechar} aria-label="Fechar" className="cursor-pointer rounded-full p-2 text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-primary/25 text-primary-foreground"><Icone className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">{doc?.titulo ?? 'Documento'}</p>
            <p className="truncate text-[11px] uppercase leading-tight tracking-wide text-neutral-400">{doc?.tipo_origem ?? ''}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => baixarDocDireto(documentoId)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-200 ring-1 ring-white/15 transition-colors hover:bg-white/10 hover:text-white"><Download className="h-4 w-4" />Baixar</button>
          {doc?.tipo_origem === 'docx' && <button onClick={editarNoOffice} disabled={ocupado} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"><ExternalLink className="h-4 w-4" />Abrir no editor</button>}
        </div>
      </div>

      {/* Corpo: a PRÉVIA (viewer do PDF) aparece NA HORA; a lateral carrega os metadados em paralelo. */}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 bg-neutral-200 dark:bg-neutral-900">
          <PreviaFiel documentoId={documentoId} pdfUrlInicial={pdfUrlInicial} capaInicial={capaInicial} />
        </div>

        {/* INFORMAÇÕES — lateral direita (espera só os metadados, sem gatear a prévia) */}
        <aside className="flex w-[360px] max-w-[85vw] shrink-0 flex-col border-l bg-card">
          {!dados ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
          ) : !dados.ok ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-rose-500">{dados.error}</div>
          ) : (
            <>
            <div className="border-b p-4">
              <h2 className="truncate text-base font-semibold leading-tight" title={doc!.titulo}>{doc!.titulo}</h2>
              <div className="mt-1.5 flex items-center gap-2"><BadgeStatus s={doc!.status} /><span className="text-xs uppercase tracking-wide text-muted-foreground">{doc!.tipo_origem}</span></div>
            </div>

            {/* Abas (linha / sublinhado) */}
            <div className="flex items-center gap-1 border-b px-3">
              {ABAS.map(({ k, rotulo, Icone: Ic }) => (
                <button key={k} onClick={() => setAba(k)} className={`flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${aba === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                  <Ic className="h-4 w-4" />{rotulo}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {aba === 'versoes' && (
                <div className="space-y-5 p-4">
                  <div>
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Histórico de edições</div>
                    {/* Timeline: cada versão é um evento de edição (upload/editor/restauração). */}
                    <ol className="relative space-y-3 border-l pl-5">
                      {dados.versoes.map((v) => {
                        const ev = EVENTO_VERSAO[v.origem] ?? EVENTO_VERSAO.upload
                        const atual = doc!.versao_atual_id === v.id
                        return (
                          <li key={v.id} className="relative">
                            <span className={`absolute -left-[26px] top-0.5 grid h-5 w-5 place-items-center rounded-full ring-4 ring-card ${atual ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}><ev.Icone className="h-3 w-3" /></span>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold">v{v.numero}</span>
                              <span className="text-xs text-muted-foreground">{ev.rotulo}</span>
                              <StatusConv s={v.status_conversao} />
                              {atual && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Versão atual</span>}
                              {!atual && <button onClick={() => publicar(v.id)} disabled={ocupado} className="cursor-pointer rounded-md border px-2 py-0.5 text-[11px] font-medium transition hover:bg-muted disabled:opacity-60">Tornar atual</button>}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" />{formatBrt(v.criada_em) ?? '—'}</div>
                          </li>
                        )
                      })}
                    </ol>
                  </div>

                  <div className="rounded-xl border bg-muted/30 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nova versão</div>
                    <input type="file" accept=".docx,.pdf,.html,.htm" onChange={(e) => setNovaVersao(e.target.files?.[0] ?? null)} className={FILE_INPUT} />
                    <p className="mt-2 text-xs text-muted-foreground">A reconciliação carrega os uids da versão anterior — grifos sobrevivem; mudanças viram aviso.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button onClick={() => enviarVersao(false)} disabled={ocupado || !novaVersao} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:bg-muted disabled:opacity-60">{ocupado && <Loader2 className="h-4 w-4 animate-spin" />}Enviar (rascunho)</button>
                      <button onClick={() => enviarVersao(true)} disabled={ocupado || !novaVersao} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60">Enviar e publicar</button>
                    </div>
                  </div>
                </div>
              )}

              {aba === 'detalhes' && (
                <div className="space-y-6 p-4 text-sm">
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Informações</div>
                    <div className="rounded-xl border px-4">
                      <LinhaDetalhe rotulo="Título" valor={doc!.titulo} />
                      <LinhaDetalhe rotulo="Tipo" valor={doc!.tipo_origem.toUpperCase()} />
                      <LinhaDetalhe rotulo="Status" valor={<BadgeStatus s={doc!.status} />} />
                      <LinhaDetalhe rotulo="Origem" valor={doc!.fonte || '—'} />
                      <LinhaDetalhe rotulo="Licença" valor={doc!.licenca || '—'} />
                      <LinhaDetalhe rotulo="Versões" valor={String(dados.versoes.length)} />
                      <LinhaDetalhe rotulo="Criado em" valor={formatBrt(doc!.criado_em) ?? '—'} />
                      <LinhaDetalhe rotulo="Atualizado em" valor={formatBrt(doc!.atualizado_em) ?? '—'} />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Link2 className="h-3.5 w-3.5" />Onde é usado</div>
                    {dados.vinculos.length === 0 ? (
                      <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">Este documento ainda não está vinculado a nenhum produto (desafio, trilha, caderno…).</div>
                    ) : (
                      <div className="space-y-1.5">
                        {dados.vinculos.map((vc) => (
                          <div key={vc.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Link2 className="h-3.5 w-3.5" /></span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{PRODUTO_LABEL[vc.produto_tipo] ?? vc.produto_tipo}</div>
                              <div className="truncate text-[11px] text-muted-foreground" title={vc.produto_ref_id}>{vc.modo === 'fixada' ? 'Versão fixada' : 'Sempre a versão atual'} · ref {vc.produto_ref_id.slice(0, 8)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé: arquivar */}
            <div className="border-t p-3">
              <button onClick={excluir} className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10"><Trash2 className="h-4 w-4" />Arquivar documento</button>
            </div>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

async function baixarDocDireto(documentoId: string) {
  const r = await urlDownloadDocumento(documentoId)
  if (!r.ok || !r.url) return toast.error(r.error || 'Falha ao gerar o link.')
  window.open(r.url, '_blank')
}

/** Render FIEL do documento no OnlyOffice (modo leitura) — a MESMA renderização do editor/Modelos,
 *  só-leitura. Mostra o .docx com blocos/cores reais (não os trechos em texto). */
/** Prévia FIEL: a FOLHA do documento renderizada no navegador (PDF nativo / .docx via docx-preview),
 *  sem OnlyOffice. Pega a URL assinada do original e renderiza; se falhar, cai na prévia de conteúdo. */
function PreviaFiel({ documentoId, pdfUrlInicial, capaInicial }: { documentoId: string; titulo?: string; pdfUrlInicial?: string; capaInicial?: string }) {
  // Se o PDF já veio cacheado da listagem, ABRE DIRETO no viewer (sem telas de loading anteriores).
  const [capa, setCapa] = useState<string | null>(capaInicial ?? null)
  const [pdf, setPdf] = useState<string | null>(pdfUrlInicial ?? null)
  const [pdfFalhou, setPdfFalhou] = useState(false)
  // Vídeo/áudio: player nativo em vez de docx/pdf. undefined = ainda verificando; null = não é mídia.
  const [midia, setMidia] = useState<{ kind: 'video' | 'audio'; url: string } | null | undefined>(undefined)
  useEffect(() => {
    if (pdfUrlInicial) { setMidia(null); return } // PDF cacheado só existe p/ docx/pdf → nunca é mídia
    let vivo = true
    setMidia(undefined)
    midiaPreviewDocumento(documentoId)
      .then((r) => { if (!vivo) return; setMidia(r.ok && r.url && (r.kind === 'video' || r.kind === 'audio') ? { kind: r.kind, url: r.url } : null) })
      .catch(() => { if (vivo) setMidia(null) })
    return () => { vivo = false }
  }, [documentoId, pdfUrlInicial])
  useEffect(() => {
    if (pdfUrlInicial) return // já temos o PDF cacheado → nada a buscar
    if (midia !== null) return // ainda verificando ou é mídia → não dispara a conversão docx/pdf (OnlyOffice)
    let vivo = true
    setCapa(capaInicial ?? null); setPdf(null); setPdfFalhou(false)
    // 1ª página na hora (capa cacheada); em paralelo, o PDF do documento INTEIRO (OnlyOffice, cacheado) —
    // quando pronto, troca pelo visualizador de PDF nativo (carrega as páginas progressivamente).
    if (!capaInicial) thumbDocumento(documentoId).then((r) => { if (vivo && r.url) setCapa(r.url) }).catch(() => {})
    pdfPreviewDocumento(documentoId).then((r) => { if (!vivo) return; r.ok && r.url ? setPdf(r.url) : setPdfFalhou(true) }).catch(() => { if (vivo) setPdfFalhou(true) })
    return () => { vivo = false }
  }, [documentoId, pdfUrlInicial, capaInicial, midia])
  // Mídia (vídeo/áudio): player nativo com tokens — em vez do docx/pdf.
  if (midia) return (
    <div className="flex h-full w-full items-center justify-center overflow-auto bg-neutral-200 p-6 dark:bg-neutral-900">
      {midia.kind === 'video' ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={midia.url} controls preload="metadata" playsInline className="mx-auto max-h-full w-full max-w-4xl rounded-2xl border bg-black" />
      ) : (
        <div className="mx-auto w-full max-w-xl rounded-2xl border bg-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Music className="h-5 w-5" /></span>
            <div className="text-sm font-semibold text-foreground">Áudio</div>
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={midia.url} controls className="w-full" />
        </div>
      )}
    </div>
  )
  // Enquanto verifica se é mídia, evita piscar o loader/capa do PDF.
  if (midia === undefined) return <div className="flex h-full items-center justify-center gap-2 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" />Carregando prévia…</div>
  // Documento completo (PDF) pronto → visualizador nativo, progressivo e fiel.
  if (pdf) return <iframe src={pdf} className="h-full w-full border-0 bg-neutral-200 dark:bg-neutral-900" title="Documento" />
  // Enquanto o PDF converte, mostra a 1ª página (capa) já renderizada.
  if (capa) return (
    <div className="flex h-full flex-col items-center overflow-auto bg-neutral-200 p-6 dark:bg-neutral-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={capa} alt="Primeira página" className="h-auto w-full rounded-md shadow-lg" style={{ maxWidth: 820 }} />
      {!pdfFalhou && <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando o documento completo…</div>}
    </div>
  )
  // Sem capa e sem PDF (OnlyOffice fora) → conteúdo estruturado.
  if (pdfFalhou) return <PreviaConteudo documentoId={documentoId} />
  return <div className="flex h-full items-center justify-center gap-2 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" />Carregando prévia…</div>
}

/** Renderiza um .docx FIEL (páginas, fontes, tabelas) no navegador via docx-preview. */
function DocxView({ url, documentoId }: { url: string; documentoId: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<'load' | 'ok' | 'erro'>('load')
  useEffect(() => {
    let vivo = true
    setEstado('load')
    ;(async () => {
      try {
        const resp = await fetch(url)
        if (!resp.ok) throw new Error('fetch')
        const buf = await resp.arrayBuffer()
        if (!vivo || !ref.current) return
        ref.current.innerHTML = ''
        const { renderAsync } = await import('docx-preview')
        await renderAsync(buf, ref.current, undefined, { inWrapper: true, ignoreLastRenderedPageBreak: false, experimental: true, breakPages: true })
        if (vivo) setEstado('ok')
      } catch { if (vivo) setEstado('erro') }
    })()
    return () => { vivo = false }
  }, [url])
  if (estado === 'erro') return <PreviaConteudo documentoId={documentoId} />
  return (
    <div className="prev-docx h-full overflow-auto bg-neutral-200 py-6 dark:bg-neutral-900">
      {estado === 'load' && <div className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" />Renderizando a folha…</div>}
      <div ref={ref} className={estado === 'ok' ? 'block' : 'hidden'} />
      <style>{`.prev-docx .docx-wrapper{background:transparent;padding:0}.prev-docx .docx-wrapper>section.docx{margin:0 auto 16px;box-shadow:0 2px 12px rgba(0,0,0,.18)}`}</style>
    </div>
  )
}

/** Prévia do CONTEÚDO (trechos estruturados) renderizada no app — funciona sem OnlyOffice. */
function PreviaConteudo({ documentoId }: { documentoId: string }) {
  const [trechos, setTrechos] = useState<{ uid: string; tipo: string; rotulo: string | null; texto: string }[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    setTrechos(null); setErro(null)
    conteudoPreviewAdmin(documentoId)
      .then((r) => { if (!vivo) return; if (r.ok) setTrechos(r.trechos ?? []); else setErro(r.error || 'Falha ao carregar o conteúdo.') })
      .catch(() => { if (vivo) setErro('Falha ao carregar o conteúdo.') })
    return () => { vivo = false }
  }, [documentoId])
  if (erro) return <div className="flex h-full items-center justify-center p-6 text-center text-sm text-neutral-500">{erro}</div>
  if (!trechos) return <div className="flex h-full items-center justify-center gap-2 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" />Carregando conteúdo…</div>
  if (!trechos.length) return <div className="flex h-full items-center justify-center p-6 text-center text-sm text-neutral-500">Sem conteúdo estruturado nesta versão. Use “Abrir no editor” para ver o original.</div>
  return (
    <div className="h-full overflow-auto py-8">
      <article className="prev-conteudo mx-auto w-full max-w-[820px] rounded-lg bg-white px-14 py-12 text-[15px] leading-relaxed text-neutral-900 shadow-sm">
        {trechos.map((t) => (
          t.tipo === 'titulo'
            ? <h2 key={t.uid} className="mb-2 mt-5 text-2xl font-bold first:mt-0" dangerouslySetInnerHTML={{ __html: t.texto }} />
            : t.tipo === 'capitulo'
              ? <h3 key={t.uid} className="mb-1 mt-4 text-lg font-semibold text-neutral-600" dangerouslySetInnerHTML={{ __html: t.texto }} />
              : <div key={t.uid} className="mb-2" dangerouslySetInnerHTML={{ __html: t.texto }} />
        ))}
      </article>
      <style>{`.prev-conteudo img{max-width:100%;height:auto}.prev-conteudo table{border-collapse:collapse;max-width:100%}.prev-conteudo td,.prev-conteudo th{border:1px solid var(--pn-e5e7eb,#e5e7eb);padding:4px 8px}.prev-conteudo a{color:var(--pn-1d4ed8,#1d4ed8);text-decoration:underline}`}</style>
    </div>
  )
}

function VisualizadorOffice({ versaoId, documentUrl, onlyofficeUrl, chave, titulo, fileType, onErro }: {
  versaoId: string; documentUrl: string; onlyofficeUrl: string; chave: string; titulo: string; fileType: string
  onErro?: () => void
}) {
  const montado = useRef(false)
  const [erro, setErro] = useState<string | null>(null)
  const elId = `oo-view-${versaoId}`
  useEffect(() => {
    if (montado.current) return
    montado.current = true
    const scriptSrc = `${onlyofficeUrl}/web-apps/apps/api/documents/api.js`
    let vivo = true
    // Se o pai oferece fallback (docx-preview), delega a ele em vez de mostrar erro aqui.
    const falhou = (msg?: string) => { if (!vivo) return; if (onErro) onErro(); else setErro(msg || `O servidor OnlyOffice (${onlyofficeUrl}) não está acessível. Suba o OnlyOffice para ver o documento aqui, ou use “Baixar” / “Abrir no editor”.`) }
    const criar = () => {
      if (!vivo) return
      try {
        if (!window.DocsAPI) { falhou('OnlyOffice carregou, mas o DocsAPI não existe.'); return }
        const key = `${versaoId}_view_${chave}`.replace(/[^a-z0-9_-]/gi, '')
        new window.DocsAPI.DocEditor(elId, {
          documentType: fileType === 'pdf' ? 'pdf' : 'word',
          document: { fileType, key, title: `${titulo}.${fileType}`, url: documentUrl, permissions: { edit: false, download: true } },
          editorConfig: { lang: 'pt', mode: 'view', user: { id: 'admin', name: 'Admin' }, customization: { hideRightMenu: true, compactHeader: true, toolbarNoTabs: true } },
          width: '100%', height: '100%',
        })
      } catch (e) { falhou((e as Error).message) }
    }
    // Cobre também o caso do script PRÉ-AQUECIDO que já falhou (OnlyOffice fora do ar): antes ficava
    // em branco pra sempre esperando um 'load' que nunca vem. Agora: trata 'error' + timeout.
    const existente = document.querySelector(`script[src="${scriptSrc}"]`) as HTMLScriptElement | null
    if (existente && window.DocsAPI) criar()
    else if (existente) { existente.addEventListener('load', criar); existente.addEventListener('error', () => falhou()) }
    else {
      const s = document.createElement('script')
      s.src = scriptSrc; s.async = true; s.onload = criar; s.onerror = () => falhou()
      document.body.appendChild(s)
    }
    const to = setTimeout(() => { if (!window.DocsAPI) falhou() }, 9000)
    return () => { vivo = false; clearTimeout(to) }
  }, [versaoId, documentUrl, onlyofficeUrl, chave, titulo, fileType, elId])
  if (erro) return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-neutral-400">
      <p className="max-w-md">{erro}</p>
    </div>
  )
  return <div id={elId} className="h-full w-full" />
}

// Rótulos/ícones por origem de versão (o "histórico de edições") e por tipo de produto vinculado.
const EVENTO_VERSAO: Record<string, { rotulo: string; Icone: typeof Upload }> = {
  upload: { rotulo: 'Importado (upload)', Icone: Upload },
  edicao_editor: { rotulo: 'Editado no OnlyOffice', Icone: Pencil },
  restauracao: { rotulo: 'Versão restaurada', Icone: RotateCcw },
}
const PRODUTO_LABEL: Record<string, string> = {
  desafio: 'Desafio', trilha: 'Trilha', aula: 'Aula', pasta: 'Pasta',
  simulado: 'Simulado', curso: 'Curso', caderno: 'Caderno', modelo_caderno: 'Modelo de caderno',
}

function LinhaDetalhe({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</span>
      <span className="min-w-0 truncate text-right font-medium">{valor}</span>
    </div>
  )
}

function StatusConv({ s }: { s: string }) {
  const map: Record<string, string> = { ok: 'text-emerald-600 dark:text-emerald-400', pendente: 'text-muted-foreground', processando: 'text-sky-600 dark:text-sky-400', revisao_necessaria: 'text-amber-600 dark:text-amber-400', erro: 'text-destructive' }
  const label: Record<string, string> = { ok: 'estruturado', pendente: 'pendente', processando: 'processando', revisao_necessaria: 'revisar', erro: 'erro' }
  return <span className={`text-[11px] ${map[s] ?? 'text-muted-foreground'}`}>· {label[s] ?? s}</span>
}

/** Painel "Gerenciar acessos" HIERÁRQUICO: árvore (subpastas + documentos) da pasta à esquerda, com
 *  o status de acesso por nó (Todos/Restrito), e o editor de acesso do nó selecionado à direita. */
function GerenciarAcessosDialog({ raizId, raizNome, categoria, onFechar }: { raizId: string | null; raizNome: string; categoria: Categoria; onFechar: () => void }) {
  const [nodes, setNodes] = useState<NoAcesso[]>([])
  const [carregando, setCarregando] = useState(true)
  const [sel, setSel] = useState<NoAcesso | null>(null)
  async function recarregar() {
    setCarregando(true)
    const r = await carregarArvoreAcesso(raizId, categoria)
    if (r.ok) setNodes(r.nodes ?? []); else toast.error(r.error || 'Falha ao carregar a árvore.')
    setCarregando(false)
  }
  useEffect(() => { recarregar() /* eslint-disable-next-line */ }, [raizId, categoria])

  return (
    <Overlay onFechar={onFechar} largura="max-w-5xl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Gerenciar acessos</h2>
          <p className="text-xs text-muted-foreground">{raizNome} — bloquear uma pasta esconde também as subpastas e documentos dentro dela. Sem marcação = <strong>liberado a todos</strong>.</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={recarregar} className="rounded-md border p-1.5 text-muted-foreground transition hover:bg-muted" title="Atualizar status"><RotateCcw className="h-4 w-4" /></button>
          <button onClick={onFechar} className="rounded-md p-1 text-muted-foreground transition hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr]">
        {/* Árvore de pastas/documentos */}
        <div className="max-h-[62vh] overflow-auto rounded-xl border p-1">
          {carregando ? (
            <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : nodes.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">Nenhuma pasta ou documento aqui.</p>
          ) : nodes.map((n) => (
            <button
              key={`${n.tipo}:${n.id}`}
              onClick={() => setSel(n)}
              style={{ paddingLeft: 8 + n.nivel * 16 }}
              className={`flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-sm transition hover:bg-muted ${sel?.id === n.id ? 'bg-muted font-medium' : ''}`}
            >
              {n.tipo === 'pasta' ? <Folder className="h-4 w-4 shrink-0 text-primary" /> : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate" title={n.nome}>{n.nome}</span>
              {n.restrito
                ? <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">Restrito</span>
                : <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">Todos</span>}
            </button>
          ))}
        </div>
        {/* Editor de acesso do nó selecionado */}
        <div className="min-h-[320px] max-h-[62vh] overflow-auto rounded-xl border p-3">
          {!sel ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">Selecione uma pasta ou documento à esquerda para definir quem tem acesso.</div>
          ) : (
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                {sel.tipo === 'pasta' ? <Folder className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                <span className="min-w-0 truncate" title={sel.nome}>{sel.nome}</span>
              </div>
              {sel.tipo === 'pasta'
                ? <ModuloAcesso key={sel.id} pastaId={sel.id} area="biblioteca" />
                : <DocumentoAcesso key={sel.id} documentoId={sel.id} />}
            </div>
          )}
        </div>
      </div>
    </Overlay>
  )
}

