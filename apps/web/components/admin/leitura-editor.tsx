'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Save, Loader2, Eye, EyeOff, Upload, ClipboardPaste, PenLine, FileText,
  Bold, Italic, Underline, Heading, List, Trophy, Scale, Send, ChevronDown,
  ImagePlus, Trash2, RefreshCw, Settings2, HelpCircle, X, Layers, Replace, Check, Bell, BellOff, PencilLine, Plus, Minus,
  FilePlus2, Ban, SpellCheck,
  Strikethrough, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify, Palette, Eraser, Undo2, Redo2, RotateCcw, Captions, CaptionsOff,
  Stamp, Scissors, Highlighter,
} from 'lucide-react'
import { SELOS, criarSeloEl, codigoTag, prepararSelosLeitura, selosImgParaSpan, alturaBaseSelo } from '@/lib/leitura/selos'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { atualizarDocumento, publicarVersao, salvarIndiceTipos, salvarEspacamentoDocumento, type Documento, type SituacaoEditorial } from '@/app/admin/leitura/actions'
import { DEFAULT_ESPACAMENTO, ESP_LIMITES, type EspacamentoDoc } from '@/lib/leitura/espacamento'
import { salvarGrifoCoresDocumento, salvarBlocosDocumento, aplicarConfigTodasAulas } from '@/app/admin/leitura/actions'
import { DEFAULT_GRIFO_CORES, type GrifoCores } from '@/lib/leitura/trilha-aparencia'
import { DEFAULT_BLOCOS, type BlocoDef } from '@/lib/leitura/blocos'
import { TIPOS_INDICE, contarTiposNoHtml } from '@/lib/leitura/indice'
import { ListTree } from 'lucide-react'
import { carregarDiffDocumento, renomearVersao } from '@/app/admin/leitura/alteracoes-actions'
import { salvarConteudoHtml, importarDocx } from '@/app/admin/leitura/upload-actions'
import { LeituraPreviewGrifos, type GrifoCtl } from '@/components/admin/leitura-preview-grifos'
import { LeituraQuestoesAdmin } from '@/components/admin/leitura-questoes-admin'
import { TopicosEditor } from '@/components/admin/topicos-editor'
import { LeituraRapidaEditor } from '@/components/admin/leitura-rapida-editor'
import { type TopicosConfig } from '@/lib/leitura/topicos'
import { Zap } from 'lucide-react'

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

