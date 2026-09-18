'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Save, Loader2, Eye, EyeOff, Upload, ClipboardPaste, PenLine, FileText,
  Bold, Italic, Underline, Heading, List, Trophy, Scale, Send, ChevronDown,
  ImagePlus, Trash2, RefreshCw, Settings2, HelpCircle, X, Layers, Replace, Check, Bell, BellOff, PencilLine, Plus, Minus,
  FilePlus2, Ban, SpellCheck,
  Strikethrough, ListOrdered, AlignLeft, AlignCenter, AlignRight, Palette, Eraser, Undo2, Redo2, RotateCcw, Captions, CaptionsOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { atualizarDocumento, publicarVersao, salvarIndiceTipos, salvarEspacamentoDocumento, type Documento, type SituacaoEditorial } from '@/app/admin/leitura/actions'
import { salvarGrifoCoresDocumento, salvarBlocosDocumento, aplicarConfigTodasAulas } from '@/app/admin/leitura/actions'
import { DEFAULT_GRIFO_CORES, type GrifoCores } from '@/lib/leitura/trilha-aparencia'
import { DEFAULT_BLOCOS, type BlocoDef } from '@/lib/leitura/blocos'
import { TIPOS_INDICE, contarTiposNoHtml } from '@/lib/leitura/indice'
import { ListTree } from 'lucide-react'
import { carregarDiffDocumento, renomearVersao } from '@/app/admin/leitura/alteracoes-actions'
import { salvarConteudoHtml, importarDocx } from '@/app/admin/leitura/upload-actions'
import { LeituraPreviewGrifos, type GrifoCtl } from '@/components/admin/leitura-preview-grifos'
import { LeituraQuestoesAdmin } from '@/components/admin/leitura-questoes-admin'

// Redimensiona a imagem no cliente → data URL leve (WebP/JPEG). Mesmo padrão do banco.
async function redimensionarImagem(file: File, max = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('canvas')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  const webp = canvas.toDataURL('image/webp', 0.9)
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.9)
}

const CORES = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']
type Modo = 'colar' | 'word' | 'editor'
const TIPOS_NORMA = ['Constituição', 'Lei', 'Lei Complementar', 'Decreto', 'Decreto-Lei', 'Medida Provisória', 'Súmula', 'Resolução', 'Portaria', 'Emenda Constitucional']
const SITUACOES: { v: SituacaoEditorial; label: string }[] = [
  { v: 'em_preparacao', label: 'Em preparação' }, { v: 'rascunho', label: 'Rascunho' }, { v: 'em_revisao', label: 'Em revisão' },
  { v: 'publicada', label: 'Publicada' }, { v: 'arquivada', label: 'Arquivada' }, { v: 'revogada', label: 'Revogada' },
]
// Tipos da atualização (relatório do aluno) — cada um com ícone p/ a lista selecionável do pop-up.
const TIPOS_ATUALIZACAO = [
  { v: 'nova_lei', label: 'Inclusão (nova lei)', Icon: FilePlus2 },
  { v: 'alteracao', label: 'Alteração', Icon: PencilLine },
  { v: 'revogacao', label: 'Revogação', Icon: Ban },
  { v: 'correcao_editorial', label: 'Correção editorial', Icon: SpellCheck },
] as const

