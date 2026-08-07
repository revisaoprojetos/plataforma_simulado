'use client'

// Shell do editor unificado de cadernos (tela única): topbar + painel esquerdo (modalidade/
// modelos/blocos) + canvas central A4 + painel direito com abas Bloco | Aparência | Páginas |
// Faixas | Material. Reusa o motor provado (block-tree, BlockRender, paginador, inspectors) e
// centraliza o estado no store (useEditor). O DOCUMENTO gravado é o MESMO config.docsV2 da
// impressão. Trazido para cá o que antes ficava espalhado: seleção de banco, material PDF e
// aparência (cor/ícone/capa) do caderno.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Printer, Plus, Trash2, ArrowUp, ArrowDown, FileText, Palette, LayoutTemplate, ChevronLeft, ChevronRight, PanelTop, PanelBottom, Database, Users, Repeat, GripVertical, Undo2, Redo2, FileUp, MonitorPlay, FileStack, Upload, X, ExternalLink, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { blocksByCategory, createBlock, getBlockMeta } from '@/lib/caderno-designer/blocks'
import { BlockInspector } from '@/lib/caderno-designer/inspectors'
import { resolveTheme } from '@/lib/caderno-designer/theme'
import * as tree from '@/lib/caderno-designer/block-tree'
import { SHEET_W, SHEET_H, PAD_H, PAD_V, PAGE_KINDS, RUNNING_PADRAO, novoDoc, genId, faixaNaPagina, type CadernoDoc, type Block, type PageKind, type CadernoData, type FaixaPaginas } from '@/lib/caderno-designer/types'
import { HudSimuladoEditor } from '@/components/admin/hud-simulado-editor'
import { HexColorField } from '@/components/admin/hex-color-field'
import { GerarPdfServidor } from '@/components/admin/gerar-pdf-servidor'
import { salvarCadernoDesignerV2, hospedarImagemCadernoAction, getGruposBanco, getAssuntosBanco, atualizarCaderno, linkagemCaderno } from '@/app/admin/cadernos/actions'
import { removerMaterialPdf } from '@/app/admin/banco-questoes/estudantes-actions'
import { PRESETS_CADERNO, type CadernoPreset } from '@/lib/caderno-designer/presets'
import { OCULTAR_DISCURSIVA } from '@/lib/flags'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { useEditor } from './store/use-editor-store'
import { modalidadesVisiveis, type Alvo, type Regiao } from './store/editor-store'
import { EditorNode, ListaBlocos, FolhasPaginadas, FundoPagina, ChipFundo, AutoAnim, type NodeCtx } from './canvas/canvas-node'

const CAT_NOMES: Record<string, string> = { conteudo: 'Conteúdo', avaliacao: 'Avaliação', identificacao: 'Identificação', estrutura: 'Estrutura' }
const ZOOM = 0.76
const REALCE = 'var(--primary)'
const ehDiscursivaPreset = (p: { id: string; nome: string }) => /discursiv|reda[çc][ãa]o/i.test(`${p.id} ${p.nome}`)

export type ShellProps = {
  previewData: CadernoData
  bancos?: { id: string; nome: string }[]
  registros?: { id: string; nome: string; vars: Record<string, string>; respostas?: Record<string, string> }[]
  branding?: { nome?: string; logoUrl?: string | null; logoGrandeUrl?: string | null; logoBg?: string; logoEstilo?: string } | null
  pastaId?: string | null
}