export function LeituraEditor({ documento, htmlAtual, podeEditar, podePublicar = false, publicadaVersao = 1, temRascunhoPendente = false, versaoEdicao, abaInicial, indiceTipos: indiceTiposProp = [], espInicial = null, grifoCoresInicial = null, blocosInicial = null, topicosInicial = {}, leituraRapidaInicial = '', voltarHref }: {
  documento: Documento; htmlAtual: string; podeEditar: boolean; podePublicar?: boolean; publicadaVersao?: number; temRascunhoPendente?: boolean; versaoEdicao?: number
  abaInicial?: 'conteudo' | 'config' | 'questoes' | 'leitura-rapida'
  indiceTipos?: string[]
  espInicial?: EspacamentoDoc | null
  grifoCoresInicial?: GrifoCores | null
  blocosInicial?: BlocoDef[] | null
  topicosInicial?: TopicosConfig
  leituraRapidaInicial?: string
  /** "Voltar" customizado (ex.: vindo da Jurisprudência) — default = banco de aulas da Lei Seca. */
  voltarHref?: string
}) {
  const versaoAutoria = versaoEdicao ?? documento.versao
  const router = useRouter()
  // Ao criar/entrar num documento, abre já na CONFIGURAÇÃO (parte técnica): dados do card,
  // conteúdo da lei e metadados. A aba "Conteúdo" (leitura/grifos) fica a um clique.
  // A trilha (banco de aulas) faz deep-link direto p/ Conteúdo/Questões via `abaInicial`.
  const [aba, setAba] = useState<'conteudo' | 'config' | 'questoes' | 'leitura-rapida'>(abaInicial ?? 'config')
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
  // Espaçamento GRANULAR (entrelinha + parágrafo/bloco sup/inf) — padrão do leitor; o aluno ainda escala.
  const [esp, setEsp] = useState<EspacamentoDoc>(espInicial ?? DEFAULT_ESPACAMENTO)
  const ajustarEsp = (k: Exclude<keyof EspacamentoDoc, 'preservarHtml'>, delta: number) => {
    const lim = ESP_LIMITES[k]
    const v = Math.max(lim.min, Math.min(lim.max, Math.round((esp[k] + delta) * 100) / 100))
    if (v === esp[k]) return
    const next = { ...esp, [k]: v }
    setEsp(next)
    startEspaco(async () => { const r = await salvarEspacamentoDocumento(documento.id, { esp: next }); if (!r.ok) toast.error(r.error ?? 'Erro ao salvar espaçamento') })
  }
  const resetarEsp = () => { setEsp(DEFAULT_ESPACAMENTO); startEspaco(async () => { const r = await salvarEspacamentoDocumento(documento.id, { esp: DEFAULT_ESPACAMENTO }); if (!r.ok) toast.error(r.error ?? 'Erro ao salvar espaçamento') }) }
  const togglePreservarHtml = () => {
    const next = { ...esp, preservarHtml: !esp.preservarHtml }
    setEsp(next)
    startEspaco(async () => { const r = await salvarEspacamentoDocumento(documento.id, { esp: next }); if (!r.ok) toast.error(r.error ?? 'Erro ao salvar espaçamento') })
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
  const [seloMenu, setSeloMenu] = useState(false)
  const [seloVar, setSeloVar] = useState<'' | 'sm' | 'ic'>('') // tamanho do selo: ''=normal, sm=compacto, ic=ícone
  const [marcaCor, setMarcaCor] = useState('#edc14a') // cor da marcação canetão
  const [marcaEstilo, setMarcaEstilo] = useState<'pincel' | 'marcador' | 'reto'>('pincel') // estilo do traço
  const [seloSel, setSeloSel] = useState<{ el: HTMLElement; x: number; y: number } | null>(null) // selo clicado no editor → menu de edição
  const [blocoSel, setBlocoSel] = useState<{ el: HTMLTableElement; x: number; y: number } | null>(null) // tabela/box clicado → cor do bloco
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

  // Insere o SELO (imagem oficial) na posição do cursor do editor de conteúdo. Round-trip: o <img>
  // carrega data-selo → sobrevive ao save (sanitizador) e é re-renderizado como imagem na leitura.
  const inserirSelo = (slug: string) => {
    setSeloMenu(false)
    const cont = editorRef.current
    if (!cont) return
    cont.focus()
    const el = criarSeloEl(slug, seloVar ? [seloVar] : [])
    if (!el) return
    const sel = window.getSelection()
    let range = sel && sel.rangeCount ? sel.getRangeAt(0) : null
    // Só insere dentro do editor; se o cursor estiver fora, joga no fim do conteúdo.
    if (!range || !cont.contains(range.commonAncestorContainer)) { range = document.createRange(); range.selectNodeContents(cont); range.collapse(false) }
    range.deleteContents()
    range.insertNode(el)
    const espaco = document.createTextNode(' ')
    el.after(espaco)
    range.setStartAfter(espaco); range.collapse(true)
    sel?.removeAllRanges(); sel?.addRange(range)
  }

  // Marcação "canetão/pincel": traço orgânico ATRÁS do texto selecionado (prioridade: tópicos/títulos).
  // Toggle: se a seleção já está marcada, desmarca. Reusa <span class="marca-pincel"> (sobrevive ao save).
  const marcarPincel = () => {
    const cont = editorRef.current
    const sel = window.getSelection()
    if (!cont || !sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    // DESMARCAR: remove QUALQUER marcação que a seleção/cursor tocar (robusto: intersecta OU contém o cursor).
    const base = range.commonAncestorContainer
    const elBase = (base.nodeType === 1 ? base as HTMLElement : base.parentElement) as HTMLElement | null
    const alvo = Array.from(cont.querySelectorAll<HTMLElement>('.marca-pincel')).filter((m) => {
      try { if (range.intersectsNode(m)) return true } catch { /* ignore */ }
      return !!elBase && (m === elBase || m.contains(elBase) || elBase.closest?.('.marca-pincel') === m)
    })
    if (alvo.length) {
      for (const m of alvo) { const pai = m.parentNode; while (m.firstChild) pai?.insertBefore(m.firstChild, m); pai?.removeChild(m) }
      cont.normalize?.(); cont.focus(); return
    }
    if (sel.isCollapsed) { toast.message('Selecione o trecho para marcar — ou clique dentro de uma marcação para remover.'); return }
    const span = document.createElement('span'); span.className = marcaEstilo === 'pincel' ? 'marca-pincel' : `marca-pincel est-${marcaEstilo}`
    if (marcaCor && marcaCor.toLowerCase() !== '#edc14a') span.style.setProperty('--marca-cor', marcaCor)
    try { span.appendChild(range.extractContents()); range.insertNode(span); sel.removeAllRanges() }
    catch { toast.error('Selecione um trecho dentro de um mesmo parágrafo.') }
    editorRef.current?.focus()
  }
  // Troca a cor: aplica à marcação sob o cursor (se houver) e vira a cor padrão das próximas.
  const aplicarCorMarca = (cor: string) => {
    setMarcaCor(cor)
    const sel = window.getSelection()
    const base = sel?.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : null
    const host = base ? ((base.nodeType === 1 ? base as HTMLElement : base.parentElement)?.closest?.('.marca-pincel') as HTMLElement | null) : null
    if (host && editorRef.current?.contains(host)) { host.style.setProperty('--marca-cor', cor); editorRef.current?.focus() }
  }
  // Troca o estilo (pincel/marcador/reto) da marcação sob o cursor e define o padrão das próximas.
  const aplicarEstiloMarca = (est: 'pincel' | 'marcador' | 'reto') => {
    setMarcaEstilo(est)
    const sel = window.getSelection()
    const base = sel?.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : null
    const host = base ? ((base.nodeType === 1 ? base as HTMLElement : base.parentElement)?.closest?.('.marca-pincel') as HTMLElement | null) : null
    if (host && editorRef.current?.contains(host)) { host.classList.remove('est-marcador', 'est-reto'); if (est !== 'pincel') host.classList.add(`est-${est}`); editorRef.current?.focus() }
  }

  // Insere um CORTE DE PÁGINA (divisor pontilhado entre tópicos; vira quebra de página no PDF) no cursor.
  const inserirCorte = () => {
    const cont = editorRef.current
    if (!cont) return
    cont.focus()
    const hr = document.createElement('hr'); hr.className = 'corte-pagina'
    const sel = window.getSelection()
    let range = sel && sel.rangeCount ? sel.getRangeAt(0) : null
    if (!range || !cont.contains(range.commonAncestorContainer)) { range = document.createRange(); range.selectNodeContents(cont); range.collapse(false) }
    range.deleteContents()
    range.insertNode(hr)
    const p = document.createElement('p'); p.appendChild(document.createElement('br'))
    hr.after(p)
    const r2 = document.createRange(); r2.setStart(p, 0); r2.collapse(true)
    sel?.removeAllRanges(); sel?.addRange(r2)
  }

  // HTML do editor pronto p/ salvar: converte os <img> de selo em <span data-selo> (o src relativo não
  // sobrevive ao sanitizador; o span sim, e o leitor re-renderiza a imagem).
  const htmlDoEditorParaSalvar = (): string => {
    const cont = editorRef.current
    if (!cont) return ''
    const clone = cont.cloneNode(true) as HTMLElement
    try { selosImgParaSpan(clone) } catch { /* ignore */ }
    return clone.innerHTML
  }

  // Clique num selo dentro do editor → abre o MENU de edição (forma, posição, remover) ancorado nele.
  const abrirMenuSelo = (img: HTMLElement) => {
    const r = img.getBoundingClientRect()
    setSeloSel({ el: img, x: Math.round(r.left), y: Math.round(r.bottom) })
  }
  const reancorar = (el: HTMLElement) => { const r = el.getBoundingClientRect(); setSeloSel({ el, x: Math.round(r.left), y: Math.round(r.bottom) }) }
  const seloFormaAtual = (): '' | 'sm' | 'ic' => !seloSel ? '' : seloSel.el.classList.contains('ic') ? 'ic' : seloSel.el.classList.contains('sm') ? 'sm' : ''
  const seloAlturaAtual = (): number => {
    if (!seloSel) return 1.7
    const vs = [seloSel.el.classList.contains('sm') && 'sm', seloSel.el.classList.contains('ic') && 'ic'].filter(Boolean) as string[]
    return parseFloat(seloSel.el.getAttribute('data-selo-h') || '') || alturaBaseSelo(vs)
  }
  // Troca a forma do selo mantendo o tamanho custom (se houver) e o alinhamento.
  const aplicarFormaSelo = (v: '' | 'sm' | 'ic') => {
    if (!seloSel) return
    const slug = seloSel.el.getAttribute('data-selo'); if (!slug) return
    const alturaEm = parseFloat(seloSel.el.getAttribute('data-selo-h') || '') || undefined
    const novo = criarSeloEl(slug, v ? [v] : [], alturaEm)
    if (!novo) return
    seloSel.el.replaceWith(novo)
    editorRef.current?.focus(); reancorar(novo)
  }
  // Aumenta/diminui o tamanho do selo livremente (passo 0.2em; mín 0.8em, máx 6em). Persiste em data-selo-h.
  const escalarSelo = (delta: number) => {
    if (!seloSel) return
    const img = seloSel.el as HTMLImageElement
    const nova = Math.min(6, Math.max(0.8, Math.round((seloAlturaAtual() + delta) * 100) / 100))
    const ic = img.classList.contains('ic')
    img.style.setProperty('height', `${nova}em`)
    img.style.setProperty('width', ic ? `${nova}em` : 'auto')
    img.setAttribute('data-selo-h', String(nova))
    editorRef.current?.focus(); reancorar(img)
  }
  // Posição: 'inline' (no meio do texto) ou alinhado num bloco próprio (esquerda/centro/direita).
  const posicionarSelo = (pos: 'inline' | 'left' | 'center' | 'right') => {
    if (!seloSel) return
    const el = seloSel.el
    const wrap = el.parentElement && el.parentElement.classList.contains('sl-bloco') ? el.parentElement : null
    if (pos === 'inline') {
      if (wrap) wrap.replaceWith(el)
    } else {
      let w = wrap
      if (!w) { w = document.createElement('div'); w.className = 'sl-bloco'; el.replaceWith(w); w.appendChild(el) }
      w.style.setProperty('text-align', pos)
    }
    editorRef.current?.focus(); reancorar(el)
  }
  const removerSelo = () => { if (!seloSel) return; const w = seloSel.el.parentElement?.classList.contains('sl-bloco') ? seloSel.el.parentElement : null; (w ?? seloSel.el).remove(); setSeloSel(null); editorRef.current?.focus() }

  // ── Cor do BLOCO (tabela/box importado) ─────────────────────────────────────────────────────
  // Lê a cor atual (1ª célula com fundo) — p/ o color input abrir na cor certa.
  const corDoBloco = (tb: HTMLTableElement): string => {
    for (const row of Array.from(tb.rows)) for (const cell of Array.from(row.cells)) {
      const m = /background(?:-color)?\s*:\s*(#[0-9a-f]{3,8})/i.exec((cell as HTMLElement).getAttribute('style') || '')
      if (m) return m[1]
    }
    return '#ffffff'
  }
  // Pinta o bloco: aplica a cor de fundo na tabela e em TODAS as células (fica uniforme).
  const pintarBloco = (cor: string) => {
    if (!blocoSel) return
    const tb = blocoSel.el
    tb.style.setProperty('background-color', cor)
    tb.querySelectorAll<HTMLElement>('td, th').forEach((c) => c.style.setProperty('background-color', cor))
    editorRef.current?.focus()
  }
  // "Sem cor": remove o fundo da tabela e de todas as células → vira box branco/neutro na leitura.
  const limparCorBloco = () => {
    if (!blocoSel) return
    const tb = blocoSel.el
    const limpa = (el: HTMLElement) => { el.style.removeProperty('background'); el.style.removeProperty('background-color'); if (!el.getAttribute('style')?.trim()) el.removeAttribute('style') }
    limpa(tb); tb.querySelectorAll<HTMLElement>('td, th, tr, thead, tbody').forEach(limpa)
    setBlocoSel(null); editorRef.current?.focus()
  }

  // htmlAtual sempre fresco p/ o callback ref estável (sem recriar o ref e re-montar o editor).
  const htmlAtualRef = useRef(htmlAtual)
  htmlAtualRef.current = htmlAtual

  // Carrega o conteúdo salvo no <div> do editor (permite editar em vez de recomeçar do zero).
  const popularEditor = useCallback((node: HTMLDivElement) => {
    // styleWithCSS: alinhamento/cor via execCommand saem como `style` (que agora sobrevive à sanitização).
    try { document.execCommand('styleWithCSS', false, 'true') } catch { /* browser antigo */ }
    // Enter cria <p> (não <div>) → espaçamento igual ao da leitura e linhas em branco preservadas.
    try { document.execCommand('defaultParagraphSeparator', false, 'p') } catch { /* browser antigo */ }
    if (!node.innerHTML.trim() && htmlAtualRef.current) {
      node.innerHTML = htmlAtualRef.current
      // Converte selos (<span data-selo>/<rg>) na IMAGEM já no editor, p/ o admin ver o que inseriu.
      try { prepararSelosLeitura(node) } catch { /* ignore */ }
    }
  }, [])

  // Callback ref: popula assim que o <div> MONTA (ao abrir a aba "Editor" OU ao voltar p/ a aba/tab —
  // o efeito [modo,htmlAtual] não re-rodava no remount com o mesmo `modo`, deixando o editor vazio).
  const setEditorEl = useCallback((node: HTMLDivElement | null) => {
    editorRef.current = node
    if (node) popularEditor(node)
  }, [popularEditor])

  // htmlAtual pode chegar/atualizar DEPOIS do mount → repopula (guarda não sobrescreve edição em curso).
  useEffect(() => {
    if (modo === 'editor' && editorRef.current) popularEditor(editorRef.current)
  }, [modo, htmlAtual, popularEditor])

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={voltarHref ?? (documento.pasta_id ? `/admin/leitura?pasta=${documento.pasta_id}` : '/admin/leitura')} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
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
      {(() => {
        const ABAS = [['config', 'Configuração', Settings2], ['conteudo', 'Conteúdo', FileText], ['questoes', 'Questões', HelpCircle], ['leitura-rapida', 'Leitura rápida', Zap]] as const
        const idx = ABAS.findIndex(([a]) => a === aba)
        return (
          <div className="relative flex border-b text-sm">
            {ABAS.map(([a, label, Icon]) => (
              <button key={a} onClick={() => setAba(a)} className={cn('flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 font-medium transition-colors', aba === a ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
            <span className="absolute bottom-[-1px] h-0.5 rounded-full bg-primary transition-all duration-300 ease-out" style={{ width: `${100 / ABAS.length}%`, left: `${idx * (100 / ABAS.length)}%` }} />
          </div>
        )
      })()}

      {/* QUESTÕES: índice em blocos com inserção de questões do banco entre os artigos (Fase 2). */}
      {aba === 'questoes' && <LeituraQuestoesAdmin documentoId={documento.id} versao={versaoAutoria} html={htmlAtual} />}

      {/* LEITURA RÁPIDA: HTML de uma página enxuta (reading + questões) para ler rápido. */}
      {aba === 'leitura-rapida' && (
        <div className="pt-4">
          <LeituraRapidaEditor documentoId={documento.id} inicial={leituraRapidaInicial} />
        </div>
      )}

      {/* CONTEÚDO: prévia grande + painel de edição de grifos ao lado */}
      {aba === 'conteudo' && (
        <LeituraPreviewGrifos documentoId={documento.id} html={htmlAtual} podeEditar={podeEditar} artigos={documento.artigos ?? 0} podeComparar={temRascunhoPendente || publicadaVersao > 1} onGrifoCtl={setGrifoCtl} versaoQuestoes={versaoAutoria} indiceTipos={indiceTipos} esp={esp} grifoCores={grifoCores} blocos={blocos} topicos={topicosInicial} />
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
              {/* Linha de modos (HTML/Word/Editor) + Salvar — STICKY: segue o rolamento no topo. */}
              <div className="sticky top-0 z-30 mb-2 flex items-center gap-2 bg-background py-1">
                <div className="flex flex-1 gap-1 rounded-lg border bg-muted/40 p-1 text-sm">
                  {([['colar', 'HTML', ClipboardPaste], ['word', 'Word', Upload], ['editor', 'Editor', PenLine]] as const).map(([m, label, Icon]) => (
                    <button key={m} onClick={() => setModo(m)} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition-colors', modo === m ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </button>
                  ))}
                </div>
                {modo === 'editor' && (
                  <button onClick={() => processarConteudo(htmlDoEditorParaSalvar())} disabled={savingConteudo} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
                    {savingConteudo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar conteúdo
                  </button>
                )}
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
                  {/* Barra de ferramentas: cola logo ABAIXO da linha de modos (offset) ao rolar. */}
                  <div className="sticky top-11 z-10 flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1 shadow-sm">
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
                    <button onClick={() => exec('justifyFull')} title="Justificar" className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><AlignJustify className="h-4 w-4" /></button>
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
                    <span className="mx-0.5 h-5 w-px bg-border" />
                    {/* Inserir SELO (Biblioteca) no cursor */}
                    <div className="relative">
                      <button onMouseDown={(e) => e.preventDefault()} onClick={() => setSeloMenu((v) => !v)} title="Inserir selo" className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-card hover:text-foreground', seloMenu && 'bg-muted text-foreground')}>
                        <Stamp className="h-4 w-4" /> Selo <ChevronDown className="h-3 w-3" />
                      </button>
                      {seloMenu && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setSeloMenu(false)} />
                          <div className="absolute right-0 top-full z-40 mt-1 max-h-80 w-72 overflow-auto rounded-xl border bg-card p-1.5 shadow-xl">
                            {/* Tamanho do selo — aplica a variante da imagem (Normal/Compacto/Ícone). */}
                            <div className="flex items-center gap-1 px-1 pb-1.5">
                              {([['', 'Normal'], ['sm', 'Compacto'], ['ic', 'Ícone']] as const).map(([v, label]) => (
                                <button key={v || 'n'} onMouseDown={(e) => e.preventDefault()} onClick={() => setSeloVar(v)} className={cn('flex-1 rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors', seloVar === v ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>{label}</button>
                              ))}
                            </div>
                            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Selos</p>
                            {Object.entries(SELOS).map(([slug, def]) => (
                              <button key={slug} onMouseDown={(e) => e.preventDefault()} onClick={() => inserirSelo(slug)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted">
                                <img src={`/leitura/selos/${slug}-ic.png`} alt="" className="h-6 w-6 shrink-0" draggable={false} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium">{def.nome}</span>
                                  <code className="block truncate font-mono text-[11px] text-muted-foreground">{codigoTag(slug)}</code>
                                </span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={inserirCorte} title="Corte de página (divisor / quebra de página)" className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-card hover:text-foreground"><Scissors className="h-4 w-4" /> Corte</button>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={marcarPincel} title="Marcação canetão (traço atrás do texto — ótimo p/ tópicos)" className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-card hover:text-foreground"><Highlighter className="h-4 w-4" /> Marcar</button>
                    <label onMouseDown={(e) => e.preventDefault()} title="Cor da marcação" className="relative inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border" style={{ background: marcaCor }}>
                      <input type="color" value={marcaCor} onChange={(e) => aplicarCorMarca(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Cor da marcação" />
                    </label>
                    <select value={marcaEstilo} onChange={(e) => aplicarEstiloMarca(e.target.value as 'pincel' | 'marcador' | 'reto')} onMouseDown={(e) => e.stopPropagation()} title="Estilo da marcação" className="h-7 rounded-md border bg-card px-1 text-xs text-muted-foreground">
                      <option value="pincel">Pincel</option>
                      <option value="marcador">Marcador</option>
                      <option value="reto">Reto</option>
                    </select>
                  </div>
                  <div ref={setEditorEl} contentEditable suppressContentEditableWarning
                    onClick={(e) => {
                      const t = e.target as HTMLElement
                      if (t?.tagName === 'IMG' && t.classList.contains('sl-img')) { abrirMenuSelo(t); setBlocoSel(null); return }
                      setSeloSel(null)
                      const tb = t?.closest?.('table') as HTMLTableElement | null
                      if (tb && editorRef.current?.contains(tb)) setBlocoSel({ el: tb, x: e.clientX, y: e.clientY }); else setBlocoSel(null)
                    }}
                    className="ce-leitura min-h-[220px] rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-ring [&_.sl-img]:cursor-pointer [&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-bold [&_ul]:ml-5 [&_ul]:list-disc" />

                  {/* Menu de edição do selo (abre ao clicar num selo no editor) */}
                  {seloSel && createPortal(
                    <>
                      <div className="fixed inset-0 z-[95]" onMouseDown={() => setSeloSel(null)} />
                      <div className="fixed z-[96] w-56 rounded-xl border bg-card p-2 shadow-xl" style={{ left: Math.min(seloSel.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 240), top: seloSel.y + 6 }} onMouseDown={(e) => e.preventDefault()}>
                        <div className="flex items-center gap-2 border-b px-1 pb-1.5">
                          <img src={`/leitura/selos/${seloSel.el.getAttribute('data-selo')}-ic.png`} alt="" className="h-5 w-5" draggable={false} />
                          <span className="truncate text-xs font-semibold">{SELOS[seloSel.el.getAttribute('data-selo') || '']?.nome ?? 'Selo'}</span>
                          <button onClick={removerSelo} title="Remover selo" className="ml-auto rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        <p className="px-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tamanho</p>
                        <div className="flex items-center gap-1 p-1">
                          <button onClick={() => escalarSelo(-0.2)} title="Diminuir" className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted"><Minus className="h-3.5 w-3.5" /></button>
                          <span className="flex-1 text-center text-[11px] font-medium tabular-nums">{seloAlturaAtual().toFixed(1)}em</span>
                          <button onClick={() => escalarSelo(0.2)} title="Aumentar" className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted"><Plus className="h-3.5 w-3.5" /></button>
                        </div>
                        <p className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Forma</p>
                        <div className="flex gap-1 p-1">
                          {([['', 'Normal'], ['sm', 'Compacto'], ['ic', 'Ícone']] as const).map(([v, label]) => (
                            <button key={v || 'n'} onClick={() => aplicarFormaSelo(v)} className={cn('flex-1 rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors', seloFormaAtual() === v ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>{label}</button>
                          ))}
                        </div>
                        <p className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Posição</p>
                        <div className="grid grid-cols-4 gap-1 p-1">
                          {([['inline', 'Linha', PenLine], ['left', 'Esq.', AlignLeft], ['center', 'Centro', AlignCenter], ['right', 'Dir.', AlignRight]] as const).map(([p, label, Icon]) => (
                            <button key={p} onClick={() => posicionarSelo(p)} title={label} className="flex flex-col items-center gap-0.5 rounded-md border px-1 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted"><Icon className="h-3.5 w-3.5" /> {label}</button>
                          ))}
                        </div>
                      </div>
                    </>,
                    document.body,
                  )}

                  {/* Cor do BLOCO (box/tabela importado) — clicar no box abre isto */}
                  {blocoSel && createPortal(
                    <>
                      <div className="fixed inset-0 z-[95]" onMouseDown={() => setBlocoSel(null)} />
                      <div className="fixed z-[96] w-56 rounded-xl border bg-card p-2 shadow-xl" style={{ left: Math.min(blocoSel.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 240), top: blocoSel.y + 6 }} onMouseDown={(e) => e.preventDefault()}>
                        <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cor do bloco</p>
                        <label className="relative flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border text-xs font-medium hover:bg-muted">
                          <Palette className="h-3.5 w-3.5" /> Escolher cor
                          <input type="color" defaultValue={corDoBloco(blocoSel.el)} onChange={(e) => pintarBloco(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Cor do bloco" />
                        </label>
                        <button onClick={limparCorBloco} className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"><Ban className="h-3.5 w-3.5" /> Sem cor (transparente)</button>
                        <p className="mt-1.5 px-1 text-[10px] leading-snug text-muted-foreground">Deixa o box com fundo transparente (só borda + texto), como no Word.</p>
                      </div>
                    </>,
                    document.body,
                  )}
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

          {/* Temas do dia (tópicos) — recolhível. Tópicos automáticos dos títulos; admin ajusta tags + questões. */}
          <details className="group border-t pt-4">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground [&::-webkit-details-marker]:hidden">
              <ListTree className="h-3.5 w-3.5 text-primary" /> Temas do dia
              <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="pt-3">
              <TopicosEditor documentoId={documento.id} htmlAtual={htmlAtual} topicosInicial={topicosInicial} />
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
              <p className="text-xs text-muted-foreground">Controle total — entrelinha, e espaço <strong>acima/abaixo</strong> de parágrafos e blocos. Padrão para o aluno (ele ainda escala no leitor). Prévia na aba <span className="font-medium text-foreground">Conteúdo</span>.</p>
              {/* Preservar espaçamento do HTML (fiel ao Word / Enter do editor) — quando ligado, os sliders não valem. */}
              <button type="button" onClick={togglePreservarHtml} className={cn('flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition', esp.preservarHtml ? 'border-primary/40 bg-primary/[0.05]' : 'hover:bg-muted')}>
                <FileText className={cn('h-4 w-4 shrink-0', esp.preservarHtml ? 'text-primary' : 'text-muted-foreground')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Preservar espaçamento do HTML</span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">Mantém as linhas em branco do Word e do <strong>Enter</strong> no editor (não colapsa parágrafos vazios). Ligado, os sliders abaixo não valem.</span>
                </span>
                <span className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', esp.preservarHtml ? 'bg-primary' : 'bg-muted-foreground/30')}>
                  <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', esp.preservarHtml ? 'left-[18px]' : 'left-0.5')} />
                </span>
              </button>
              <div className={cn(esp.preservarHtml && 'pointer-events-none opacity-40')}>
              {([
                { k: 'linha', label: 'Entrelinha do texto', step: 0.1, base: 1 },
                { k: 'parTop', label: 'Parágrafo — espaço acima', step: 0.25, base: 1 },
                { k: 'parBot', label: 'Parágrafo — espaço abaixo', step: 0.25, base: 1 },
                { k: 'blocoBloco', label: 'Distância entre blocos', step: 0.22, base: 2.2 },
                { k: 'blocoTextoTop', label: 'Bloco e texto — acima', step: 0.22, base: 2.2 },
                { k: 'blocoTextoBot', label: 'Bloco e texto — abaixo', step: 0.22, base: 2.2 },
              ] as { k: Exclude<keyof EspacamentoDoc, 'preservarHtml'>; label: string; step: number; base: number }[]).map(({ k, label, step, base }) => {
                const lim = ESP_LIMITES[k]
                const barra = Math.max(0, Math.min(100, Math.round(((esp[k] - lim.min) / (lim.max - lim.min)) * 100)))
                return (
                  <div key={k} className="space-y-1">
                    <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => ajustarEsp(k, -step)} className="rounded-lg border p-1.5 transition hover:bg-muted" aria-label={`Diminuir ${label}`}><Minus className="h-4 w-4" /></button>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${barra}%` }} /></div>
                      <span className="w-12 text-center text-sm font-medium tabular-nums">{Math.round((esp[k] / base) * 100)}%</span>
                      <button type="button" onClick={() => ajustarEsp(k, step)} className="rounded-lg border p-1.5 transition hover:bg-muted" aria-label={`Aumentar ${label}`}><Plus className="h-4 w-4" /></button>
                    </div>
                  </div>
                )
              })}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={() => aplicarTodasAulas({ espacamento: true }, 'o espaçamento')} disabled={aplicandoTodas} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50">
                  {aplicandoTodas ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />} Aplicar a todas as aulas
                </button>
                <button type="button" onClick={resetarEsp} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"><RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão</button>
              </div>
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
