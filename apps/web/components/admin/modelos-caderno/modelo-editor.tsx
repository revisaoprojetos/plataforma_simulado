'use client'

import { Fragment, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ChevronLeft, Save, Loader2, LayoutTemplate, Menu, Undo2, Redo2, X, Pencil, FileUp, MoveVertical,
  Trash2, Plus, ArrowUp, ArrowDown, GripVertical, LayoutGrid, Type, Copy,
} from 'lucide-react'
import { HexColorField } from '@/components/admin/hex-color-field'
import { FONTES_CADERNO } from '@/lib/caderno-designer/theme'
import { PreviaBlocos, capaPadraoDoPreset, docDoPreset, idsDeterministicos } from '@/lib/caderno-teste/previa-blocos'
import { Previa, outlineDoItem, type DiagEntrada, type TipoBloco } from '@/lib/caderno-teste/previa'
import { presetDoItem, metaDaModalidade, CAPA_PADRAO, type ItemCaderno, type BuilderAjustes, type CapaConfig, type PreviewQuestao, type DiagConteudo } from '@/lib/caderno-teste/tipos'
import { DIAG_PADRAO } from '@/lib/caderno-teste/diagnostico'
import { camposDoBloco, aplicarCampoBloco, podeRemoverParte, removerParteDiag } from '@/lib/caderno-teste/edicao'
import { acharBloco, atualizarBlocoAttrs, removerBloco, adicionarBlocoDoc, adicionarBlocoEmContainer, moverBlocoDoc, NOME_BLOCO, camposDoBlocoDoc } from '@/lib/caderno-teste/edicao-doc'
import { createBlock } from '@/lib/caderno-designer/blocks'
import type { CadernoDoc } from '@/lib/caderno-designer/types'
import { salvarModelo, criarModeloComConfig } from '@/app/admin/modelos-caderno/actions'
import { useZoomAjustado, EditorBoundary, Tog, Segment, CampoAltura, CampoImagem, CampoBlocoEditor, CampoFormatavel, DocEstruturaPanel, BLOCOS_ADD, ICONE_TIPO } from './_campos'

/** Questões de EXEMPLO — um modelo é sobre layout/estilo, não sobre questões reais. */
const SAMPLE: PreviewQuestao[] = Array.from({ length: 6 }, (_, i) => ({
  id: `ex-${i + 1}`, numero: i + 1, tipo: 'objetiva',
  enunciado: `Questão de exemplo ${i + 1}: enunciado ilustrativo para pré-visualizar o layout do modelo. As questões reais entram quando o modelo é usado num simulado.`,
  alternativas: ['A', 'B', 'C', 'D', 'E'].map((l, j) => ({ letra: l, texto: `Alternativa ${l} de exemplo.`, correta: j === 1, comentario: j === 1 ? 'Comentário de exemplo da alternativa correta.' : '' })),
}))
const SEM_VARS: Record<string, string> = {}

export function ModeloEditor(props: { id: string; nomeInicial: string; configInicial: unknown }) {
  return <EditorBoundary><ModeloEditorBase {...props} /></EditorBoundary>
}