export function LeituraEditor({ documento, htmlAtual, podeEditar, podePublicar = false, publicadaVersao = 1, temRascunhoPendente = false, versaoEdicao, abaInicial, indiceTipos: indiceTiposProp = [], espacamentoInicial = null, espacamentoTextoInicial = null, grifoCoresInicial = null, blocosInicial = null }: {
  documento: Documento; htmlAtual: string; podeEditar: boolean; podePublicar?: boolean; publicadaVersao?: number; temRascunhoPendente?: boolean; versaoEdicao?: number
  abaInicial?: 'conteudo' | 'config' | 'questoes'
  indiceTipos?: string[]
  espacamentoInicial?: number | null
  espacamentoTextoInicial?: number | null
  grifoCoresInicial?: GrifoCores | null
  blocosInicial?: BlocoDef[] | null
}) {
  const versaoAutoria = versaoEdicao ?? documento.versao
  const router = useRouter()
  // Ao criar/entrar num documento, abre já na CONFIGURAÇÃO (parte técnica): dados do card,
  // conteúdo da lei e metadados. A aba "Conteúdo" (leitura/grifos) fica a um clique.
  // A trilha (banco de aulas) faz deep-link direto p/ Conteúdo/Questões via `abaInicial`.
  const [aba, setAba] = useState<'conteudo' | 'config' | 'questoes'>(abaInicial ?? 'config')
  const [capa, setCapa] = useState<string | null>(documento.capa_url ?? null)
  const [processandoCapa, setProcessandoCapa] = useState(false)
  const capaRef = useRef<HTMLInputElement>(null)
  const [pubOpen, setPubOpen] = useState(false)
  const [pubTipo, setPubTipo] = useState('alteracao')
  const [pubDesc, setPubDesc] = useState('')
  const [publicando, setPublicando] = useState(false)
  // Já existe versão publicada? Se sim, oferece "substituir"; se não, é só a primeira publicação.
  const temVersaoPublicada = documento.publicado
  const [pubModo, setPubModo] = useState<'nova' | 'substituir'>('nova')
  const [pubAvisar, setPubAvisar] = useState(true)
  const [grifoCtl, setGrifoCtl] = useState<GrifoCtl | null>(null)
  const [pubResumo, setPubResumo] = useState<{ mod: number; add: number; rem: number } | null>(null)
  const [pubResumoLoad, setPubResumoLoad] = useState(false)
  const [titulo, setTitulo] = useState(documento.titulo)
  const [descricao, setDescricao] = useState(documento.descricao ?? '')
  const [cor, setCor] = useState(documento.cor ?? CORES[5])
  const [publicado, setPublicado] = useState(documento.publicado)
  const [desafioAtivo, setDesafioAtivo] = useState(documento.desafio_ativo)
  const [exigeFim, setExigeFim] = useState(documento.desafio_exige_fim)
  const [tempoMin, setTempoMin] = useState(documento.desafio_tempo_min ?? 0)
  // Metadados de lei (A1)
  const [materiaId, setMateriaId] = useState(documento.materia_id ?? '')
  const [tipoNorma, setTipoNorma] = useState(documento.tipo_norma ?? '')
  const [numero, setNumero] = useState(documento.numero ?? '')
  const [ano, setAno] = useState(documento.ano ?? ('' as number | ''))
  const [tituloOficial, setTituloOficial] = useState(documento.titulo_oficial ?? '')
  const [ementa, setEmenta] = useState(documento.ementa ?? '')
  const [esfera, setEsfera] = useState(documento.esfera ?? '')
  const [fonteOficial, setFonteOficial] = useState(documento.fonte_oficial ?? '')
  const [situacao, setSituacao] = useState<SituacaoEditorial>(documento.situacao_editorial ?? 'em_preparacao')
  const [savingMeta, startMeta] = useTransition()
  const [savingIndice, startIndice] = useTransition()   // indicador PRÓPRIO do Índice
  const [savingEspaco, startEspaco] = useTransition()   // indicador PRÓPRIO do Espaçamento
  const [savingCores, startCores] = useTransition()     // indicador PRÓPRIO das Cores dos grifos
  // Índice configurável: tipos disponíveis (detectados no conteúdo) × tipos selecionados (persistidos).
  const [indiceTipos, setIndiceTipos] = useState<string[]>(indiceTiposProp)
  // Espaçamento entre blocos (multiplicador) — padrão do leitor do aluno, ajustável pelo admin aqui.
  const [espacamento, setEspacamento] = useState<number>(espacamentoInicial ?? 2.2) // BLOCOS (mult; 2.2 = 100% na UI)
  const [espacamentoTexto, setEspacamentoTexto] = useState<number>(espacamentoTextoInicial ?? 1) // TEXTO (mult; 1 = 100%)
  const ajustarEspaco = (delta: number) => {
    const v = Math.max(0.6, Math.min(4.4, Math.round((espacamento + delta) * 100) / 100))
    if (v === espacamento) return
    setEspacamento(v)
    startEspaco(async () => { const r = await salvarEspacamentoDocumento(documento.id, { blocos: v }); if (!r.ok) toast.error(r.error ?? 'Erro ao salvar espaçamento') })
  }
  const ajustarEspacoTexto = (delta: number) => {
    const v = Math.max(0.5, Math.min(3, Math.round((espacamentoTexto + delta) * 100) / 100))
    if (v === espacamentoTexto) return
    setEspacamentoTexto(v)
    startEspaco(async () => { const r = await salvarEspacamentoDocumento(documento.id, { texto: v }); if (!r.ok) toast.error(r.error ?? 'Erro ao salvar espaçamento') })
  }
  // Cores dos grifos (realces + textos) — recolore os grifos inline do HTML; prévia na aba Conteúdo.
  const [grifoCores, setGrifoCores] = useState<GrifoCores>(grifoCoresInicial ?? DEFAULT_GRIFO_CORES)
  const setCorGrifo = (k: keyof GrifoCores, v: string) => {
    const next = { ...grifoCores, [k]: v }
    setGrifoCores(next)
    startCores(async () => { const r = await salvarGrifoCoresDocumento(documento.id, next); if (!r.ok) toast.error(r.error ?? 'Erro ao salvar cores') })
  }
  const resetarCores = () => { setGrifoCores(DEFAULT_GRIFO_CORES); startCores(async () => { const r = await salvarGrifoCoresDocumento(documento.id, DEFAULT_GRIFO_CORES); if (!r.ok) toast.error(r.error ?? 'Erro ao salvar cores') }) }
  const CAMPOS_GRIFO: { key: keyof GrifoCores; label: string; fundo: boolean }[] = [
    { key: 'nucleo', label: 'Núcleo', fundo: true }, { key: 'complemento', label: 'Complemento', fundo: true }, { key: 'prazo', label: 'Prazos', fundo: true },
    { key: 'excecao', label: 'Exceção', fundo: false }, { key: 'stf', label: 'STF', fundo: false }, { key: 'stj', label: 'STJ', fundo: false },
  ]
  // Blocos configuráveis (rótulo + palavras-chave + cor). Detecção data-driven em caixas.ts.
  const [savingBlocos, startBlocos] = useTransition()
  const [blocos, setBlocos] = useState<BlocoDef[]>(blocosInicial ?? DEFAULT_BLOCOS)
  const persistirBlocos = (next: BlocoDef[]) => { setBlocos(next); startBlocos(async () => { const r = await salvarBlocosDocumento(documento.id, { blocos: next }); if (!r.ok) toast.error(r.error ?? 'Erro ao salvar blocos') }) }
  const editarBloco = (id: string, patch: Partial<BlocoDef>) => persistirBlocos(blocos.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  const addBloco = () => persistirBlocos([...blocos, { id: `bloco-${Date.now().toString(36)}`, rotulo: 'Novo bloco', palavras: '', cor: '#eef1f4', corTitulo: '#111111', previa: true }])
  const removerBloco = (id: string) => persistirBlocos(blocos.filter((b) => b.id !== id))
  const resetarBlocos = () => persistirBlocos(DEFAULT_BLOCOS.map((b) => ({ ...b })))
  // Padronizar espaçamento/blocos desta aula em TODAS as outras.
  const [aplicandoTodas, startAplicarTodas] = useTransition()
  const aplicarTodasAulas = (campos: { espacamento?: boolean; blocos?: boolean }, oque: string) => {
    confirmar({ titulo: `Aplicar ${oque} a todas as aulas?`, mensagem: `Isso sobrescreve ${oque} em TODAS as outras aulas do Desafio de Lei Seca com o desta aula. Não dá pra desfazer em massa.`, confirmar: 'Aplicar a todas' }).then((ok) => {
      if (!ok) return
      startAplicarTodas(async () => { const r = await aplicarConfigTodasAulas(documento.id, campos); if (r.ok) toast.success(`Aplicado em ${r.total ?? 0} aula(s).`); else toast.error(r.error ?? 'Erro ao aplicar') })
    })
  }
  // Contagem por tipo — memoizada (cacheada enquanto o conteúdo não muda). Disponíveis = os com >0.
  const tiposContagem = useMemo(() => contarTiposNoHtml(htmlAtual), [htmlAtual])
  const tiposDisponiveis = useMemo(() => TIPOS_INDICE.filter((t) => (tiposContagem[t.tipo] ?? 0) > 0).map((t) => t.tipo), [tiposContagem])
  function alternarTipoIndice(tipo: string) {
    // Computa fora do updater (updater deve ser puro; disparar a transição dentro dele dá erro no console).
    const next = indiceTipos.includes(tipo) ? indiceTipos.filter((t) => t !== tipo) : [...indiceTipos, tipo]
    setIndiceTipos(next)
    startIndice(async () => { const r = await salvarIndiceTipos(documento.id, next); if (!r.ok) toast.error(r.error ?? 'Erro ao salvar índice') })
  }

  const [modo, setModo] = useState<Modo>('colar')
  const [htmlColar, setHtmlColar] = useState('')
  const [savingConteudo, setSavingConteudo] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const htmlFileRef = useRef<HTMLInputElement>(null)

  // Lê um arquivo .html/.htm como texto e processa (mesmo caminho do colar).
  function enviarArquivoHtml(file: File) {
    if (!/\.(html?|txt)$/i.test(file.name) && file.type !== 'text/html') { toast.error('Envie um arquivo .html'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Arquivo muito grande (máx. 5 MB).'); return }
    const reader = new FileReader()
    reader.onload = () => { const txt = String(reader.result ?? ''); setHtmlColar(txt); processarConteudo(txt) }
    reader.readAsText(file)
  }

  async function enviarCapa(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem.'); return }
    setProcessandoCapa(true)
    try { setCapa(await redimensionarImagem(file)) } catch { toast.error('Falha ao processar a imagem.') } finally { setProcessandoCapa(false) }
  }

  function salvarMeta() {
    startMeta(async () => {
      const r = await atualizarDocumento(documento.id, {
        titulo, descricao: descricao || null, cor, capa_url: capa || null, publicado,
        desafio_ativo: desafioAtivo, desafio_exige_fim: exigeFim, desafio_tempo_min: tempoMin > 0 ? tempoMin : null,
        materia_id: materiaId || null, tipo_norma: tipoNorma || null, numero: numero || null, ano: ano === '' ? null : Number(ano),
        titulo_oficial: tituloOficial || null, ementa: ementa || null, esfera: esfera || null, fonte_oficial: fonteOficial || null,
        situacao_editorial: situacao,
      })
      if (r.ok) { toast.success('Documento salvo'); router.refresh() }
      else toast.error(r.error ?? 'Erro ao salvar.')
    })
  }

  function publicar() {
    const substituir = temVersaoPublicada && pubModo === 'substituir'
    const nome = pubDesc.trim()
    setPublicando(true)
    ;(async () => {
      // Substituir é destrutivo e irreversível (sobrescreve a versão publicada, sem histórico).
      if (substituir && !(await confirmar({ titulo: 'Substituir a versão publicada?', mensagem: 'Isto sobrescreve o conteúdo da versão atual, sem criar histórico nem antes/depois. Não dá para desfazer.', confirmar: 'Substituir', destrutivo: true }))) { setPublicando(false); return }
      const r = await publicarVersao(documento.id, { tipo: pubTipo, descricao: nome || undefined, substituir, avisar: pubAvisar })
      // Garante que o NOME fique salvo na versão publicada, em QUALQUER modo/toggle.
      if (r.ok && nome && r.versao) await renomearVersao(documento.id, r.versao, nome)
      setPublicando(false)
      if (r.ok) { toast.success(substituir ? 'Versão substituída' : `Versão "${nome || r.versao}" publicada`); setPubOpen(false); setPubDesc(''); router.refresh() }
      else toast.error(r.error ?? 'Erro ao publicar.')
    })()
  }

  // Esc fecha o pop-up de publicação.
  useEffect(() => {
    if (!pubOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPubOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pubOpen])

  // Ao abrir o pop-up, carrega o RESUMO do que muda (rascunho × versão publicada).
  useEffect(() => {
    if (!pubOpen || !temVersaoPublicada) { setPubResumo(null); return }
    setPubResumoLoad(true)
    let vivo = true
    ;(async () => {
      const r = await carregarDiffDocumento(documento.id, publicadaVersao, versaoAutoria)
      if (!vivo) return
      setPubResumoLoad(false)
      setPubResumo(r.ok && r.diff ? r.diff.resumo : null)
    })()
    return () => { vivo = false }
  }, [pubOpen, temVersaoPublicada, documento.id, publicadaVersao, versaoAutoria])

  async function processarConteudo(html: string) {
    if (!html.trim()) { toast.error('Cole ou envie algum conteúdo.'); return }
    setSavingConteudo(true)
    const r = await salvarConteudoHtml(documento.id, html)
    setSavingConteudo(false)
    if (r.ok) { toast.success(`Conteúdo processado (${r.artigos ?? 0} seções detectadas)`); setHtmlColar(''); router.refresh() }
    else toast.error(r.error ?? 'Erro ao processar.')
  }

  function importarWord(file: File) {
    if (!/\.docx$/i.test(file.name)) { toast.error('Envie um arquivo .docx'); return }
    const reader = new FileReader()
    reader.onload = async () => {
      setSavingConteudo(true)
      const r = await importarDocx(documento.id, String(reader.result), file.name)
      setSavingConteudo(false)
      if (r.ok) { toast.success(`Word importado (${r.artigos ?? 0} seções detectadas)`); router.refresh() }
      else toast.error(r.error ?? 'Erro ao importar.')
    }
    reader.readAsDataURL(file)
  }

  const exec = (cmd: string, val?: string) => { document.execCommand(cmd, false, val); editorRef.current?.focus() }
  // Aplica um estilo inline (cor/tamanho) à seleção — sobrevive à sanitização (subconjunto seguro).
  const envolverEstilo = (css: string) => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { toast.message('Selecione um trecho primeiro.'); return }
    const range = sel.getRangeAt(0)
    const span = document.createElement('span')
    span.setAttribute('style', css)
    try {
      span.appendChild(range.extractContents())
      range.insertNode(span)
      sel.removeAllRanges()
    } catch {
      // Seleção que cruza fronteiras de bloco: não dá para envolver num span só. Mantém a
      // seleção e avisa (em vez de sumir em silêncio).
      toast.error('Selecione um trecho dentro de um mesmo parágrafo para aplicar cor/tamanho.')
    }
    editorRef.current?.focus()
  }
  // Limpar formatação: removeFormat NÃO tira nossos <span style> (cor/tamanho) — desembrulhamos.
  const limparFormatacao = () => {
    document.execCommand('removeFormat', false)
    const sel = window.getSelection()
    const cont = editorRef.current
    if (cont && sel && sel.rangeCount && !sel.isCollapsed) {
      const range = sel.getRangeAt(0)
      for (const s of Array.from(cont.querySelectorAll('span[style]')) as HTMLElement[]) {
        if (!range.intersectsNode(s)) continue
        const pai = s.parentNode
        while (s.firstChild) pai?.insertBefore(s.firstChild, s)
        pai?.removeChild(s)
      }
    }
    cont?.focus()
  }

  // Ao abrir a aba "Editor", carrega o conteúdo salvo (permite editar em vez de recomeçar do zero).
  useEffect(() => {
    if (modo === 'editor' && editorRef.current) {
      // styleWithCSS: alinhamento/cor via execCommand saem como `style` (que agora sobrevive à sanitização).
      try { document.execCommand('styleWithCSS', false, 'true') } catch { /* browser antigo */ }
      if (!editorRef.current.innerHTML.trim() && htmlAtual) editorRef.current.innerHTML = htmlAtual
    }
  }, [modo, htmlAtual])

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={documento.pasta_id ? `/admin/leitura?pasta=${documento.pasta_id}` : '/admin/leitura'} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <h1 className="text-xl font-bold tracking-tight">{titulo || 'Documento'}</h1>
          {temRascunhoPendente
            ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">Rascunho não publicado</span>
            : <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Publicada v{publicadaVersao}</span>}
        </div>
        {podeEditar && (
          <div className="flex items-center gap-2">
            {/* Desfazer/Refazer dos grifos (só ao editar; bloqueia quando a pilha esvazia) */}
            {grifoCtl && (
              <div className="mr-1 flex items-center gap-0.5">
                <button onMouseDown={(e) => e.preventDefault()} onClick={grifoCtl.desfazer} disabled={!grifoCtl.podeDesfazer} title="Desfazer" className="inline-flex items-center justify-center rounded-lg border p-2 text-muted-foreground transition hover:bg-muted disabled:opacity-40"><Undo2 className="h-4 w-4" /></button>
                <button onMouseDown={(e) => e.preventDefault()} onClick={grifoCtl.refazer} disabled={!grifoCtl.podeRefazer} title="Refazer" className="inline-flex items-center justify-center rounded-lg border p-2 text-muted-foreground transition hover:bg-muted disabled:opacity-40"><Redo2 className="h-4 w-4" /></button>
              </div>
            )}
            <button onClick={() => setPublicado((p) => !p)} className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors', publicado ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground')}>
              {publicado ? <><Eye className="h-4 w-4" /> Visível</> : <><EyeOff className="h-4 w-4" /> Oculto</>}
            </button>
            <button onClick={salvarMeta} disabled={savingMeta} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition hover:bg-muted disabled:opacity-50">
              {savingMeta ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
            </button>
            {podePublicar && temRascunhoPendente && (
              <button onClick={() => { setPubModo('nova'); setPubAvisar(true); setPubOpen(true) }} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
                <Send className="h-4 w-4" /> Publicar versão
              </button>
            )}
          </div>
        )}
      </div>

      {/* Publicar versão — pop-up (modal) */}
      {pubOpen && podePublicar && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setPubOpen(false)}>
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            {/* Cabeçalho */}
            <div className="flex items-start justify-between gap-3 border-b p-5">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold"><Send className="h-4 w-4 text-primary" /> Publicar</h2>
                <p className="text-xs text-muted-foreground">{temVersaoPublicada ? 'Escolha como publicar as alterações do rascunho.' : 'Primeira publicação — passa a ser o que os alunos leem.'}</p>
              </div>
              <button onClick={() => setPubOpen(false)} title="Fechar" className="rounded-lg border p-1.5 text-muted-foreground transition hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5">
              {/* Nome da versão — no TOPO; gravado na publicação, em qualquer modo */}
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Nome desta versão <span className="font-normal">(aparece na lista de versões)</span>
                <input value={pubDesc} onChange={(e) => setPubDesc(e.target.value)} placeholder="Ex.: Redação final / Alteração do art. 5º…" className="rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
              </label>

              {/* Modo de publicação (só quando há versão publicada para substituir) */}
              {temVersaoPublicada && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Como publicar</p>
                  {([
                    { v: 'nova' as const, Icon: Layers, t: 'Nova versão', badge: 'Recomendado', d: 'Cria uma versão nova e imutável. A anterior fica no histórico e o aluno pode ver o antes/depois.' },
                    { v: 'substituir' as const, Icon: Replace, t: 'Substituir a versão atual', badge: null, d: 'Sobrescreve a versão publicada, sem criar histórico nem antes/depois. Para corrigir digitação/formatação.' },
                  ]).map(({ v, Icon, t, badge, d }) => {
                    const on = pubModo === v
                    return (
                      <button key={v} type="button" onClick={() => setPubModo(v)} className={cn('flex w-full items-start gap-3 rounded-xl border p-3 text-left transition', on ? 'border-primary bg-primary/[0.06] ring-1 ring-primary' : 'hover:bg-muted')}>
                        <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-sm font-semibold">
                            {t}
                            {badge && <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{badge}</span>}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{d}</span>
                        </span>
                        <span className={cn('mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2', on ? 'border-primary bg-primary' : 'border-muted-foreground/40')}>{on && <Check className="h-2.5 w-2.5 text-primary-foreground" />}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Tipo + aviso ao aluno — só na NOVA versão / 1ª publicação */}
              {(!temVersaoPublicada || pubModo === 'nova') && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Tipo da atualização</p>
                    <div className="grid grid-cols-2 gap-2">
                      {TIPOS_ATUALIZACAO.map(({ v, label, Icon }) => {
                        const on = pubTipo === v
                        return (
                          <button key={v} type="button" onClick={() => setPubTipo(v)} title={label} className={cn('flex items-center gap-2 rounded-lg border p-2.5 text-sm transition', on ? 'border-primary bg-primary/[0.06] font-medium text-foreground ring-1 ring-primary' : 'text-muted-foreground hover:bg-muted')}>
                            <Icon className={cn('h-4 w-4 shrink-0', on && 'text-primary')} />
                            <span className="truncate">{label}</span>
                            {on && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {/* Toggle: avisar os alunos */}
                  <button type="button" onClick={() => setPubAvisar((v) => !v)} className={cn('flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition', pubAvisar ? 'border-primary/40 bg-primary/[0.04]' : 'hover:bg-muted')}>
                    {pubAvisar ? <Bell className="h-4 w-4 shrink-0 text-primary" /> : <BellOff className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">Avisar os alunos</span>
                      <span className="block text-[11px] leading-snug text-muted-foreground">{pubAvisar ? 'Mostra a pílula "lei atualizada" e o antes/depois.' : 'Publica em silêncio — sem pílula nem antes/depois.'}</span>
                    </span>
                    <span className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', pubAvisar ? 'bg-primary' : 'bg-muted-foreground/30')}>
                      <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', pubAvisar ? 'left-[18px]' : 'left-0.5')} />
                    </span>
                  </button>
                </div>
              )}

              {/* O que muda neste rascunho — abaixo dos avisos */}
              {temVersaoPublicada && (
                <div className="rounded-xl border bg-muted/30 p-3">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">O que muda neste rascunho</p>
                  {pubResumoLoad ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando…</p>
                  ) : !pubResumo ? (
                    <p className="text-xs text-muted-foreground">Não foi possível calcular o resumo.</p>
                  ) : (pubResumo.mod + pubResumo.add + pubResumo.rem === 0) ? (
                    <p className="text-xs text-muted-foreground">Sem diferença de texto — nada muda para o aluno.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300"><PencilLine className="h-3 w-3" /> {pubResumo.mod} alterado(s)</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300"><Plus className="h-3 w-3" /> {pubResumo.add} novo(s)</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 font-semibold text-rose-700 dark:text-rose-300"><Minus className="h-3 w-3" /> {pubResumo.rem} removido(s)</span>
                    </div>
                  )}
                </div>
              )}

              {/* Aviso do modo substituir */}
              {temVersaoPublicada && pubModo === 'substituir' && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
                  O conteúdo da versão publicada será <strong>sobrescrito</strong>. O aluno passa a ver o novo texto, mas <strong>não</strong> aparece como alteração no antes/depois. Anotações podem sair de lugar se o texto mudar muito.
                </p>
              )}
            </div>

            {/* Rodapé */}
            <div className="flex justify-end gap-2 border-t p-4">
              <button onClick={() => setPubOpen(false)} className="rounded-lg border px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted">Cancelar</button>
              <button onClick={publicar} disabled={publicando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                {publicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {temVersaoPublicada && pubModo === 'substituir' ? 'Substituir versão' : 'Publicar'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Abas: Configuração · Conteúdo · Questões — sublinhado animado (Configuração à esquerda).
          O "Acesso dos alunos" saiu daqui: o controle de acesso é feito na área do MÓDULO. */}
      <div className="relative flex border-b text-sm">
        {([['config', 'Configuração', Settings2], ['conteudo', 'Conteúdo', FileText], ['questoes', 'Questões', HelpCircle]] as const).map(([a, label, Icon]) => (
          <button key={a} onClick={() => setAba(a)} className={cn('flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 font-medium transition-colors', aba === a ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
        <span className="absolute bottom-[-1px] h-0.5 rounded-full bg-primary transition-all duration-300 ease-out" style={{ width: '33.333%', left: `${(aba === 'config' ? 0 : aba === 'conteudo' ? 1 : 2) * 33.333}%` }} />
      </div>

      {/* QUESTÕES: índice em blocos com inserção de questões do banco entre os artigos (Fase 2). */}
      {aba === 'questoes' && <LeituraQuestoesAdmin documentoId={documento.id} versao={versaoAutoria} html={htmlAtual} />}

      {/* CONTEÚDO: prévia grande + painel de edição de grifos ao lado */}
      {aba === 'conteudo' && (
        <LeituraPreviewGrifos documentoId={documento.id} html={htmlAtual} podeEditar={podeEditar} artigos={documento.artigos ?? 0} podeComparar={temRascunhoPendente || publicadaVersao > 1} onGrifoCtl={setGrifoCtl} versaoQuestoes={versaoAutoria} indiceTipos={indiceTipos} espacamento={espacamento} espacamentoTexto={espacamentoTexto} grifoCores={grifoCores} blocos={blocos} />
      )}

      {/* CONFIGURAÇÃO: importação de conteúdo + metadados + desafio. Personalização (capa/título/
          descrição/cor) fica no pop-up "Personalizar aula" do banco de aulas — aqui só o conteúdo. */}
      {aba === 'config' && (
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-6">
          {/* Conteúdo — importar/editar */}
          {podeEditar && (
            <section className="space-y-2">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><FileText className="h-3.5 w-3.5" /> Conteúdo da lei</p>
              <div className="mb-3 flex gap-1 rounded-lg border bg-muted/40 p-1 text-sm">
                {([['colar', 'HTML', ClipboardPaste], ['word', 'Word', Upload], ['editor', 'Editor', PenLine]] as const).map(([m, label, Icon]) => (
                  <button key={m} onClick={() => setModo(m)} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition-colors', modo === m ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
              </div>

              {modo === 'colar' && (
                <div className="space-y-2">
                  {/* Enviar arquivo .html (clique ou arraste) */}
                  <input ref={htmlFileRef} type="file" accept=".html,.htm,text/html" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarArquivoHtml(f); e.target.value = '' }} />
                  <div
                    onClick={() => !savingConteudo && htmlFileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) enviarArquivoHtml(f) }}
                    className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed py-4 text-xs text-muted-foreground transition-colors hover:border-primary hover:bg-muted/30 hover:text-foreground"
                  >
                    {savingConteudo ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                    <span>Arquivo <span className="font-medium text-foreground">.html</span> — clique ou arraste</span>
                  </div>
                  <p className="text-center text-[11px] uppercase tracking-wide text-muted-foreground">ou cole o HTML</p>
                  <textarea value={htmlColar} onChange={(e) => setHtmlColar(e.target.value)} rows={4} placeholder="Cole o HTML da lei…" className="w-full resize-y rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring" />
                  <button onClick={() => processarConteudo(htmlColar)} disabled={savingConteudo || !htmlColar.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                    {savingConteudo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Processar e salvar
                  </button>
                </div>
              )}

              {modo === 'word' && (
                <div className="space-y-2">
                  <input ref={fileRef} type="file" accept=".docx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importarWord(f); e.target.value = '' }} />
                  <button onClick={() => fileRef.current?.click()} disabled={savingConteudo} className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50">
                    {savingConteudo ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
                    Enviar arquivo .docx (Word)
                  </button>
                </div>
              )}

              {modo === 'editor' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/40 p-1">
                    <button onClick={() => exec('undo')} title="Desfazer" className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><Undo2 className="h-4 w-4" /></button>
                    <button onClick={() => exec('redo')} title="Refazer" className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><Redo2 className="h-4 w-4" /></button>
                    <span className="mx-0.5 h-5 w-px bg-border" />
                    {([['bold', Bold, 'Negrito'], ['italic', Italic, 'Itálico'], ['underline', Underline, 'Sublinhado'], ['strikeThrough', Strikethrough, 'Riscado']] as const).map(([cmd, Icon, t]) => (
                      <button key={cmd} onClick={() => exec(cmd)} title={t} className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><Icon className="h-4 w-4" /></button>
                    ))}
                    <span className="mx-0.5 h-5 w-px bg-border" />
                    <button onClick={() => exec('formatBlock', 'h2')} title="Título" className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><Heading className="h-4 w-4" /></button>
                    <button onClick={() => exec('formatBlock', 'h3')} title="Subtítulo" className="rounded-md px-1.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-card hover:text-foreground">H3</button>
                    <button onClick={() => exec('formatBlock', 'p')} title="Parágrafo" className="rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-card hover:text-foreground">P</button>
                    <span className="mx-0.5 h-5 w-px bg-border" />
                    <button onClick={() => exec('insertUnorderedList')} title="Lista" className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><List className="h-4 w-4" /></button>
                    <button onClick={() => exec('insertOrderedList')} title="Lista numerada" className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><ListOrdered className="h-4 w-4" /></button>
                    <span className="mx-0.5 h-5 w-px bg-border" />
                    <button onClick={() => exec('justifyLeft')} title="Alinhar à esquerda" className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><AlignLeft className="h-4 w-4" /></button>
                    <button onClick={() => exec('justifyCenter')} title="Centralizar" className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><AlignCenter className="h-4 w-4" /></button>
                    <button onClick={() => exec('justifyRight')} title="Alinhar à direita" className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><AlignRight className="h-4 w-4" /></button>
                    <span className="mx-0.5 h-5 w-px bg-border" />
                    <label title="Cor do texto" className="relative flex cursor-pointer items-center rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground">
                      <Palette className="h-4 w-4" />
                      <input type="color" onChange={(e) => envolverEstilo('color: ' + e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Cor do texto" />
                    </label>
                    <select
                      onChange={(e) => { if (e.target.value) envolverEstilo('font-size: ' + e.target.value); e.currentTarget.selectedIndex = 0 }}
                      title="Tamanho da fonte"
                      className="h-8 rounded-md border bg-card px-1 text-xs text-muted-foreground"
                    >
                      <option value="">Tam.</option>
                      {['14px', '16px', '18px', '20px', '24px', '28px', '32px'].map((s) => <option key={s} value={s}>{s.replace('px', '')}</option>)}
                    </select>
                    <span className="mx-0.5 h-5 w-px bg-border" />
                    <button onClick={limparFormatacao} title="Limpar formatação" className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><Eraser className="h-4 w-4" /></button>
                  </div>
                  <div ref={editorRef} contentEditable suppressContentEditableWarning className="min-h-[220px] rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-ring [&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-bold [&_ul]:ml-5 [&_ul]:list-disc" />
                  <button onClick={() => processarConteudo(editorRef.current?.innerHTML ?? '')} disabled={savingConteudo} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                    {savingConteudo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar conteúdo
                  </button>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Segunda coluna da configuração: metadados + desafio */}
        <div className="space-y-6">
          {/* Metadados da lei (A1) — recolhível */}
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground [&::-webkit-details-marker]:hidden">
              <Scale className="h-3.5 w-3.5" /> Metadados da lei
              <span className="font-normal normal-case">(matéria, tipo…)</span>
              <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground">Tipo
                  <select value={tipoNorma} onChange={(e) => setTipoNorma(e.target.value)} className="mt-1 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring">
                    <option value="">—</option>
                    {TIPOS_NORMA.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-muted-foreground">Número
                    <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="9.868" className="mt-1 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
                  </label>
                  <label className="text-xs text-muted-foreground">Ano
                    <input type="number" value={ano} onChange={(e) => setAno(e.target.value === '' ? '' : Number(e.target.value))} placeholder="1999" className="mt-1 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
                  </label>
                </div>
              </div>
              <label className="block text-xs text-muted-foreground">Título oficial
                <input value={tituloOficial} onChange={(e) => setTituloOficial(e.target.value)} placeholder="Dispõe sobre o processo e julgamento da ADI e ADC…" className="mt-1 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2.5 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
              </label>
              <label className="block text-xs text-muted-foreground">Ementa
                <textarea value={ementa} onChange={(e) => setEmenta(e.target.value)} rows={2} className="mt-1 w-full resize-none rounded-lg border bg-[var(--input-bg,transparent)] px-2.5 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground">Esfera / origem
                  <input value={esfera} onChange={(e) => setEsfera(e.target.value)} placeholder="Federal" className="mt-1 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
                </label>
                <label className="text-xs text-muted-foreground">Situação editorial
                  <select value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoEditorial)} className="mt-1 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring">
                    {SITUACOES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-xs text-muted-foreground">Fonte oficial (URL)
                <input value={fonteOficial} onChange={(e) => setFonteOficial(e.target.value)} placeholder="https://planalto.gov.br/…" className="mt-1 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2.5 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
              </label>
            </div>
          </details>

          {/* Desafio — recolhível */}
          <details className="group border-t pt-4">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground [&::-webkit-details-marker]:hidden">
              <Trophy className="h-3.5 w-3.5 text-amber-500" /> Desafio de leitura
              {desafioAtivo && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium normal-case text-amber-600 dark:text-amber-400">ativo</span>}
              <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-3 pt-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={desafioAtivo} onChange={(e) => setDesafioAtivo(e.target.checked)} className="h-4 w-4 rounded border" />
                Rastrear conclusão (aparece no relatório e na gamificação)
              </label>
              <label className={cn('flex items-center gap-2 text-sm', !desafioAtivo && 'opacity-40')}>
                <input type="checkbox" disabled={!desafioAtivo} checked={exigeFim} onChange={(e) => setExigeFim(e.target.checked)} className="h-4 w-4 rounded border" />
                Exigir ler até o fim (100%) para concluir
              </label>
              <div className={cn('flex items-center gap-2 text-sm', !desafioAtivo && 'opacity-40')}>
                <span>Tempo mínimo de leitura:</span>
                <input type="number" min={0} disabled={!desafioAtivo} value={tempoMin} onChange={(e) => setTempoMin(Math.max(0, Number(e.target.value) || 0))} className="w-16 rounded-lg border bg-[var(--input-bg,transparent)] px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring" />
                <span className="text-muted-foreground">min</span>
              </div>
            </div>
          </details>

          {/* Índice do conteúdo — recolhível. Marca quais tipos aparecem no índice (admin + aluno). */}
          <details className="group border-t pt-4">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground [&::-webkit-details-marker]:hidden">
              <ListTree className="h-3.5 w-3.5 text-primary" /> Índice do conteúdo
              {savingIndice && <Loader2 className="h-3 w-3 animate-spin" />}
              <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-2 pt-3">
              <p className="text-xs text-muted-foreground">Marque os tipos que aparecem no índice (do admin e do aluno). O sistema detecta só os que existem neste conteúdo, na ordem da hierarquia.</p>
              {tiposDisponiveis.length === 0 ? (
                <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Nenhum dispositivo detectado. Salve o conteúdo (com artigos/capítulos marcados) para configurar o índice.</p>
              ) : (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {TIPOS_INDICE.filter((t) => tiposDisponiveis.includes(t.tipo)).map((t) => (
                    <label key={t.tipo} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors', indiceTipos.includes(t.tipo) ? 'border-primary/40 bg-primary/5' : 'hover:bg-muted/40')} style={{ marginLeft: t.nivel * 12 }}>
                      <input type="checkbox" checked={indiceTipos.includes(t.tipo)} onChange={() => alternarTipoIndice(t.tipo)} className="h-4 w-4 rounded border" />
                      <span className="min-w-0 flex-1 truncate">{t.label}</span>
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">{tiposContagem[t.tipo] ?? 0}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </details>

          {/* Espaçamento — BLOCOS (caixas) e TEXTO (parágrafos), separados. Padrão que o aluno vê. */}
          <details className="group border-t pt-4">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground [&::-webkit-details-marker]:hidden">
              <ListTree className="h-3.5 w-3.5 text-primary" /> Espaçamento
              {savingEspaco && <Loader2 className="h-3 w-3 animate-spin" />}
              <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-3 pt-3">
              <p className="text-xs text-muted-foreground">Padrão para o aluno (ele pode ajustar no próprio leitor). Prévia na aba <span className="font-medium text-foreground">Conteúdo</span>.</p>
              {/* BLOCOS (entre caixas) */}
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Entre blocos (caixas)</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => ajustarEspaco(-0.22)} className="rounded-lg border p-1.5 transition hover:bg-muted" aria-label="Diminuir espaçamento dos blocos"><Minus className="h-4 w-4" /></button>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(((espacamento - 0.6) / (4.4 - 0.6)) * 100)}%` }} />
                  </div>
                  <span className="w-12 text-center text-sm font-medium tabular-nums">{Math.round(espacamento / 2.2 * 100)}%</span>
                  <button type="button" onClick={() => ajustarEspaco(0.22)} className="rounded-lg border p-1.5 transition hover:bg-muted" aria-label="Aumentar espaçamento dos blocos"><Plus className="h-4 w-4" /></button>
                </div>
              </div>
              {/* TEXTO (entre parágrafos) */}
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Entre textos (parágrafos)</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => ajustarEspacoTexto(-0.1)} className="rounded-lg border p-1.5 transition hover:bg-muted" aria-label="Diminuir espaçamento do texto"><Minus className="h-4 w-4" /></button>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(((espacamentoTexto - 0.5) / (3 - 0.5)) * 100)}%` }} />
                  </div>
                  <span className="w-12 text-center text-sm font-medium tabular-nums">{Math.round(espacamentoTexto * 100)}%</span>
                  <button type="button" onClick={() => ajustarEspacoTexto(0.1)} className="rounded-lg border p-1.5 transition hover:bg-muted" aria-label="Aumentar espaçamento do texto"><Plus className="h-4 w-4" /></button>
                </div>
              </div>
              <button type="button" onClick={() => aplicarTodasAulas({ espacamento: true }, 'o espaçamento')} disabled={aplicandoTodas} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50">
                {aplicandoTodas ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />} Aplicar a todas as aulas
              </button>
            </div>
          </details>

          {/* Cores dos grifos — recolore os grifos INLINE do HTML (por matiz); sincroniza prévia + aluno + legenda. */}
          <details className="group border-t pt-4">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground [&::-webkit-details-marker]:hidden">
              <Palette className="h-3.5 w-3.5 text-primary" /> Cores dos grifos
              {savingCores && <Loader2 className="h-3 w-3 animate-spin" />}
              <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-2 pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Realces (fundo) e cores de texto dos grifos do conteúdo. Prévia na aba <span className="font-medium text-foreground">Conteúdo</span>; vale também para o aluno e para a legenda.</p>
                <button type="button" onClick={resetarCores} className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"><RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão</button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {CAMPOS_GRIFO.map((c) => (
                  <div key={c.key} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
                    <span className="inline-flex h-6 w-9 shrink-0 items-center justify-center rounded text-[11px] font-bold" style={c.fundo ? { background: grifoCores[c.key], color: '#111' } : { color: grifoCores[c.key] }}>Aa</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{c.label} <span className="text-[11px] text-muted-foreground">{c.fundo ? '(realce)' : '(texto)'}</span></span>
                    <label className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-md border" title={`Cor de ${c.label}`}>
                      <span className="absolute inset-0" style={{ background: grifoCores[c.key] }} />
                      <input type="color" value={grifoCores[c.key]} onChange={(e) => setCorGrifo(c.key, e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`Cor de ${c.label}`} />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </details>

          {/* Blocos — lista editável (rótulo + palavras-chave + cor). Detecta no HTML e vira card colapsável. */}
          <details className="group border-t pt-4">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground [&::-webkit-details-marker]:hidden">
              <Layers className="h-3.5 w-3.5 text-primary" /> Blocos
              {savingBlocos && <Loader2 className="h-3 w-3 animate-spin" />}
              <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-2 pt-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground">Um trecho vira bloco quando o <span className="font-medium text-foreground">título</span> (tabela) ou o <span className="font-medium text-foreground">início do parágrafo</span> contém uma das palavras-chave. Prévia na aba <span className="font-medium text-foreground">Conteúdo</span> (ao trocar de aba).</p>
                <button type="button" onClick={resetarBlocos} className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"><RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão</button>
              </div>
              <div className="space-y-2">
                {blocos.map((b) => (
                  <div key={b.id} className="rounded-lg border p-2">
                    <div className="flex items-center gap-2">
                      <label className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-md border" title="Cor do bloco (fundo)">
                        <span className="absolute inset-0" style={{ background: b.cor }} />
                        <input type="color" value={b.cor} onChange={(e) => editarBloco(b.id, { cor: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Cor do bloco" />
                      </label>
                      <label className="relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border text-[11px] font-bold" title="Cor do texto do título" style={{ background: b.cor, color: b.corTitulo }}>
                        Aa
                        <input type="color" value={b.corTitulo} onChange={(e) => editarBloco(b.id, { corTitulo: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Cor do título" />
                      </label>
                      <input value={b.rotulo} onChange={(e) => editarBloco(b.id, { rotulo: e.target.value })} placeholder="Nome do bloco" className="min-w-0 flex-1 rounded-md border bg-[var(--input-bg,transparent)] px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring" />
                      {/* Prévia DESTE bloco (descrição recolhida) */}
                      <button type="button" onClick={() => editarBloco(b.id, { previa: !b.previa })} title={b.previa ? 'Prévia ligada (mostra a descrição recolhida)' : 'Prévia desligada'} aria-pressed={b.previa} className={cn('shrink-0 rounded-md p-1.5 transition', b.previa ? 'text-primary hover:bg-muted' : 'text-muted-foreground hover:bg-muted')}>
                        {b.previa ? <Captions className="h-4 w-4" /> : <CaptionsOff className="h-4 w-4" />}
                      </button>
                      <button type="button" onClick={() => removerBloco(b.id)} title="Remover bloco" className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <input value={b.palavras} onChange={(e) => editarBloco(b.id, { palavras: e.target.value })} placeholder="Palavras-chave (separadas por vírgula) — ex.: STF, entendimento do stf" className="mt-1.5 w-full rounded-md border bg-[var(--input-bg,transparent)] px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={addBloco} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"><Plus className="h-3.5 w-3.5" /> Adicionar bloco</button>
                <button type="button" onClick={() => aplicarTodasAulas({ blocos: true }, 'os blocos')} disabled={aplicandoTodas} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50">
                  {aplicandoTodas ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />} Aplicar a todas as aulas
                </button>
              </div>
            </div>
          </details>

        </div>
      </div>
      )}
    </div>
  )
}