export function CadernoEditorShell({ previewData, bancos = [], registros = [], branding = null, pastaId = null }: ShellProps) {
  const { state, dispatch } = useEditor()
  const [pending, start] = useTransition()
  const [importando, setImportando] = useState(false)
  const [linkagem, setLinkagem] = useState<{ bancos: number; simulados: number } | null>(null)
  const fileWordRef = useRef<HTMLInputElement>(null)

  const cadernoId = state.cadernoId
  const modsVis = modalidadesVisiveis(state.modalidades)
  const doc = state.docs[state.modAtiva] ?? novoDoc()
  const running = doc.running ?? RUNNING_PADRAO
  const theme = useMemo(() => resolveTheme(state.cores), [state.cores])
  const cats = blocksByCategory()
  const h = state.history[state.modAtiva] ?? { undo: [], redo: [] }

  // Grupos/assuntos do banco (para blocos de diagnóstico).
  const [gruposBanco, setGruposBanco] = useState<{ id: string; nome: string; disciplinas: string[] }[]>([])
  const [assuntosBanco, setAssuntosBanco] = useState<Record<string, string[]>>({})
  useEffect(() => { let vivo = true; if (state.bancoId) getGruposBanco(state.bancoId).then((r) => { if (vivo && r.ok) setGruposBanco(r.grupos ?? []) }); else setGruposBanco([]); return () => { vivo = false } }, [state.bancoId])
  useEffect(() => { let vivo = true; if (state.bancoId) getAssuntosBanco(state.bancoId).then((r) => { if (vivo && r.ok) setAssuntosBanco(r.porDisciplina ?? {}) }); else setAssuntosBanco({}); return () => { vivo = false } }, [state.bancoId])
  useEffect(() => { let vivo = true; linkagemCaderno(cadernoId).then((r) => { if (vivo && r.ok) setLinkagem({ bancos: r.bancos, simulados: r.simulados }) }); return () => { vivo = false } }, [cadernoId])

  // Variáveis dinâmicas do simulado (disciplinas/pilares) para o painel de variáveis do inspetor.
  const varsExtra = useMemo(() => {
    const vars = (registros[0]?.vars ?? previewData.vars ?? {}) as Record<string, string>
    const keys = Object.keys(vars)
    const human = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
    const discSlugs = [...new Set(keys.filter((k) => k.startsWith('pct_') && !k.startsWith('pct_pilar_')).map((k) => k.slice(4)))].sort()
    const pilarSlugs = [...new Set(keys.filter((k) => k.startsWith('pct_pilar_')).map((k) => k.slice('pct_pilar_'.length)))].sort()
    const grupos: { grupo: string; itens: { token: string; label: string }[] }[] = []
    if (pilarSlugs.length) grupos.push({ grupo: 'Pilares (deste simulado)', itens: pilarSlugs.flatMap((s) => [
      { token: `{pct_pilar_${s}}`, label: `${human(s)} · %` }, { token: `{acerto_pilar_${s}}`, label: `${human(s)} · acertos` }, { token: `{total_pilar_${s}}`, label: `${human(s)} · total` },
    ]) })
    if (discSlugs.length) grupos.push({ grupo: 'Disciplinas (deste simulado)', itens: discSlugs.flatMap((s) => [
      { token: `{pct_${s}}`, label: `${human(s)} · %` }, { token: `{acerto_${s}}`, label: `${human(s)} · acertos` }, { token: `{total_${s}}`, label: `${human(s)} · total` },
    ]) })
    return grupos
  }, [registros, previewData])

  const regAtual = registros[state.regIndex] ?? null
  const totalQPreview = previewData.questoes.length
  const qIdx = totalQPreview ? Math.min(state.previewQ, totalQPreview - 1) : 0
  const dataAtual: CadernoData = useMemo(() => ({ ...(regAtual ? { ...previewData, vars: { ...previewData.vars, ...regAtual.vars }, respostas: regAtual.respostas } : previewData), previewIndex: qIdx }), [regAtual, previewData, qIdx])

  const tiposUsados = useMemo(() => tree.tiposNaArvore([...doc.pages.flatMap((p) => p.blocks), ...(doc.cabecalho ?? []), ...(doc.rodape ?? [])]), [doc])
  const blocoSel = useMemo(() => {
    for (const arr of [...doc.pages.map((p) => p.blocks), doc.cabecalho ?? [], doc.rodape ?? []]) { const f = tree.findBlock(arr, state.selBlock ?? ''); if (f) return f }
    return null
  }, [doc, state.selBlock])

  // ── Mutações do documento (via store; coalesce para digitação) ──────────────────
  const setDoc = (fn: (d: CadernoDoc) => CadernoDoc, coalesce = false) => dispatch({ t: 'mutateDoc', fn, coalesce })
  const mutarTudo = (fn: (blocks: Block[]) => Block[], coalesce = false) => setDoc((d) => ({ ...d, pages: d.pages.map((p) => ({ ...p, blocks: fn(p.blocks) })), cabecalho: fn(d.cabecalho ?? []), rodape: fn(d.rodape ?? []) }), coalesce)
  const sel = (patch: { selBlock?: string | null; selPage?: string | null; regiao?: Regiao; aba?: 'bloco' | 'aparencia' | 'pagina' | 'faixas' | 'material' }) => dispatch({ t: 'sel', ...patch })
  const patchBlock = (blockId: string, patch: Record<string, unknown>) => mutarTudo((bs) => tree.updateAttrs(bs, blockId, patch), true)

  function addBlock(type: string) {
    const meta = getBlockMeta(type)
    if (meta?.unico && tiposUsados.has(type)) { toast.error(`"${meta.title}" já existe neste caderno.`); return }
    const novo = createBlock(type)
    if (meta?.fullBleed) {
      let pid = state.selPage ?? doc.pages[0]?.id; if (!pid) { toast.error('Selecione uma página primeiro.'); return }
      if (meta.unicoPorPagina) {
        const pgSel = doc.pages.find((p) => p.id === pid)
        if (pgSel?.blocks.some((b) => b.type === type)) {
          const livre = doc.pages.find((p) => !p.blocks.some((b) => b.type === type))
          if (!livre) { toast.error('Todas as páginas já têm imagem de fundo. Adicione uma nova página.'); return }
          pid = livre.id
        }
      }
      setDoc((d) => ({ ...d, pages: d.pages.map((p) => p.id === pid ? { ...p, blocks: [novo, ...p.blocks] } : p) }))
      sel({ selBlock: novo.id, selPage: pid, aba: 'bloco' })
      toast.info('Imagem de fundo adicionada — envie a imagem no inspetor à direita.')
      return
    }
    const s = blocoSel
    if (s && (s.type === 'card' || s.type === 'coluna' || s.type === 'repeticao' || s.type === 'condicao')) { mutarTudo((bs) => tree.insertInto(bs, s.id, novo)); sel({ selBlock: novo.id }); return }
    if (s && s.type === 'colunas') { const col0 = s.innerBlocks?.[0]; if (col0) { mutarTudo((bs) => tree.insertInto(bs, col0.id, novo)); sel({ selBlock: novo.id }); return } }
    if (state.regiao === 'cabecalho') { setDoc((d) => ({ ...d, cabecalho: [...(d.cabecalho ?? []), novo] })); sel({ selBlock: novo.id }); return }
    if (state.regiao === 'rodape') { setDoc((d) => ({ ...d, rodape: [...(d.rodape ?? []), novo] })); sel({ selBlock: novo.id }); return }
    const pid = state.selPage ?? doc.pages[0]?.id; if (!pid) return
    setDoc((d) => ({ ...d, pages: d.pages.map((p) => p.id === pid ? { ...p, blocks: [...p.blocks, novo] } : p) }))
    sel({ selBlock: novo.id, selPage: pid })
  }

  // ── Drag-and-drop ──────────────────────────────────────────────────────────────
  function aplicarInsercao(alvo: Alvo, bloco: Block) {
    if (alvo.kind === 'page') { setDoc((d) => ({ ...d, pages: d.pages.map((p) => p.id === alvo.pageId ? { ...p, blocks: [...p.blocks, bloco] } : p) })); return }
    if (alvo.kind === 'regiao') { setDoc((d) => ({ ...d, [alvo.regiao]: [...(((d as any)[alvo.regiao] as Block[]) ?? []), bloco] })); return }
    if (alvo.kind === 'after') { mutarTudo((bs) => tree.insertAfter(bs, alvo.blockId, bloco)); return }
    if (alvo.kind === 'before') { mutarTudo((bs) => tree.insertBefore(bs, alvo.blockId, bloco)); return }
    if (alvo.kind === 'lado') { mutarTudo((bs) => tree.wrapLado(bs, alvo.blockId, bloco, alvo.lado)); return }
    mutarTudo((bs) => tree.insertInto(bs, alvo.containerId, bloco))
  }
  function inserirNovo(type: string, alvo: Alvo) {
    const meta = getBlockMeta(type)
    if (meta?.unico && tiposUsados.has(type)) { toast.error(`"${meta.title}" já existe neste caderno.`); return }
    const novo = createBlock(type)
    if (meta?.fullBleed) {
      const pid = alvo.kind === 'page' ? alvo.pageId : (state.selPage ?? doc.pages[0]?.id); if (!pid) return
      if (meta.unicoPorPagina) { const pg = doc.pages.find((p) => p.id === pid); if (pg?.blocks.some((b) => b.type === type)) { toast.error(`Esta página já tem "${meta.title}".`); return } }
      setDoc((d) => ({ ...d, pages: d.pages.map((p) => p.id === pid ? { ...p, blocks: [novo, ...p.blocks] } : p) }))
    } else aplicarInsercao(alvo, novo)
    sel({ selBlock: novo.id, aba: 'bloco' })
  }
  function moverBloco(dragId: string, alvo: Alvo) {
    const alvoId = alvo.kind === 'after' || alvo.kind === 'before' || alvo.kind === 'lado' ? alvo.blockId : alvo.kind === 'into' ? alvo.containerId : null
    if (alvoId === dragId) return
    setDoc((d) => {
      let found: Block | null = null
      const ex = (bs: Block[]) => { const r = tree.extractBlock(bs, dragId); if (r.found) found = r.found; return r.blocks }
      let pages = d.pages.map((p) => ({ ...p, blocks: ex(p.blocks) }))
      let cab = ex(d.cabecalho ?? [])
      let rod = ex(d.rodape ?? [])
      if (!found) return d
      if (alvoId && tree.findBlock([found], alvoId)) return d
      const fb = found as Block
      if (alvo.kind === 'page') pages = pages.map((p) => p.id === alvo.pageId ? { ...p, blocks: [...p.blocks, fb] } : p)
      else if (alvo.kind === 'regiao') { if (alvo.regiao === 'cabecalho') cab = [...cab, fb]; else rod = [...rod, fb] }
      else {
        const ins = (bs: Block[]) => alvo.kind === 'after' ? tree.insertAfter(bs, alvo.blockId, fb)
          : alvo.kind === 'before' ? tree.insertBefore(bs, alvo.blockId, fb)
          : alvo.kind === 'lado' ? tree.wrapLado(bs, alvo.blockId, fb, alvo.lado)
          : tree.insertInto(bs, (alvo as { containerId: string }).containerId, fb)
        pages = pages.map((p) => ({ ...p, blocks: ins(p.blocks) })); cab = ins(cab); rod = ins(rod)
      }
      return { ...d, pages: pages.map((p) => ({ ...p, blocks: tree.limparArvore(p.blocks) })), cabecalho: tree.limparArvore(cab), rodape: tree.limparArvore(rod) }
    })
    sel({ selBlock: dragId })
  }
  function aoSoltar(e: React.DragEvent, alvo: Alvo) {
    e.preventDefault(); e.stopPropagation(); dispatch({ t: 'setOver', id: null }); dispatch({ t: 'setArrastando', v: false })
    const t = e.dataTransfer.getData('text/plain')
    if (t.startsWith('novo:')) inserirNovo(t.slice(5), alvo)
    else if (t.startsWith('mover:')) { const id = t.slice(6); if (id) moverBloco(id, alvo) }
  }

  const ctx: NodeCtx = {
    theme, data: dataAtual, selId: state.selBlock, overId: state.overId, overPos: state.overPos, arrastando: state.arrastando,
    select: (b) => sel({ selBlock: b.id, aba: 'bloco' }),
    addInto: (id) => { sel({ selBlock: id }); toast.info('Container selecionado — escolha um bloco à esquerda para inserir dentro.') },
    mover: (id, dir) => mutarTudo((bs) => tree.moveBlock(bs, id, dir)),
    remover: (id) => { mutarTudo((bs) => tree.limparArvore(tree.removeBlock(bs, id))); if (state.selBlock === id) sel({ selBlock: null }) },
    duplicar: (id) => mutarTudo((bs) => tree.duplicateBlock(bs, id)),
    aoLado: (id) => mutarTudo((bs) => tree.wrapAoLado(bs, id)),
    setCols: (id, n) => mutarTudo((bs) => tree.setNumColunas(bs, id, n)),
    setOver: (id, pos) => dispatch({ t: 'setOver', id, pos }),
    dragStart: (e, id) => { e.stopPropagation(); dispatch({ t: 'setArrastando', v: true }); e.dataTransfer.setData('text/plain', `mover:${id}`); e.dataTransfer.effectAllowed = 'move' },
    drop: aoSoltar,
  }

  // ── Páginas / modalidades / modelos ──────────────────────────────────────────────
  function addPage(kind: PageKind) { setDoc((d) => ({ ...d, pages: [...d.pages, { id: genId('page'), kind, titulo: `Página ${d.pages.length + 1}`, blocks: [] }] })) }
  function removePage(pageId: string) { setDoc((d) => d.pages.length <= 1 ? d : ({ ...d, pages: d.pages.filter((p) => p.id !== pageId) })) }
  function moverPagina(from: number, to: number) { if (to < 0 || from === to) return; setDoc((d) => { if (to >= d.pages.length) return d; const arr = [...d.pages]; const [it] = arr.splice(from, 1); arr.splice(to, 0, it); return { ...d, pages: arr } }) }
  async function addModalidade() { const nm = (await pedirTexto({ titulo: 'Nova modalidade', label: 'Nome', placeholder: 'ex.: Gabarito Discursivo', confirmar: 'Criar' }))?.trim(); if (!nm) return; dispatch({ t: 'addModalidade', m: { id: genId('mod'), nome: nm }, doc: novoDoc() }) }
  async function renameModalidade(id: string) { const atual = state.modalidades.find((m) => m.id === id)?.nome ?? ''; const nm = (await pedirTexto({ titulo: 'Renomear modalidade', label: 'Nome', valorInicial: atual, confirmar: 'Salvar' }))?.trim(); if (!nm) return; dispatch({ t: 'renameModalidade', id, nome: nm }) }
  async function removeModalidade(id: string) { if (state.modalidades.length <= 1) { toast.error('Mantenha ao menos uma modalidade.'); return } if (!(await confirmar({ mensagem: 'Excluir esta modalidade e seu documento?', destrutivo: true }))) return; dispatch({ t: 'removeModalidade', id }) }
  async function aplicarPreset(p: CadernoPreset) {
    const nomeMod = state.modalidades.find((m) => m.id === state.modAtiva)?.nome ?? 'atual'
    if (!(await confirmar({ titulo: 'Aplicar modelo', mensagem: `Aplicar o modelo "${p.nome}"? Isso substitui todo o conteúdo da modalidade "${nomeMod}".`, confirmar: 'Aplicar' }))) return
    dispatch({ t: 'replaceDoc', doc: p.build() })
    toast.success(`Modelo "${p.nome}" aplicado`)
  }

  // ── Hospedar fundos base64 → URL antes de salvar (config leve) ────────────────────
  async function hospedarFundos(atual: Record<string, CadernoDoc>): Promise<Record<string, CadernoDoc>> {
    const cache = new Map<string, string>()
    const up = async (b64: string): Promise<string> => {
      if (cache.has(b64)) return cache.get(b64)!
      try { const r = await hospedarImagemCadernoAction(b64); const u = r.ok && r.url ? r.url : b64; cache.set(b64, u); return u } catch { cache.set(b64, b64); return b64 }
    }
    const hostAttrs = async (o: any): Promise<void> => {
      if (!o || typeof o !== 'object') return
      for (const k of Object.keys(o)) { const v = o[k]; if (typeof v === 'string' && v.startsWith('data:image')) o[k] = await up(v); else if (v && typeof v === 'object') await hostAttrs(v) }
    }
    const walk = async (blocks: any[]) => { for (const b of blocks ?? []) { if (b?.attributes) await hostAttrs(b.attributes); if (Array.isArray(b?.innerBlocks)) await walk(b.innerBlocks) } }
    const copia: Record<string, CadernoDoc> = JSON.parse(JSON.stringify(atual))
    for (const d of Object.values(copia)) { for (const p of (d as any).pages ?? []) await walk(p.blocks); await walk((d as any).cabecalho ?? []); await walk((d as any).rodape ?? []) }
    return copia
  }

  function salvar() {
    start(async () => {
      try {
        const docsLeves = await hospedarFundos(state.docs)
        dispatch({ t: 'setDocsAfterSave', docs: docsLeves })
        const r = await salvarCadernoDesignerV2(cadernoId, { docsV2: docsLeves, modalidadesV2: state.modalidades, cores: state.cores, hudCores: state.hudCores, hudPorPagina: state.hudPorPagina, bancoId: state.bancoId })
        if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar'); return }
        if (r.docsV2) dispatch({ t: 'setDocsAfterSave', docs: r.docsV2 as Record<string, CadernoDoc> })
        if (state.metaDirty) { const rm = await atualizarCaderno(cadernoId, state.meta.nome, state.meta.cor, state.meta.icone, state.meta.capa ?? undefined); if (rm.ok) dispatch({ t: 'metaSalvo' }); else toast.error(rm.error ?? 'Erro ao salvar a aparência') }
        toast.success('Caderno salvo')
      } catch (e) { console.error(e); toast.error('Não consegui salvar agora (caderno grande ou conexão instável). Seu trabalho NÃO foi perdido — tente de novo.') }
    })
  }

  async function importarWord(file: File) {
    const nomeMod = state.modalidades.find((m) => m.id === state.modAtiva)?.nome ?? 'esta modalidade'
    if (!(await confirmar({ titulo: 'Importar Word (.docx)', mensagem: `Isso vai SUBSTITUIR o conteúdo de "${nomeMod}" pelo do arquivo "${file.name}". Você revisa no editor e salva depois. Continuar?`, confirmar: 'Importar', destrutivo: true }))) return
    setImportando(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const resp = await fetch('/api/admin/caderno/importar-word', { method: 'POST', body: fd })
      const r = await resp.json().catch(() => ({ ok: false, error: 'Resposta inválida do servidor.' }))
      if (!resp.ok || !r.ok || !r.doc) { toast.error(r.error ?? 'Falha ao importar o Word.'); return }
      dispatch({ t: 'replaceDoc', doc: r.doc as CadernoDoc })
      if (Array.isArray(r.avisos) && r.avisos.length) toast.warning(`Importado com ${r.avisos.length} aviso(s) de formatação — revise o resultado.`)
      toast.success(`Word importado: ${r.resumo?.blocos ?? 0} bloco(s)${r.resumo?.imagens ? ` · ${r.resumo.imagens} imagem(ns)` : ''}. Revise e salve.`)
    } catch (e) { toast.error('Erro ao enviar o arquivo.'); console.error(e) }
    finally { setImportando(false) }
  }

  function vincularBanco(novoId: string | null) {
    dispatch({ t: 'setBanco', bancoId: novoId })
    start(async () => {
      const r = await salvarCadernoDesignerV2(cadernoId, { docsV2: state.docs, modalidadesV2: state.modalidades, cores: state.cores, hudCores: state.hudCores, hudPorPagina: state.hudPorPagina, bancoId: novoId })
      if (r.ok) window.location.reload() // refaz o preview com os dados do banco
      else toast.error(r.error ?? 'Erro ao vincular banco')
    })
  }

  // ── Material PDF ─────────────────────────────────────────────────────────────────
  const [enviandoMat, setEnviandoMat] = useState<'material' | 'enunciado' | null>(null)
  async function enviarMaterial(file: File, slot: 'material' | 'enunciado') {
    if (file.type !== 'application/pdf') { toast.error('Envie um arquivo PDF.'); return }
    if (file.size > 8 * 1024 * 1024) { toast.error('PDF muito grande (máx. ~8 MB).'); return }
    setEnviandoMat(slot)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('cadernoId', cadernoId); if (state.bancoId) fd.append('bancoId', state.bancoId); fd.append('slot', slot)
      const resp = await fetch('/api/admin/material-pdf', { method: 'POST', body: fd })
      const r = await resp.json().catch(() => ({ ok: false, error: 'Resposta inválida do servidor.' }))
      if (!resp.ok || !r.ok) { toast.error(r.error ?? 'Falha no envio.'); return }
      dispatch({ t: 'setMaterial', slot, material: { fonte: 'pdf', pdfUrl: r.url, pdfNome: r.nome } })
      toast.success('PDF enviado.')
    } catch (e) { toast.error('Erro ao enviar o PDF.'); console.error(e) }
    finally { setEnviandoMat(null) }
  }
  async function removerMaterial(slot: 'material' | 'enunciado') {
    if (!(await confirmar({ mensagem: 'Remover este PDF? O aluno volta a receber o caderno gerado pelo sistema.', destrutivo: true }))) return
    const r = await removerMaterialPdf(cadernoId, state.bancoId ?? '', slot)
    if (!r.ok) { toast.error(r.error ?? 'Erro ao remover.'); return }
    dispatch({ t: 'setMaterial', slot, material: { fonte: 'sistema', pdfUrl: '', pdfNome: '' } })
    toast.success('PDF removido.')
  }

  // Atalhos desfazer/refazer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const el = e.target as HTMLElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); dispatch({ t: 'undo' }) }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); dispatch({ t: 'redo' }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  // ── Zona de cabeçalho/rodapé na folha ─────────────────────────────────────────────
  function ZonaFaixa({ reg, blocks, altura }: { reg: 'cabecalho' | 'rodape'; blocks: Block[]; altura?: number }) {
    const ativa = state.regiao === reg
    const overReg = state.overId === `regiao:${reg}`
    const isCab = reg === 'cabecalho'
    const temAltura = !!altura && altura > 0
    const hh = temAltura ? { minHeight: altura, display: 'flex', flexDirection: 'column' as const, justifyContent: isCab ? 'flex-start' as const : 'flex-end' as const } : {}
    return (
      <div
        onClick={(e) => { e.stopPropagation(); sel({ regiao: reg, selBlock: null, selPage: null }) }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); dispatch({ t: 'setOver', id: `regiao:${reg}` }) }}
        onDrop={(e) => { e.stopPropagation(); aoSoltar(e, { kind: 'regiao', regiao: reg }) }}
        style={{
          transition: 'min-height 0.25s ease-out, background-color 0.15s, box-shadow 0.15s',
          ...(temAltura ? { background: 'color-mix(in oklab, var(--primary) 7%, transparent)' } : {}),
          ...(isCab ? { borderBottom: `1px solid ${theme.cores.secundaria}55`, paddingTop: 10, paddingBottom: 8, marginBottom: 8, ...hh } : { borderTop: `1px solid ${theme.cores.secundaria}55`, paddingTop: 8, paddingBottom: 10, marginTop: 8, ...hh }),
        }}
        className={cn('relative z-[1] shrink-0 cursor-pointer rounded-sm', temAltura && 'outline-dashed outline-1 -outline-offset-1 outline-primary/30', overReg ? 'ring-2 ring-primary/50' : ativa ? 'ring-1 ring-primary/40' : 'hover:ring-1 hover:ring-primary/25')}>
        {temAltura && <span className={cn('pointer-events-none absolute right-1.5 z-[2] rounded bg-primary/80 px-1.5 py-0.5 text-[9px] font-semibold text-primary-foreground', isCab ? 'top-1.5' : 'bottom-1.5')}>{isCab ? 'Cabeçalho' : 'Rodapé'} · {altura}px</span>}
        {blocks.length === 0
          ? <div className={cn('flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground', temAltura ? 'flex-1' : 'py-3')}>{isCab ? <PanelTop className="h-3.5 w-3.5" /> : <PanelBottom className="h-3.5 w-3.5" />} Área de {isCab ? 'cabeçalho' : 'rodapé'}{temAltura ? '' : ' — clique e adicione blocos'}</div>
          : <div className="flex flex-col"><ListaBlocos blocks={blocks} ctx={ctx} /></div>}
      </div>
    )
  }

  const mat = state.material
  const matEnun = state.materialEnunciado
  const semVinculo = linkagem !== null && linkagem.bancos === 0 && linkagem.simulados === 0

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-background" onDragEnd={() => { dispatch({ t: 'setArrastando', v: false }); dispatch({ t: 'setOver', id: null }) }}>
      {/* Topo */}
      <div className="flex min-w-0 items-center justify-between gap-3 border-b bg-card/60 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={pastaId ? `/admin/cadernos?pasta=${pastaId}` : '/admin/cadernos'} className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronLeft className="h-5 w-5" /></Link>
          <div className="min-w-0 max-w-[160px] xl:max-w-[240px]">
            <h1 className="truncate text-lg font-bold leading-tight" title={state.meta.nome}>{state.meta.nome}</h1>
            <p className="truncate text-xs text-muted-foreground">Editor unificado · {modsVis.length} modalidade(s)</p>
          </div>
          <label className="ml-3 flex min-w-0 items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs">
            <Database className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="shrink-0 text-muted-foreground">Banco:</span>
            <select value={state.bancoId ?? ''} onChange={(e) => vincularBanco(e.target.value || null)} className="min-w-0 max-w-[220px] truncate bg-transparent text-sm font-medium outline-none">
              <option value="">Nenhum (exemplo)</option>
              {bancos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
          </label>
          <button onClick={() => dispatch({ t: 'setHudMode', v: true })} title="Personalizar as cores da interface da prova (HUD do simulado)"
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-primary/50 bg-gradient-to-r from-primary/20 to-primary/5 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm transition-all hover:-translate-y-px hover:from-primary/30 hover:to-primary/10 hover:shadow">
            <MonitorPlay className="h-4 w-4" /> HUD de Simulado
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {registros.length > 0 && (
            <div className="flex items-center gap-1 rounded-lg border bg-muted/40 px-1.5 py-1 text-xs">
              <Users className="ml-0.5 h-3.5 w-3.5 text-primary" />
              <button onClick={() => dispatch({ t: 'setRegIndex', i: Math.max(0, state.regIndex - 1) })} disabled={state.regIndex === 0} className="rounded p-0.5 hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              <span className="min-w-[110px] truncate text-center font-medium" title={regAtual?.nome}>{regAtual?.nome}</span>
              <span className="text-muted-foreground">{state.regIndex + 1}/{registros.length}</span>
              <button onClick={() => dispatch({ t: 'setRegIndex', i: Math.min(registros.length - 1, state.regIndex + 1) })} disabled={state.regIndex >= registros.length - 1} className="rounded p-0.5 hover:bg-muted disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
          {totalQPreview > 1 && (
            <div className="flex items-center gap-1 rounded-lg border bg-muted/40 px-1.5 py-1 text-xs" title="Navegar pelas questões do repetidor (preview)">
              <Repeat className="ml-0.5 h-3.5 w-3.5 text-primary" />
              <button onClick={() => dispatch({ t: 'setPreviewQ', i: Math.max(0, qIdx - 1) })} disabled={qIdx === 0} className="rounded p-0.5 hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              <span className="min-w-[62px] text-center font-medium">Questão {qIdx + 1}</span>
              <span className="text-muted-foreground">/{totalQPreview}</span>
              <button onClick={() => dispatch({ t: 'setPreviewQ', i: Math.min(totalQPreview - 1, qIdx + 1) })} disabled={qIdx >= totalQPreview - 1} className="rounded p-0.5 hover:bg-muted disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => dispatch({ t: 'undo' })} disabled={h.undo.length === 0} title="Desfazer (Ctrl+Z)"><Undo2 className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => dispatch({ t: 'redo' })} disabled={h.redo.length === 0} title="Refazer (Ctrl+Shift+Z)"><Redo2 className="h-4 w-4" /></Button>
          </div>
          <input ref={fileWordRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importarWord(f); e.target.value = '' }} />
          <Button variant="outline" size="sm" onClick={() => fileWordRef.current?.click()} disabled={importando} title="Importar um Word (.docx) para esta modalidade">
            {importando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileUp className="mr-1.5 h-4 w-4" />} Importar Word
          </Button>
          <a href={`/imprimir/caderno/${cadernoId}?mod=${state.modAtiva}${regAtual ? `&aluno=${regAtual.id}` : ''}`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm"><Printer className="mr-1.5 h-4 w-4" /> Imprimir/PDF</Button>
          </a>
          {registros.length > 0 && <GerarPdfServidor payload={{ tipo: 'caderno', cadernoId, mod: state.modAtiva, todos: true, titulo: `Mala direta — ${state.meta.nome}` }} label={`Mala direta (${registros.length})`} icon={<Users className="mr-1.5 h-4 w-4" />} />}
          <Button onClick={salvar} disabled={pending} size="sm">{pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Salvar</Button>
        </div>
      </div>

      {state.hudMode ? (
        <HudSimuladoEditor base={state.hudCores} porPagina={state.hudPorPagina} onChangePorPagina={(hpp) => dispatch({ t: 'setHudPorPagina', hpp })} onVoltar={() => dispatch({ t: 'setHudMode', v: false })} titulo={state.meta.nome} branding={branding} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[208px_1fr_248px]">
          {/* Esquerda */}
          <div className="scroll-claro flex min-h-0 flex-col gap-4 overflow-y-auto border-r bg-muted/20 p-3">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Modalidade</p>
              <select value={state.modAtiva} onChange={(e) => dispatch({ t: 'setModAtiva', id: e.target.value })} className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm shadow-sm">
                {modsVis.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
              <div className="mt-1.5 flex gap-2 text-[11px]">
                <button onClick={addModalidade} className="text-primary hover:underline">+ Nova</button>
                <button onClick={() => renameModalidade(state.modAtiva)} className="text-muted-foreground hover:underline">Renomear</button>
                <button onClick={() => removeModalidade(state.modAtiva)} className="text-destructive hover:underline">Excluir</button>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Modelos prontos</p>
              <div className="flex flex-col gap-1.5">
                {PRESETS_CADERNO.filter((p) => !OCULTAR_DISCURSIVA || !ehDiscursivaPreset(p)).map((p) => (
                  <button key={p.id} type="button" onClick={() => aplicarPreset(p)} title={p.descricao} className="rounded-lg border bg-background px-2.5 py-2 text-left shadow-sm transition-all hover:border-primary hover:bg-primary/5">
                    <span className="block text-xs font-medium leading-tight">{p.nome}</span>
                    <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">{p.descricao}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Adicionar bloco</p>
              <div className="space-y-3">
                {(['conteudo', 'avaliacao', 'identificacao', 'estrutura'] as const).map((cat) => (
                  <div key={cat}>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{CAT_NOMES[cat]}</p>
                    <div className="flex flex-col gap-1.5">
                      {cats[cat].filter((b) => !b.oculto).map((b) => {
                        const Icon = b.icon
                        const dis = (b.unico && tiposUsados.has(b.type)) || (b.unicoPorPagina && doc.pages.length > 0 && doc.pages.every((p) => p.blocks.some((x) => x.type === b.type)))
                        return (
                          <button key={b.type} disabled={dis} onClick={() => addBlock(b.type)}
                            draggable={!dis} onDragStart={(e) => { dispatch({ t: 'setArrastando', v: true }); e.dataTransfer.setData('text/plain', `novo:${b.type}`) }}
                            className={cn('group flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-left text-xs font-medium shadow-sm transition-all', dis ? 'cursor-not-allowed opacity-40' : 'cursor-grab hover:border-primary hover:shadow hover:translate-x-0.5 active:cursor-grabbing')}>
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground"><Icon size={14} /></span>
                            <span className="leading-tight">{b.title}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Centro: canvas */}
          <div className="scroll-claro min-h-0 overflow-auto bg-[radial-gradient(circle,theme(colors.slate.300)_1px,transparent_1px)] [background-size:18px_18px] px-4 py-5 dark:bg-[radial-gradient(circle,theme(colors.slate.700)_1px,transparent_1px)]">
            <div className="mx-auto flex flex-col items-center gap-3" style={{ width: SHEET_W * ZOOM }}>
              {doc.pages.map((page, pi) => {
                const bg = page.blocks.find((b) => b.type === 'plano-fundo')
                const conteudo = page.blocks.filter((b) => b.type !== 'plano-fundo')
                const mostraCab = running.cabecalhoAtivo && faixaNaPagina(running.cabecalhoPaginas, pi, page.kind)
                const mostraRod = running.rodapeAtivo && faixaNaPagina(running.rodapePaginas, pi, page.kind)
                const cabH = mostraCab ? (running.cabecalhoAltura || PAD_V) + 24 : PAD_V
                const rodH = mostraRod ? (running.rodapeAltura || PAD_V) + 24 : PAD_V
                const renderSheet = (grupo: Block[], si: number, total: number) => (
                  <div style={{ width: SHEET_W * ZOOM, height: SHEET_H * ZOOM }} className="relative">
                    <div onClick={() => sel({ selPage: page.id, selBlock: null, regiao: 'pagina' })}
                      onDragOver={(e) => { e.preventDefault(); dispatch({ t: 'setOver', id: page.id }) }}
                      onDrop={(e) => aoSoltar(e, { kind: 'page', pageId: page.id })}
                      style={{ width: SHEET_W, height: SHEET_H, transform: `scale(${ZOOM})`, transformOrigin: 'top left', background: theme.cores.fundo, boxShadow: '0 2px 16px rgba(0,0,0,.13)',
                        ...(state.overId === page.id ? { outline: `2.5px solid ${REALCE}`, outlineOffset: -2 } : state.arrastando ? { outline: `1.5px solid ${REALCE}`, outlineOffset: -2 } : {}) }}
                      className={cn('relative', !state.arrastando && state.selPage === page.id && state.regiao === 'pagina' && 'ring-2 ring-primary/40')}>
                      {bg && <FundoPagina key={(bg.attributes as any).url || 'sem'} bloco={bg} selecionado={state.selBlock === bg.id} corPrimaria={theme.cores.primaria} onSelect={() => sel({ selBlock: bg.id, aba: 'bloco' })} />}
                      <div className="relative flex h-full flex-col">
                        {mostraCab && <ZonaFaixa reg="cabecalho" blocks={doc.cabecalho ?? []} altura={running.cabecalhoAltura} />}
                        <AutoAnim ativo={!state.arrastando} style={{ paddingTop: mostraCab ? 0 : PAD_V, paddingBottom: mostraRod ? 0 : PAD_V, paddingLeft: PAD_H, paddingRight: PAD_H }} className={cn('relative flex min-h-0 flex-1 flex-col', page.valign === 'center' && 'justify-center', page.valign === 'bottom' && 'justify-end')}>
                          {grupo.length === 0 && !bg && <div className={cn('flex h-[200px] items-center justify-center rounded-lg border-2 border-dashed text-sm transition-colors', state.arrastando ? 'border-primary/50 bg-primary/5 text-primary' : 'border-border text-muted-foreground')}>{state.arrastando ? 'Solte o bloco aqui' : 'Arraste um bloco ou clique para começar'}</div>}
                          <ListaBlocos blocks={grupo} ctx={ctx} />
                        </AutoAnim>
                        {mostraRod && <ZonaFaixa reg="rodape" blocks={doc.rodape ?? []} altura={running.rodapeAltura} />}
                      </div>
                      {bg && si === 0 && <ChipFundo selecionado={state.selBlock === bg.id} corPrimaria={theme.cores.primaria} onSelect={() => sel({ selBlock: bg.id, aba: 'bloco' })} />}
                      {total > 1 && <span style={{ position: 'absolute', right: 6, bottom: 6, zIndex: 16, fontSize: 11, fontWeight: 600, color: '#64748b', background: '#fff', padding: '1px 6px', borderRadius: 5, border: '1px solid #e2e8f0' }}>folha {si + 1}/{total}</span>}
                    </div>
                  </div>
                )
                return (
                  <div key={page.id} className="group/p relative flex flex-col items-center gap-2">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground" style={{ width: SHEET_W * ZOOM }}>
                      <span className="font-medium">{page.titulo} · {PAGE_KINDS.find((k) => k.id === page.kind)?.nome}{running.mostrarNumeroPagina ? ` · pág. ${pi + 1}` : ''}</span>
                      <button onClick={() => removePage(page.id)} className="opacity-0 transition-opacity hover:text-destructive group-hover/p:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    <FolhasPaginadas blocks={conteudo} theme={theme} data={dataAtual} cabH={cabH} rodH={rodH} renderSheet={renderSheet} />
                  </div>
                )
              })}
              <div className="flex flex-wrap justify-center gap-1.5 py-2 pb-10">
                {PAGE_KINDS.map((k) => <button key={k.id} onClick={() => addPage(k.id)} className="flex items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-sm hover:border-primary hover:bg-primary/5"><Plus className="h-3.5 w-3.5" /> {k.nome}</button>)}
              </div>
            </div>
          </div>

          {/* Direita: inspetor */}
          <div className="scroll-claro flex min-h-0 flex-col overflow-y-auto border-l bg-muted/10">
            <div className="grid grid-cols-5 border-b bg-background text-sm">
              {([['bloco', 'Bloco', FileText], ['aparencia', 'Aparência', Palette], ['pagina', 'Páginas', LayoutTemplate], ['faixas', 'Faixas', PanelTop], ['material', 'Material', FileStack]] as const).map(([id, label, Icon]) => (
                <button key={id} onClick={() => dispatch({ t: 'setAba', aba: id })} title={label} className={cn('flex items-center justify-center gap-1 border-b py-2.5 text-[11px]', state.abaDireita === id ? 'border-b-2 border-b-primary font-semibold text-primary' : 'text-muted-foreground hover:text-foreground')}>
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
            <div className="flex-1 p-4">
              {state.abaDireita === 'bloco' && (blocoSel ? (
                <div className="space-y-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">{getBlockMeta(blocoSel.type)?.title}</p>
                  <BlockInspector block={blocoSel} onChange={(patch) => patchBlock(blocoSel.id, patch)} varsExtra={varsExtra} gruposBanco={gruposBanco} assuntosBanco={assuntosBanco} />
                </div>
              ) : <p className="text-sm text-muted-foreground">Selecione um bloco no canvas para editar suas opções.</p>)}

              {state.abaDireita === 'aparencia' && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <p className="text-sm font-semibold">Cores do caderno</p>
                    {([['primaria', 'Primária'], ['secundaria', 'Secundária'], ['acento', 'Acento'], ['texto', 'Texto'], ['fundo', 'Fundo']] as const).map(([k, label]) => (
                      <label key={k} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <HexColorField value={state.cores[k] ?? theme.cores[k]} onChange={(v) => dispatch({ t: 'setCores', cores: { ...state.cores, [k]: v } })} />
                      </label>
                    ))}
                    <button onClick={() => dispatch({ t: 'setCores', cores: {} })} className="text-xs text-muted-foreground hover:underline">Restaurar padrão</button>
                  </div>
                  <div className="space-y-2 border-t pt-3">
                    <p className="text-sm font-semibold">Identidade na lista</p>
                    <label className="block text-xs text-muted-foreground">
                      <span className="mb-1 block">Nome do caderno</span>
                      <input value={state.meta.nome} onChange={(e) => dispatch({ t: 'setMeta', patch: { nome: e.target.value } })} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm text-foreground" />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">Cor do card</span>
                      <HexColorField value={state.meta.cor ?? '#6d28d9'} onChange={(v) => dispatch({ t: 'setMeta', patch: { cor: v } })} />
                    </label>
                    <label className="block text-xs text-muted-foreground">
                      <span className="mb-1 block">Ícone (emoji, opcional)</span>
                      <input value={state.meta.icone ?? ''} onChange={(e) => dispatch({ t: 'setMeta', patch: { icone: e.target.value || null } })} maxLength={4} placeholder="ex.: 📘" className="w-24 rounded-md border bg-background px-2 py-1.5 text-sm text-foreground" />
                    </label>
                    <p className="text-[11px] text-muted-foreground">A identidade aparece no card da lista de cadernos. Salve para aplicar.</p>
                  </div>
                </div>
              )}

              {state.abaDireita === 'pagina' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><p className="text-sm font-semibold">Páginas ({doc.pages.length})</p><span className="text-[10px] text-muted-foreground">use as setas</span></div>
                  {doc.pages.map((p, i) => (
                    <div key={p.id} onClick={() => sel({ selPage: p.id })} className={cn('flex items-start gap-1.5 rounded-md border bg-background p-2 transition-colors', state.selPage === p.id && 'border-primary')}>
                      <span className="mt-1 flex flex-col items-center gap-0.5 text-muted-foreground"><GripVertical className="h-3.5 w-3.5" /></span>
                      <div className="min-w-0 flex-1">
                        <input value={p.titulo ?? ''} onChange={(e) => setDoc((d) => ({ ...d, pages: d.pages.map((x) => x.id === p.id ? { ...x, titulo: e.target.value } : x) }), true)} onClick={(e) => e.stopPropagation()} className="w-full bg-transparent text-sm font-medium outline-none" />
                        <select value={p.kind} onChange={(e) => setDoc((d) => ({ ...d, pages: d.pages.map((x) => x.id === p.id ? { ...x, kind: e.target.value as PageKind } : x) }))} onClick={(e) => e.stopPropagation()} className="mt-1 w-full rounded border bg-background px-1.5 py-1 text-xs">
                          {PAGE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.nome}</option>)}
                        </select>
                        <div className="mt-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <span className="mr-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">Alinh. vertical</span>
                          {([['top', 'Topo'], ['center', 'Centro'], ['bottom', 'Rodapé']] as const).map(([v, label]) => (
                            <button key={v} type="button" onClick={() => setDoc((d) => ({ ...d, pages: d.pages.map((x) => x.id === p.id ? { ...x, valign: v } : x) }))} className={cn('flex-1 rounded border px-1 py-0.5 text-[10px] transition-colors', (p.valign ?? 'top') === v ? 'border-primary bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted')}>{label}</button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-0.5 flex flex-col">
                        <button type="button" onClick={(e) => { e.stopPropagation(); moverPagina(i, i - 1) }} disabled={i === 0} title="Subir" className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); moverPagina(i, i + 1) }} disabled={i === doc.pages.length - 1} title="Descer" className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {state.abaDireita === 'faixas' && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold">Cabeçalho e rodapé</p>
                  {(() => {
                    const setRun = (patch: Partial<typeof running>) => setDoc((d) => ({ ...d, running: { ...(d.running ?? RUNNING_PADRAO), ...patch } }))
                    const FaixaCfg = ({ reg }: { reg: 'cabecalho' | 'rodape' }) => {
                      const isCab = reg === 'cabecalho'
                      const ativo = isCab ? running.cabecalhoAtivo : running.rodapeAtivo
                      const altura = (isCab ? running.cabecalhoAltura : running.rodapeAltura) ?? 0
                      const paginas = (isCab ? running.cabecalhoPaginas : running.rodapePaginas) ?? 'todas'
                      return (
                        <div className="rounded-lg border p-2.5">
                          <label className="flex items-center justify-between gap-2 text-sm font-medium">
                            <span className="flex items-center gap-1.5">{isCab ? <PanelTop className="h-4 w-4" /> : <PanelBottom className="h-4 w-4" />} {isCab ? 'Cabeçalho' : 'Rodapé'}</span>
                            <input type="checkbox" checked={ativo} onChange={(e) => setRun(isCab ? { cabecalhoAtivo: e.target.checked } : { rodapeAtivo: e.target.checked })} />
                          </label>
                          {ativo && (
                            <div className="mt-2.5 space-y-2.5 border-t pt-2.5">
                              <div>
                                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground"><span>Altura (px) — 0 = automática</span><span className="font-medium">{altura || 'auto'}</span></div>
                                <div className="flex items-center gap-2">
                                  <input type="range" min={0} max={Math.round(SHEET_H / 2)} value={altura} onChange={(e) => setRun(isCab ? { cabecalhoAltura: Number(e.target.value) } : { rodapeAltura: Number(e.target.value) })} className="flex-1" />
                                  <input type="number" min={0} max={Math.round(SHEET_H / 2)} value={altura} onChange={(e) => setRun(isCab ? { cabecalhoAltura: Number(e.target.value) } : { rodapeAltura: Number(e.target.value) })} className="w-16 rounded-md border bg-[var(--input-bg,transparent)] px-2 py-1 text-sm" />
                                </div>
                              </div>
                              <label className="block text-xs text-muted-foreground">
                                <span className="mb-1 block">Aparece em</span>
                                <select value={paginas} onChange={(e) => setRun(isCab ? { cabecalhoPaginas: e.target.value as FaixaPaginas } : { rodapePaginas: e.target.value as FaixaPaginas })} className="w-full rounded-md border bg-[var(--input-bg,transparent)] px-2 py-1.5 text-sm text-foreground">
                                  <option value="todas">Todas as páginas</option>
                                  <option value="exceto_capa">Todas, exceto a capa</option>
                                  <option value="exceto_primeira">Todas, exceto a 1ª</option>
                                  <option value="somente_primeira">Somente a 1ª página</option>
                                </select>
                              </label>
                            </div>
                          )}
                        </div>
                      )
                    }
                    return (<div className="space-y-2.5"><FaixaCfg reg="cabecalho" /><FaixaCfg reg="rodape" /></div>)
                  })()}
                  <label className="flex items-center justify-between gap-2 text-sm"><span>Mostrar número de página</span><input type="checkbox" checked={running.mostrarNumeroPagina} onChange={(e) => setDoc((d) => ({ ...d, running: { ...(d.running ?? RUNNING_PADRAO), mostrarNumeroPagina: e.target.checked } }))} /></label>
                  <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">Ative a faixa, clique nela na folha e adicione blocos (logo, texto, imagem…). A área fica reservada — o conteúdo do meio não a invade.</p>
                </div>
              )}

              {state.abaDireita === 'material' && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold">Material em PDF (entregue ao aluno)</p>
                  {semVinculo && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-400/50 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Este caderno <strong>não está vinculado</strong> a nenhum simulado ou banco — o material não chega ao aluno. Vincule o caderno a um banco (na tela do Banco de Questões) ou a um simulado.</span>
                    </div>
                  )}
                  {linkagem && !semVinculo && <p className="text-[11px] text-muted-foreground">Usado em {linkagem.simulados} simulado(s) e {linkagem.bancos} banco(s).</p>}
                  <SlotMaterial titulo="Gabarito Comentado" descricao="Entregue quando o gabarito é liberado (some se não houver PDF)." material={mat} enviando={enviandoMat === 'material'} onEnviar={(f) => enviarMaterial(f, 'material')} onRemover={() => removerMaterial('material')} />
                  <SlotMaterial titulo="Enunciado de Questões" descricao="Baixado ANTES de iniciar — substitui o Caderno de Questões gerado." material={matEnun} enviando={enviandoMat === 'enunciado'} onEnviar={(f) => enviarMaterial(f, 'enunciado')} onRemover={() => removerMaterial('enunciado')} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Slot de upload/preview/remoção de um PDF de material. */
function SlotMaterial({ titulo, descricao, material, enviando, onEnviar, onRemover }: { titulo: string; descricao: string; material: { pdfUrl: string; pdfNome: string }; enviando: boolean; onEnviar: (f: File) => void; onRemover: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const tem = !!material.pdfUrl
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-xs font-semibold">{titulo}</p>
      <p className="mb-2 text-[10px] leading-snug text-muted-foreground">{descricao}</p>
      <input ref={ref} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onEnviar(f); e.target.value = '' }} />
      {tem ? (
        <div className="space-y-1.5">
          <a href={material.pdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 truncate text-xs text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{material.pdfNome || 'Ver PDF'}</span></a>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 flex-1 text-xs" onClick={() => ref.current?.click()} disabled={enviando}>{enviando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />} Trocar</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={onRemover} disabled={enviando}><X className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-8 w-full text-xs" onClick={() => ref.current?.click()} disabled={enviando}>{enviando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />} Enviar PDF</Button>
      )}
    </div>
  )
}