function ModeloEditorBase({ id, nomeInicial, configInicial }: { id: string; nomeInicial: string; configInicial: unknown }) {
  const router = useRouter()
  const cfg = (configInicial ?? {}) as { item?: ItemCaderno }
  const inicial = cfg?.item ?? null

  // Histórico (desfazer/refazer) sobre o ItemCaderno.
  const histRef = useRef<ItemCaderno[]>(inicial ? [inicial] : [])
  const idxRef = useRef(0)
  const lastTsRef = useRef(0)
  const [, setTick] = useState(0)
  const bump = () => setTick((x) => x + 1)
  const item = histRef.current[idxRef.current] ?? null
  const setItem = (updater: ItemCaderno | ((it: ItemCaderno) => ItemCaderno)) => {
    const prev = histRef.current[idxRef.current]; if (!prev) return
    const next = typeof updater === 'function' ? (updater as (it: ItemCaderno) => ItemCaderno)(prev) : updater
    if (next === prev) return
    const now = performance.now()
    const coalesce = now - lastTsRef.current < 500 && idxRef.current > 0
    lastTsRef.current = now
    let h = histRef.current.slice(0, idxRef.current + 1)
    if (coalesce) h[h.length - 1] = next; else h.push(next)
    if (h.length > 80) h = h.slice(h.length - 80)
    histRef.current = h; idxRef.current = h.length - 1; bump()
  }
  const undo = () => { if (idxRef.current > 0) { idxRef.current--; lastTsRef.current = 0; bump() } }
  const redo = () => { if (idxRef.current < histRef.current.length - 1) { idxRef.current++; lastTsRef.current = 0; bump() } }
  const podeUndo = idxRef.current > 0
  const podeRedo = idxRef.current < histRef.current.length - 1

  const [nome, setNome] = useState(nomeInicial)
  const baselineRef = useRef(JSON.stringify({ nome: nomeInicial, item: inicial }))
  const sujo = JSON.stringify({ nome, item }) !== baselineRef.current
  const sujoRef = useRef(false); sujoRef.current = sujo

  const [pending, start] = useTransition()
  const importRef = useRef<HTMLInputElement>(null)
  const [importando, setImportando] = useState(false)
  const { ref, zoom } = useZoomAjustado()
  const [pickerCor, setPickerCor] = useState<{ parte: string; label: string; cor: string } | null>(null)
  const [pickerCapa, setPickerCapa] = useState(false)
  const [pickerBloco, setPickerBloco] = useState<string | null>(null)
  const [estruturaAberta, setEstruturaAberta] = useState(false)
  const [origemEstrutura, setOrigemEstrutura] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (sujoRef.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo() }
      else if (k === 's') { e.preventDefault(); salvar() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!item) return <div className="p-8 text-center text-sm text-muted-foreground">Modelo sem conteúdo.</div>

  const a = item.ajustes
  const preset = presetDoItem(item)
  const meta = metaDaModalidade(item.modalidade)
  const modeloNome = meta.modelos.find((m) => m.id === item.modelo)?.nome ?? item.modelo
  const docEfetivo: CadernoDoc | null = preset ? idsDeterministicos(item.docEdit ?? docDoPreset(preset)!) : null
  const blocoSel = pickerBloco && docEfetivo ? acharBloco(docEfetivo, pickerBloco) : null
  const capaEfetiva: CapaConfig = item.capa ?? (preset ? capaPadraoDoPreset(preset) : CAPA_PADRAO)
  const outline: DiagEntrada[] = item.modalidade === 'diagnostico' ? outlineDoItem(item, SAMPLE, SEM_VARS, []) : []
  const temEstrutura = item.modalidade === 'diagnostico' || !!preset

  const setAjuste = (patch: Partial<BuilderAjustes>) => setItem((it) => ({ ...it, ajustes: { ...it.ajustes, ...patch } }))
  const setConteudo = (conteudo: DiagConteudo) => setItem((it) => ({ ...it, conteudo }))
  const patchAtivo = (fn: (it: ItemCaderno) => ItemCaderno) => setItem(fn)
  const setCapa = (patch: Partial<CapaConfig>) => setItem((it) => {
    const p = presetDoItem(it); const base = it.capa ?? (p ? capaPadraoDoPreset(p) : CAPA_PADRAO)
    return { ...it, capa: { ...base, ...patch } }
  })
  const setBlocoAttr = (bid: string, patch: Record<string, unknown>) => setItem((it) => {
    const p = presetDoItem(it); const raw = it.docEdit ?? (p ? docDoPreset(p) : null); if (!raw) return it
    return { ...it, docEdit: atualizarBlocoAttrs(idsDeterministicos(raw), bid, patch) }
  })
  const removerBlocoDoc = (bid: string) => { setItem((it) => { const p = presetDoItem(it); const raw = it.docEdit ?? (p ? docDoPreset(p) : null); if (!raw) return it; return { ...it, docEdit: removerBloco(idsDeterministicos(raw), bid) } }); setPickerBloco(null) }
  const mutarDoc = (fn: (doc: CadernoDoc) => CadernoDoc) => setItem((it) => { const p = presetDoItem(it); const raw = it.docEdit ?? (p ? docDoPreset(p) : null); if (!raw) return it; return { ...it, docEdit: fn(idsDeterministicos(raw)) } })
  const criarCardComTexto = () => { const card = createBlock('card'); card.innerBlocks = [createBlock('texto-livre')]; return card }
  const adicionarBlocoDocAtivo = (type: string) => mutarDoc((doc) => adicionarBlocoDoc(doc, type === 'card' ? criarCardComTexto() : createBlock(type)))
  const moverBlocoDocAtivo = (bid: string, dir: -1 | 1) => mutarDoc((doc) => moverBlocoDoc(doc, bid, dir))
  const adicionarTextoNoCard = (cardId: string) => mutarDoc((doc) => adicionarBlocoEmContainer(doc, cardId, createBlock('texto-livre')))
  const removerBlocoInterno = (bid: string) => mutarDoc((doc) => removerBloco(doc, bid))

  const conteudoBase = () => item.conteudo ?? DIAG_PADRAO
  const reordenar = (keys: string[]) => setConteudo({ ...conteudoBase(), ordem: keys })
  function moverEntrada(idx: number, dir: -1 | 1) { const keys = outline.map((e) => e.key); const j = idx + dir; if (j < 0 || j >= keys.length) return;[keys[idx], keys[j]] = [keys[j], keys[idx]]; reordenar(keys) }
  function soltarEntrada(from: number, to: number) { if (from === to) return; const keys = outline.map((e) => e.key); const [k] = keys.splice(from, 1); keys.splice(to, 0, k); reordenar(keys) }
  function apagarParte(parte: string) {
    if (parte === 'diag_cab' || parte === 'diag_cab_titulo' || parte === 'diag_cab_sub') { setAjuste({ mostrarCabecalho: false }); return }
    setConteudo(removerParteDiag(item.conteudo, parte))
  }
  function apagarEntrada(e: DiagEntrada) { try { apagarParte(e.apagar); if (pickerCor && (pickerCor.parte === e.parte || pickerCor.parte === e.apagar)) setPickerCor(null) } catch { toast.error('Não foi possível apagar este bloco.') } }
  function abrirEdicaoDeParte(parte: string, label: string) { setOrigemEstrutura(true); setEstruturaAberta(false); setPickerBloco(null); setPickerCapa(false); setPickerCor({ parte, label, cor: a.coresParte?.[parte] ?? a.corPrimaria }) }
  function editarEntrada(e: DiagEntrada) { if (e.parte) abrirEdicaoDeParte(e.parte, e.label) }
  function moverPilar(i: number, dir: -1 | 1) { const pilares = [...conteudoBase().pilares]; const j = i + dir; if (j < 0 || j >= pilares.length) return;[pilares[i], pilares[j]] = [pilares[j], pilares[i]]; setConteudo({ ...conteudoBase(), pilares }) }
  function apagarPilar(i: number) { setConteudo({ ...conteudoBase(), pilares: conteudoBase().pilares.filter((_, j) => j !== i) }) }
  const fecharPickerCor = () => { setPickerCor(null); setOrigemEstrutura(false) }

  const adicionarBloco = (tipo: string, count?: number) => {
    const ordem = outline.map((e) => e.key)
    const dc = <T,>(v: T): T => { try { return structuredClone(v) } catch { return JSON.parse(JSON.stringify(v)) } }
    patchAtivo((it) => {
      const c = it.conteudo ?? DIAG_PADRAO
      const most = (...chaves: string[]) => (c.partesOcultas ?? []).filter((p) => !chaves.includes(p))
      const base: ItemCaderno = (() => {
        switch (tipo) {
          case 'cabecalho': return { ...it, ajustes: { ...it.ajustes, mostrarCabecalho: true } }
          case 'nome': return { ...it, ajustes: { ...it.ajustes, mostrarDadosAluno: true }, conteudo: { ...c, partesOcultas: most('nome') } }
          case 'dados_card': return { ...it, conteudo: { ...c, dadosCard: true } }
          case 'nota': return { ...it, conteudo: { ...c, partesOcultas: most('nota') } }
          case 'texto': return { ...it, conteudo: { ...c, intro: [...c.intro, 'Novo parágrafo — clique na prévia para editar.'] } }
          case 'card': return { ...it, conteudo: { ...c, cards: [...(c.cards ?? []), { texto: 'NOVA SEÇÃO' }] } }
          case 'fita': return { ...it, conteudo: { ...c, fitas: [...(c.fitas ?? []), { texto: 'Observação 1 — clique na prévia para editar.\nObservação 2\nObservação 3' }] } }
          case 'card_texto': return { ...it, conteudo: { ...c, cardsTexto: [...(c.cardsTexto ?? []), { textos: ['Novo texto — clique na prévia para editar.'] }] } }
          case 'pilares': {
            const n = Math.max(1, Math.min(4, count ?? 3))
            const base4 = [dc(DIAG_PADRAO.pilares[0]), dc(DIAG_PADRAO.pilares[1]), dc(DIAG_PADRAO.pilares[2]), { nome: 'NOVO PILAR', chave: '', totalTxt: '', bandas: [{ faixa: '0-49', texto: '' }, { faixa: '50-80', texto: '' }, { faixa: '81-100', texto: '' }] }]
            return { ...it, conteudo: { ...c, pilaresGrupos: [...(c.pilaresGrupos ?? []), base4.slice(0, n)] } }
          }
          case 'disciplinas': return { ...it, conteudo: { ...c, disciplinas: c.disciplinas.length ? c.disciplinas : [{ nome: 'Disciplina', chave: 'disciplina', total: 'x/N', categoria: 'Assunto' }], disciplinasIntro: c.disciplinasIntro || DIAG_PADRAO.disciplinasIntro, partesOcultas: most('disciplinas', 'sec_disciplinas') } }
          case 'disc_individual': return { ...it, conteudo: { ...c, discsIndividuais: [...(c.discsIndividuais ?? []), { chave: 'disciplina', pos: 'top' as const }] } }
          case 'sug_individual': return { ...it, conteudo: { ...c, sugsIndividuais: [...(c.sugsIndividuais ?? []), { titulo: 'NOVA SUGESTÃO', prioridade: 'Prioridade Alta', intro: '', itens: [] }] } }
          case 'sugestoes': return { ...it, conteudo: { ...c, sugestoes: [...c.sugestoes, { titulo: 'NOVA SUGESTÃO', prioridade: 'Prioridade Alta', intro: '', itens: [] }], tituloSugestoes: c.tituloSugestoes ?? 'Sugestões de estudo', partesOcultas: most('sugestoes', 'sec_sugestoes') } }
          case 'gabarito': return { ...it, conteudo: { ...c, gabaritoTitulo: c.gabaritoTitulo || 'GABARITO OFICIAL DESATUALIZADO', gabaritoIntro: c.gabaritoIntro.length ? c.gabaritoIntro : ['Observações sobre questões que sofreram atualização.'], partesOcultas: most('gabarito', 'sec_gabarito') } }
          default: return it
        }
      })()
      return { ...base, conteudo: { ...(base.conteudo ?? c), ordem } }
    })
  }

  function salvar() {
    start(async () => {
      // Preserva metadados do config (origem/padraoRef) — só sobrescreve v/item.
      const r = await salvarModelo(id, { nome: nome.trim() || 'Modelo', config: { ...((configInicial as Record<string, unknown>) ?? {}), v: 1, item }, modalidade: item.modalidade })
      if (r.ok) { baselineRef.current = JSON.stringify({ nome, item }); bump(); toast.success('Modelo salvo') }
      else toast.error(r.error ?? 'Erro ao salvar')
    })
  }
  function salvarComo() {
    const novoNome = window.prompt('Nome da cópia:', `${nome} (cópia)`)
    if (novoNome == null || !novoNome.trim()) return
    start(async () => {
      const r = await criarModeloComConfig(novoNome.trim(), { v: 1, item }, item.modalidade, 'copia', null)
      if (r.ok && r.id) { toast.success('Salvo como novo modelo'); router.push(`/admin/modelos-caderno/${r.id}`) }
      else toast.error(r.error ?? 'Erro')
    })
  }
  async function sair() {
    if (sujo && !(await confirmar({ titulo: 'Sair sem salvar?', mensagem: 'Há alterações não salvas neste modelo.', confirmar: 'Sair sem salvar', destrutivo: true }))) return
    router.push('/admin/modelos-caderno')
  }
  // Import (só diagnóstico): Word/PDF/HTML → conteúdo do diagnóstico (round-trip do .docx nativo exportado).
  async function importarDoc(f: File | null) {
    if (!f) return
    setImportando(true)
    try {
      const fd = new FormData(); fd.append('file', f)
      const r = await fetch('/api/admin/caderno-teste/importar', { method: 'POST', body: fd })
      const j = await r.json()
      if (!j.ok) { toast.error(j.error ?? 'Falha ao importar'); return }
      if (j.item && typeof j.item === 'object') {
        // Round-trip FIEL: o .docx trazia a config embutida → restaura o item idêntico ao original
        // (mantém só o id atual do editor, que é interno).
        setItem((it) => ({ ...(j.item as ItemCaderno), id: it.id }))
      } else {
        // Import EXTERNO (heurística) num MODELO = TEMPLATE. Duas coisas:
        // 1) Garante cabeçalho + nome do estudante (partes padrão do diagnóstico).
        // 2) NÃO fixa as disciplinas específicas do doc: o modelo deve MAPEAR as disciplinas do BANCO
        //    quando for usado num simulado (senão bugaria com outras disciplinas). Deixa um placeholder
        //    genérico e zera os mapeamentos por-disciplina. (Import ligado a um banco no builder usa as reais.)
        const oc = (j.conteudo?.partesOcultas ?? []).filter((p: string) => p !== 'nome' && p !== 'nota')
        const conteudo = {
          ...j.conteudo,
          partesOcultas: oc,
          disciplinas: [{ nome: 'Disciplina', chave: 'disciplina', total: 'x/N', categoria: 'Assunto' }],
          discNomes: {}, discFonte: {}, discCorTexto: {}, discOcultas: [],
        }
        setItem((it) => ({ ...it, conteudo, ajustes: { ...it.ajustes, ...(j.ajustes ?? {}), mostrarCabecalho: true, mostrarDadosAluno: true }, capa: j.capa ?? it.capa }))
      }
      if (Array.isArray(j.avisos) && j.avisos.length) toast(j.avisos.slice(0, 2).join(' · '))
      toast.success('Documento importado')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao importar') }
    finally { setImportando(false) }
  }

  return (
    <div className="-m-6 flex h-screen flex-col overflow-hidden bg-background">
      {/* Top bar */}
      <div className="relative z-30 flex items-center justify-between gap-3 border-b bg-card/60 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={sair} title="Voltar" className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronLeft className="h-5 w-5" /></button>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><LayoutTemplate className="h-4 w-4" /></span>
          <div className="min-w-0">
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do modelo" className="w-full max-w-xs rounded-md border-transparent bg-transparent px-1 text-base font-bold leading-tight outline-none hover:border-border focus:border-border focus:bg-background" />
            <p className="truncate px-1 text-xs text-muted-foreground">{meta.nome} · {modeloNome}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-lg border">
            <button type="button" onClick={undo} disabled={!podeUndo} title="Desfazer (Ctrl+Z)" className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
            <button type="button" onClick={redo} disabled={!podeRedo} title="Refazer (Ctrl+Shift+Z)" className="flex h-8 w-8 items-center justify-center border-l text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
          </div>
          {item.modalidade === 'diagnostico' && (
            <>
              <input ref={importRef} type="file" accept=".docx,.html,.pdf" className="hidden" onChange={(e) => { importarDoc(e.target.files?.[0] ?? null); e.target.value = '' }} />
              <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} disabled={importando || pending} title="Importar Word/PDF/HTML (diagnóstico)">{importando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileUp className="mr-1.5 h-4 w-4" />} Importar</Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={salvarComo} disabled={pending} title="Salvar como uma cópia editável"><Copy className="mr-1.5 h-4 w-4" /> Salvar como</Button>
          <span className={cn('hidden items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium sm:inline-flex', sujo ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400')}>
            <span className={cn('h-1.5 w-1.5 rounded-full', sujo ? 'bg-amber-500' : 'bg-emerald-500')} />
            {sujo ? 'Não salvo' : 'Salvo'}
          </span>
          <Button onClick={salvar} disabled={pending} size="sm">{pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Salvar</Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[340px_1fr]">
        {/* Painel esquerdo */}
        <div className="scroll-claro grid min-h-0 grid-cols-2 content-start gap-x-2.5 gap-y-3 overflow-y-auto border-r bg-muted/20 p-3">
          <label className="col-span-2 block text-xs text-muted-foreground">
            <span className="mb-1 block font-medium">Título</span>
            <input value={a.titulo} onChange={(e) => setAjuste({ titulo: e.target.value })} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm text-foreground" />
          </label>
          <div className="col-span-2 rounded-md border border-dashed px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">🎨 Clique em qualquer bloco na prévia para editar cor, fonte e texto. Use <strong>Estrutura</strong> (canto sup. direito da prévia) para adicionar/ordenar blocos.</div>

          {(item.modalidade === 'caderno_questoes' || item.modalidade === 'caderno_completo') && <>
            <div className="col-span-1"><Tog label="Gabarito" checked={!!a.mostrarGabarito} onChange={(v) => setAjuste({ mostrarGabarito: v })} /></div>
            <div className="col-span-1"><Tog label="Comentários" checked={!!a.mostrarComentarios} onChange={(v) => setAjuste({ mostrarComentarios: v })} /></div>
          </>}
          {(item.modalidade === 'caderno_questoes' || item.modalidade === 'caderno_completo' || item.modalidade === 'folha_respostas') && (
            <div className="col-span-1"><Segment label="Nº alternativas" valor={a.numAlternativas} opcoes={[4, 5]} onChange={(n) => setAjuste({ numAlternativas: n })} /></div>
          )}
          {item.modalidade === 'folha_respostas' && (
            <div className="col-span-1"><Segment label="Colunas" valor={a.colunas} opcoes={[2, 3, 4, 5]} onChange={(n) => setAjuste({ colunas: n })} /></div>
          )}

          <div className="col-span-2 mt-1"><p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><FileUp className="h-3.5 w-3.5" /> Capa e contracapa</p></div>
          <div className="col-span-1"><CampoImagem label="Capa (frente)" valor={a.capaUrl} onChange={(url) => setAjuste({ capaUrl: url })} /></div>
          <div className="col-span-1"><CampoImagem label="Última folha (fundo)" valor={a.ultimaUrl} onChange={(url) => setAjuste({ ultimaUrl: url })} /></div>
          <div className="col-span-2 mt-1"><p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><FileUp className="h-3.5 w-3.5" /> Fundo e faixas (por página)</p></div>
          <div className="col-span-1"><CampoImagem label="Folha (fundo)" valor={a.folhaUrl} onChange={(url) => setAjuste({ folhaUrl: url })} /></div>
          <div className="col-span-1"><CampoImagem label="Cabeçalho (faixa)" valor={a.cabecalhoUrl} onChange={(url) => setAjuste({ cabecalhoUrl: url })} /></div>
          <div className="col-span-1"><CampoImagem label="Rodapé (faixa)" valor={a.rodapeUrl} onChange={(url) => setAjuste({ rodapeUrl: url })} /></div>
          <div className="col-span-2 rounded-md border border-dashed px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">📐 A4 retrato = 794 × 1123 px. Capa/última/folha: página inteira. Cabeçalho ~794 × 96 · Rodapé ~794 × 84.</div>

          <div className="col-span-2 mt-1"><p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><MoveVertical className="h-3.5 w-3.5" /> Espaçamento (topo e base)</p></div>
          <div className="col-span-1"><CampoAltura label="Topo" valor={a.margemTopo} onChange={(n) => setAjuste({ margemTopo: n })} /></div>
          <div className="col-span-1"><CampoAltura label="Base" valor={a.margemBase} onChange={(n) => setAjuste({ margemBase: n })} /></div>
        </div>

        {/* Prévia */}
        <div ref={ref} className="scroll-claro relative min-h-0 overflow-auto bg-[radial-gradient(circle,theme(colors.slate.300)_1px,transparent_1px)] [background-size:18px_18px] px-3 py-5 dark:bg-[radial-gradient(circle,theme(colors.slate.700)_1px,transparent_1px)]">
          {temEstrutura && (
            <div className="pointer-events-none sticky top-0 z-20 -mt-2 mb-1 flex justify-end pr-1">
              <button type="button" onClick={() => { setPickerCor(null); setPickerCapa(false); setPickerBloco(null); setEstruturaAberta(true) }} title="Estrutura (ordenar, editar e adicionar blocos)"
                className="pointer-events-auto flex items-center gap-1.5 rounded-lg border bg-background/95 px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition-colors hover:border-primary/50">
                <Menu className="h-4 w-4" /> Estrutura
              </button>
            </div>
          )}
          <div key={`${item.modalidade}:${item.modelo}`} className="mx-auto" style={{ zoom } as Record<string, unknown>}>
            {preset ? (
              <PreviaBlocos presetId={preset} questoes={SAMPLE} vars={SEM_VARS} titulo={a.titulo} capaUrl={a.capaUrl} ultimaUrl={a.ultimaUrl} folhaUrl={a.folhaUrl} cabecalhoUrl={a.cabecalhoUrl} rodapeUrl={a.rodapeUrl} margemTopo={a.margemTopo} margemBase={a.margemBase}
                capa={item.capa} onPickCapa={() => { setEstruturaAberta(false); setPickerCapa(true); setPickerCor(null); setPickerBloco(null) }} selCapa={pickerCapa}
                docOverride={item.docEdit} onPickBloco={(bid) => { setEstruturaAberta(false); setOrigemEstrutura(false); setPickerBloco(bid); setPickerCapa(false); setPickerCor(null) }} selBlocoId={pickerBloco} />
            ) : (
              <Previa item={item} questoes={SAMPLE} vars={SEM_VARS} discBanco={[]} selParte={pickerCor?.parte}
                onPick={(parte, label, cor) => { setEstruturaAberta(false); setOrigemEstrutura(false); setPickerCapa(false); setPickerBloco(null); setPickerCor({ parte, label, cor }) }}
                onPickCapa={() => { setEstruturaAberta(false); setOrigemEstrutura(false); setPickerCapa(true); setPickerCor(null); setPickerBloco(null) }} selCapa={pickerCapa} />
            )}
          </div>
        </div>
      </div>

      {/* Inspector — parte (diagnóstico / questões) */}
      {pickerCor && (() => {
        const campos = camposDoBloco(item, pickerCor.parte, pickerCor.label)
        const onCampo = (campo: (typeof campos)[number], v: string) => campo.alvo === 'titulo' ? setAjuste({ titulo: v }) : setConteudo(aplicarCampoBloco(item.conteudo, pickerCor.parte, campo.id, v))
        const temCorTexto = pickerCor.parte === 'diag_cab' || pickerCor.parte.startsWith('sec_') || pickerCor.parte.startsWith('card:')
        const base = a.compacto ? 9 : 10
        const px = Math.round((a.tamanhoParte?.[pickerCor.parte] ?? 1) * base)
        const setPx = (v: number) => { const nv = Math.min(48, Math.max(6, Math.round(v))); const t = { ...(a.tamanhoParte ?? {}) }; if (nv === base) delete t[pickerCor.parte]; else t[pickerCor.parte] = Math.round((nv / base) * 100) / 100; setAjuste({ tamanhoParte: t }) }
        const TAMS = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36]
        return (
          <InspectorAside titulo={pickerCor.label} onClose={fecharPickerCor} voltar={origemEstrutura ? () => { setPickerCor(null); setOrigemEstrutura(false); setEstruturaAberta(true) } : undefined}>
            {temCorTexto ? (
              <div className="grid grid-cols-2 gap-2">
                <div><div className="mb-1 text-[11px] text-muted-foreground">Cor</div><HexColorField value={a.coresParte?.[pickerCor.parte] ?? pickerCor.cor} onChange={(v) => setAjuste({ coresParte: { ...(a.coresParte ?? {}), [pickerCor.parte]: v } })} /></div>
                <div><div className="mb-1 text-[11px] text-muted-foreground">Cor do texto</div><HexColorField value={a.coresTextoParte?.[pickerCor.parte] || '#ffffff'} onChange={(v) => setAjuste({ coresTextoParte: { ...(a.coresTextoParte ?? {}), [pickerCor.parte]: v } })} /></div>
              </div>
            ) : (
              <>
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Cor</div>
                <HexColorField value={a.coresParte?.[pickerCor.parte] ?? pickerCor.cor} onChange={(v) => setAjuste({ coresParte: { ...(a.coresParte ?? {}), [pickerCor.parte]: v } })} />
                {a.coresParte?.[pickerCor.parte] && <button onClick={() => { const cp = { ...(a.coresParte ?? {}) }; delete cp[pickerCor.parte]; setAjuste({ coresParte: cp }) }} className="mt-2 text-[11px] text-muted-foreground hover:underline">Restaurar cor padrão</button>}
              </>
            )}
            <div className="mt-3">
              <div className="mb-1 text-[11px] text-muted-foreground">Alinhamento</div>
              <div className="flex overflow-hidden rounded-md border">
                {([['left', 'Esq.'], ['center', 'Centro'], ['right', 'Dir.'], ['justify', 'Justif.']] as const).map(([v, lbl]) => (
                  <button key={v} type="button" onClick={() => setAjuste({ alinhamentoParte: { ...(a.alinhamentoParte ?? {}), [pickerCor.parte]: v } })} className={cn('flex-1 py-1 text-[11px]', (a.alinhamentoParte?.[pickerCor.parte]) === v ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-muted')}>{lbl}</button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex items-start gap-2">
              <div className="shrink-0">
                <div className="mb-1 text-[11px] text-muted-foreground">Estilo</div>
                <div className="flex gap-1.5">
                  {([['b', <b key="b">B</b>], ['i', <i key="i">I</i>], ['u', <u key="u">U</u>]] as const).map(([k, ic]) => {
                    const cur = a.estiloParte?.[pickerCor.parte] ?? {}
                    return <button key={k} type="button" onClick={() => setAjuste({ estiloParte: { ...(a.estiloParte ?? {}), [pickerCor.parte]: { ...cur, [k]: !(cur as Record<string, boolean>)[k] } } })} className={cn('flex h-8 w-8 items-center justify-center rounded border text-[13px]', (cur as Record<string, boolean>)[k] ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>{ic}</button>
                  })}
                </div>
              </div>
              <div className="mt-5 w-px self-stretch bg-border/70" />
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground"><span>Tamanho</span>{px !== base && <button type="button" onClick={() => setPx(base)} className="text-[11px] hover:underline">Padrão</button>}</div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setPx(px - 1)} className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md border text-base font-semibold hover:bg-muted">−</button>
                  <select value={px} onChange={(e) => setPx(Number(e.target.value))} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-1 text-center text-sm outline-none focus:border-primary">
                    {!TAMS.includes(px) && <option value={px}>{px}</option>}
                    {TAMS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button type="button" onClick={() => setPx(px + 1)} className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md border text-base font-semibold hover:bg-muted">+</button>
                </div>
              </div>
            </div>
            <div className="mt-3">
              <div className="mb-1 text-[11px] text-muted-foreground">Fonte</div>
              <select value={a.fonteParte?.[pickerCor.parte] ?? ''} onChange={(e) => setAjuste({ fonteParte: { ...(a.fonteParte ?? {}), [pickerCor.parte]: e.target.value } })} className="w-full rounded border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary">
                <option value="">Padrão</option>
                {FONTES_CADERNO.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            {campos.length > 0 && (
              <div className="mt-4 space-y-2.5 border-t pt-4">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Texto</div>
                {campos.map((campo) => <CampoFormatavel key={campo.id} campo={campo} onChange={(v) => onCampo(campo, v)} />)}
              </div>
            )}
            {podeRemoverParte(pickerCor.parte) && (
              <button type="button" onClick={() => { try { apagarParte(pickerCor.parte); setPickerCor(null) } catch { toast.error('Não foi possível apagar este bloco.') } }} className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md border border-destructive/40 px-2 py-1.5 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5" /> Apagar este bloco
              </button>
            )}
          </InspectorAside>
        )
      })()}

      {/* Inspector — título da capa */}
      {pickerCapa && a.capaUrl && (
        <InspectorAside titulo="Título sobre a capa" onClose={() => setPickerCapa(false)}>
          <div><div className="mb-1 text-[11px] text-muted-foreground">Texto</div><textarea value={capaEfetiva.titulo} onChange={(e) => setCapa({ titulo: e.target.value })} rows={3} className="w-full resize-y rounded border bg-background px-2 py-1 text-xs leading-snug outline-none focus:border-primary" /></div>
          <div className="mt-3"><div className="mb-1 text-[11px] text-muted-foreground">Fonte</div><select value={capaEfetiva.fonte} onChange={(e) => setCapa({ fonte: e.target.value })} className="w-full rounded border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"><option value="">Padrão</option>{FONTES_CADERNO.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></div>
          <div className="mt-3"><div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Cor</div><HexColorField value={capaEfetiva.cor} onChange={(v) => setCapa({ cor: v })} /></div>
          <div className="mt-3"><div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground"><span>Tamanho</span><span className="font-semibold text-foreground">{capaEfetiva.tamanho}px</span></div><input type="range" min={16} max={96} value={capaEfetiva.tamanho} onChange={(e) => setCapa({ tamanho: Number(e.target.value) })} className="w-full accent-primary" /></div>
          <div className="mt-3"><div className="mb-1 text-[11px] text-muted-foreground">Estilo</div><div className="flex gap-1.5">{([['negrito', <b key="b">B</b>], ['italico', <i key="i">I</i>], ['sublinhado', <u key="u">U</u>]] as const).map(([k, ic]) => <button key={k} type="button" onClick={() => setCapa({ [k]: !capaEfetiva[k] } as Partial<CapaConfig>)} className={cn('flex h-7 w-8 items-center justify-center rounded border text-[13px]', capaEfetiva[k] ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>{ic}</button>)}</div></div>
          <div className="mt-3"><div className="mb-1 text-[11px] text-muted-foreground">Alinhamento</div><div className="flex overflow-hidden rounded-md border">{(['left', 'center', 'right'] as const).map((al) => <button key={al} type="button" onClick={() => setCapa({ alinhamento: al })} className={cn('flex-1 py-1 text-xs', capaEfetiva.alinhamento === al ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-muted')}>{al === 'left' ? 'Esq.' : al === 'center' ? 'Centro' : 'Dir.'}</button>)}</div></div>
          <div className="mt-3"><div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground"><span>Posição horizontal</span><span className="font-semibold text-foreground">{capaEfetiva.posH}%</span></div><input type="range" min={0} max={100} value={capaEfetiva.posH} onChange={(e) => setCapa({ posH: Number(e.target.value) })} className="w-full accent-primary" /></div>
          <div className="mt-3"><div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground"><span>Posição vertical</span><span className="font-semibold text-foreground">{capaEfetiva.posV}%</span></div><input type="range" min={0} max={100} value={capaEfetiva.posV} onChange={(e) => setCapa({ posV: Number(e.target.value) })} className="w-full accent-primary" /></div>
        </InspectorAside>
      )}

      {/* Inspector — bloco do modelo pronto */}
      {pickerBloco && blocoSel && (
        <InspectorAside titulo={NOME_BLOCO[blocoSel.type] ?? blocoSel.type} onClose={() => { setPickerBloco(null); setOrigemEstrutura(false) }} voltar={origemEstrutura ? () => { setPickerBloco(null); setOrigemEstrutura(false); setEstruturaAberta(true) } : undefined}>
          {camposDoBlocoDoc(blocoSel).map((campo) => <CampoBlocoEditor key={campo.id} campo={campo} onChange={(v) => setBlocoAttr(pickerBloco, { [campo.id]: v })} />)}
          {blocoSel.type === 'card' && (() => {
            const textos = (blocoSel.innerBlocks ?? []).filter((b) => b.type === 'texto-livre')
            const at = (b: { attributes?: Record<string, unknown> }, k: string, d: unknown = '') => (b?.attributes as Record<string, unknown>)?.[k] ?? d
            return (
              <div className="space-y-2.5 border-t pt-3">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Textos dentro do card</div>
                {textos.map((b, i) => (
                  <div key={b.id} className="space-y-1 rounded-md border border-dashed p-1.5">
                    <div className="flex items-start gap-1.5">
                      <textarea value={String(at(b, 'texto'))} onChange={(e) => setBlocoAttr(b.id, { texto: e.target.value })} rows={2} placeholder={`Texto ${i + 1}`} className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-xs outline-none focus:border-primary" />
                      <button type="button" onClick={() => removerBlocoInterno(b.id)} title="Remover texto" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {([['bold', <b key="b">B</b>], ['italico', <i key="i">I</i>], ['sublinhado', <u key="u">U</u>]] as const).map(([k, ic]) => (
                        <button key={k} type="button" onClick={() => setBlocoAttr(b.id, { [k]: !at(b, k) })} className={cn('flex h-6 w-6 items-center justify-center rounded border text-[12px]', at(b, k) ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>{ic}</button>
                      ))}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => adicionarTextoNoCard(pickerBloco)} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/40 px-2 py-1.5 text-[12px] font-medium text-primary hover:bg-primary/10"><Plus className="h-3.5 w-3.5" /> Adicionar texto dentro</button>
              </div>
            )
          })()}
          {camposDoBlocoDoc(blocoSel).length === 0 && blocoSel.type !== 'card' && <p className="text-[11px] text-muted-foreground">Este bloco não tem propriedades editáveis por aqui.</p>}
          <button type="button" onClick={() => removerBlocoDoc(pickerBloco)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-destructive/40 px-2 py-1.5 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /> Apagar este bloco</button>
        </InspectorAside>
      )}

      {/* Estrutura */}
      {estruturaAberta && (
        <>
          <div className="pointer-events-none fixed inset-0 z-40 bg-black/5" />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-96 max-w-[90vw] flex-col border-l bg-background shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <div className="min-w-0"><div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Estrutura</div><div className="truncate text-sm font-semibold">{preset ? 'Blocos do caderno' : 'Blocos do diagnóstico'}</div></div>
              <button onClick={() => setEstruturaAberta(false)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="scroll-claro min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {preset && docEfetivo ? (
                <DocEstruturaPanel doc={docEfetivo} onAdd={adicionarBlocoDocAtivo} onMover={moverBlocoDocAtivo} onRemover={removerBlocoDoc} onEditar={(bid) => { setEstruturaAberta(false); setOrigemEstrutura(true); setPickerBloco(bid) }} />
              ) : (<>
                <p className="mb-2 px-1 text-[11px] leading-snug text-muted-foreground">Arraste pelo <GripVertical className="inline h-3 w-3" /> ou use as setas para reordenar. Clique no lápis para editar.</p>
                <div className="space-y-1">
                  {outline.map((e, i) => {
                    const Icon = ICONE_TIPO[e.tipo as TipoBloco] ?? Type
                    const pilares = e.key === 'pilares' ? (item.conteudo?.pilares ?? []) : []
                    return (
                      <Fragment key={e.key}>
                        <div draggable onDragStart={() => setDragIdx(i)} onDragOver={(ev) => ev.preventDefault()} onDrop={() => { if (dragIdx != null) soltarEntrada(dragIdx, i); setDragIdx(null) }} onDragEnd={() => setDragIdx(null)}
                          className={cn('group flex items-center gap-1.5 rounded-md border bg-background px-1.5 py-1.5', dragIdx === i && 'opacity-50')}>
                          <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60" />
                          <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1 truncate text-[12px]" title={e.label}>{e.label}</span>
                          <div className="flex shrink-0 items-center">
                            <button type="button" onClick={() => moverEntrada(i, -1)} disabled={i === 0} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                            <button type="button" onClick={() => moverEntrada(i, 1)} disabled={i === outline.length - 1} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                            {e.parte && <button type="button" onClick={() => editarEntrada(e)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>}
                            {e.removivel && <button type="button" onClick={() => apagarEntrada(e)} className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
                          </div>
                        </div>
                        {pilares.map((pl, pi) => (
                          <div key={pi} className="ml-6 flex items-center gap-1.5 rounded-md border border-dashed bg-muted/20 px-1.5 py-1.5">
                            <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                            <span className="min-w-0 flex-1 truncate text-[12px]" title={pl.nome}>{pl.nome || `Pilar ${pi + 1}`}</span>
                            <div className="flex shrink-0 items-center">
                              <button type="button" onClick={() => moverPilar(pi, -1)} disabled={pi === 0} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => moverPilar(pi, 1)} disabled={pi === pilares.length - 1} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => abrirEdicaoDeParte(`pilar:${pi}`, pl.nome || `Pilar ${pi + 1}`)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => apagarPilar(pi)} className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </div>
                        ))}
                      </Fragment>
                    )
                  })}
                  {outline.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Sem blocos para exibir.</p>}
                </div>
                <div className="mt-4 border-t pt-3">
                  <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Plus className="mr-1 inline h-3.5 w-3.5" /> Adicionar bloco</p>
                  {(['individual', 'composto'] as const).map((g) => (
                    <div key={g} className="mt-3 first:mt-0">
                      <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">{g === 'individual' ? 'Blocos individuais' : 'Seção + conteúdo'}</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {BLOCOS_ADD.filter((b) => (b.grupo ?? 'individual') === g).map((b) => b.contavel ? (
                          <div key={b.tipo} className="row-span-2 flex flex-col justify-center rounded-md border bg-background px-2 py-1.5">
                            <div className="mb-1 flex items-center gap-1.5 text-[12px] font-medium"><b.icon className="h-3.5 w-3.5 shrink-0 text-primary" /> <span className="min-w-0 truncate">{b.label}</span></div>
                            <div className="flex gap-0.5">{[1, 2, 3, 4].map((n) => <button key={n} type="button" onClick={() => adicionarBloco(b.tipo, n)} className="flex-1 rounded border py-0.5 text-[11px] transition-colors hover:border-primary/50 hover:bg-primary/5">{n}</button>)}</div>
                          </div>
                        ) : (
                          <button key={b.tipo} type="button" onClick={() => adicionarBloco(b.tipo)} className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-left text-[12px] font-medium transition-colors hover:border-primary/50 hover:bg-primary/5"><b.icon className="h-3.5 w-3.5 shrink-0 text-primary" /> <span className="min-w-0 truncate">{b.label}</span></button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>)}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}

/** Painel lateral direito (inspector) reutilizado pelos três editores (parte/capa/bloco). */
function InspectorAside({ titulo, onClose, voltar, children }: { titulo: string; onClose: () => void; voltar?: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-40 bg-black/5" />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-80 max-w-[85vw] flex-col border-l bg-background shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-1">
            {voltar && <button onClick={voltar} title="Voltar para a estrutura" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronLeft className="h-4 w-4" /></button>}
            <div className="min-w-0"><div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Editar</div><div className="truncate text-sm font-semibold" title={titulo}>{titulo}</div></div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="scroll-claro min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </aside>
    </>
  )
}
