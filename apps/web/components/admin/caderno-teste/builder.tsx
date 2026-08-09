'use client'

import { Fragment, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ChevronLeft, Save, Loader2, Database, FileText, ClipboardList, BarChart3, LayoutTemplate, Pencil, Plus, X, Layers, FileUp, ChevronDown, Check, Undo2, Redo2, Trash2, Menu, ArrowUp, ArrowDown, GripVertical, Type, Heading, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { HexColorField } from '@/components/admin/hex-color-field'
import { Previa, outlineDoItem, type DiagEntrada, type TipoBloco } from '@/lib/caderno-teste/previa'
import { PreviaBlocos, capaPadraoDoPreset, docDoPreset } from '@/lib/caderno-teste/previa-blocos'
import { ModeloPicker } from '@/components/admin/caderno-teste/modelo-picker'
import { BancoPicker, type BancoOpcao } from '@/components/admin/caderno-teste/banco-picker'
import { metaDaModalidade, itemAtivo, novoItem, presetDoItem, CAPA_PADRAO, CORES_PILAR_PADRAO, type BuilderV3, type BuilderAjustes, type CapaConfig, type Modalidade, type PreviewQuestao } from '@/lib/caderno-teste/tipos'
import { camposDoBloco, aplicarCampoBloco, podeRemoverParte, removerParteDiag, type CampoTexto } from '@/lib/caderno-teste/edicao'
import { acharBloco, atualizarBlocoAttrs, removerBloco, camposDoBlocoDoc, NOME_BLOCO, type CampoBlocoDoc } from '@/lib/caderno-teste/edicao-doc'
import type { CadernoDoc } from '@/lib/caderno-designer/types'
import { totalTxtDe, DIAG_PADRAO, type DiagConteudo } from '@/lib/caderno-teste/diagnostico'
import { salvarBuilderTeste, previewQuestoesBanco, dadosBancoTeste, questoesMetaBanco, type RegistroTeste, type DiscBancoTeste, type QuestaoMeta } from '@/app/admin/cadernos-teste/actions'
import { hospedarImagemCadernoAction } from '@/app/admin/cadernos/actions'
import { FONTES_CADERNO } from '@/lib/caderno-designer/theme'
import { Users, ChevronRight, Download } from 'lucide-react'

const ICONE_MOD: Record<Modalidade, any> = { caderno_questoes: FileText, folha_respostas: ClipboardList, diagnostico: BarChart3 }
const SEM_VARS: Record<string, string> = {} // referência estável (evita re-render em loop no PreviaBlocos)

/** Zoom da prévia para caber na largura do painel direito. */
function useZoomAjustado(alvoLargura = 794) {
  const ref = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(0.7)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const calc = () => setZoom(Math.min(0.8, Math.max(0.3, ((el.clientWidth - 32) / alvoLargura) * 0.8)))
    calc()
    const ro = new ResizeObserver(calc); ro.observe(el)
    return () => ro.disconnect()
  }, [alvoLargura])
  return { ref, zoom }
}

export function CadernoTesteBuilder({ cadernoId, builderInicial, bancos, questoesIniciais, registrosIniciais = [], disciplinasIniciais = [], abrirPickerInicial = false }: {
  cadernoId: string
  builderInicial: BuilderV3
  bancos: BancoOpcao[]
  questoesIniciais: PreviewQuestao[]
  registrosIniciais?: RegistroTeste[]
  disciplinasIniciais?: DiscBancoTeste[]
  abrirPickerInicial?: boolean
}) {
  // Histórico p/ desfazer/refazer (igual ao v1): `builder` = entrada atual da pilha.
  const histRef = useRef<BuilderV3[]>([builderInicial])
  const idxRef = useRef(0)
  const lastTsRef = useRef(0)
  const [, forceRender] = useState(0)
  const bump = () => forceRender((x) => x + 1)
  const builder = histRef.current[idxRef.current]
  const setBuilder = (updater: BuilderV3 | ((b: BuilderV3) => BuilderV3)) => {
    const prev = histRef.current[idxRef.current]
    const next = typeof updater === 'function' ? (updater as (b: BuilderV3) => BuilderV3)(prev) : updater
    if (next === prev) return
    const now = performance.now()
    const coalesce = now - lastTsRef.current < 500 && idxRef.current > 0 // agrupa edições rápidas (sliders)
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
  const [questoes, setQuestoes] = useState<PreviewQuestao[]>(questoesIniciais)
  const [registros, setRegistros] = useState<RegistroTeste[]>(registrosIniciais)
  const [disciplinasBanco, setDisciplinasBanco] = useState<DiscBancoTeste[]>(disciplinasIniciais)
  const [questoesMeta, setQuestoesMeta] = useState<QuestaoMeta[]>([])
  const [alunoIdx, setAlunoIdx] = useState(0)
  const [carregandoQ, setCarregandoQ] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(abrirPickerInicial)
  const [pickerMode, setPickerMode] = useState<'add' | 'trocar'>('trocar')
  const [bancoPickerOpen, setBancoPickerOpen] = useState(false)
  const [editandoGrupos, setEditandoGrupos] = useState(false)
  const [gruposAberto, setGruposAberto] = useState(false)
  const [importando, setImportando] = useState(false)
  const [baixarAberto, setBaixarAberto] = useState(false)
  const [pickerCor, setPickerCor] = useState<{ parte: string; label: string; cor: string } | null>(null)
  const [pickerCapa, setPickerCapa] = useState(false)
  const [pickerBloco, setPickerBloco] = useState<string | null>(null)
  const [estruturaAberta, setEstruturaAberta] = useState(false) // painel de estrutura (outline) do diagnóstico
  const [origemEstrutura, setOrigemEstrutura] = useState(false) // edição aberta a partir do painel (mostra "voltar")
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const { ref, zoom } = useZoomAjustado()

  // Atalhos: Ctrl/Cmd+Z = desfazer, Ctrl/Cmd+Shift+Z ou Ctrl+Y = refazer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // sem deps: undo/redo leem refs atuais

  // Metadados (número/disciplina/assunto) das questões do banco — p/ listar no editor do card de disciplina.
  useEffect(() => {
    let vivo = true
    const id = builder.bancoId
    if (!id) { setQuestoesMeta([]); return }
    questoesMetaBanco(id).then((r) => { if (vivo && r.ok) setQuestoesMeta(r.questoes) }).catch(() => {})
    return () => { vivo = false }
  }, [builder.bancoId])

  const ativo = itemAtivo(builder)
  const presetAtivo = presetDoItem(ativo) // modelo pronto (render por blocos do v1)
  const meta = metaDaModalidade(ativo.modalidade)
  const modeloNome = meta.modelos.find((m) => m.id === ativo.modelo)?.nome ?? meta.modelos[0].nome
  const IconeMod = ICONE_MOD[ativo.modalidade]
  const a = ativo.ajustes
  const bancoAtual = bancos.find((b) => b.id === builder.bancoId) ?? null
  const setAjuste = (patch: Partial<BuilderAjustes>) => setBuilder((b) => ({ ...b, itens: b.itens.map((it) => it.id === b.ativo ? { ...it, ajustes: { ...it.ajustes, ...patch } } : it) }))
  const setConteudo = (conteudo: DiagConteudo) => setBuilder((b) => ({ ...b, itens: b.itens.map((it) => it.id === b.ativo ? { ...it, conteudo } : it) }))
  // Título da capa (modelos prontos): config efetiva (item.capa OU default do preset) + patch.
  const capaEfetiva: CapaConfig = ativo.capa ?? (presetAtivo ? capaPadraoDoPreset(presetAtivo) : CAPA_PADRAO)
  const setCapa = (patch: Partial<CapaConfig>) => setBuilder((b) => ({ ...b, itens: b.itens.map((it) => {
    if (it.id !== b.ativo) return it
    const preset = presetDoItem(it)
    const base = it.capa ?? (preset ? capaPadraoDoPreset(preset) : CAPA_PADRAO)
    return { ...it, capa: { ...base, ...patch } }
  }) }))
  // Edição por bloco (modelos prontos): doc efetivo = docEdit do item OU o preset original.
  const docEfetivo: CadernoDoc | null = presetAtivo ? (ativo.docEdit ?? docDoPreset(presetAtivo)) : null
  const blocoSel = pickerBloco && docEfetivo ? acharBloco(docEfetivo, pickerBloco) : null
  const setBlocoAttr = (id: string, patch: Record<string, unknown>) => setBuilder((b) => ({ ...b, itens: b.itens.map((it) => {
    if (it.id !== b.ativo) return it
    const preset = presetDoItem(it)
    const base = it.docEdit ?? (preset ? docDoPreset(preset) : null)
    if (!base) return it
    return { ...it, docEdit: atualizarBlocoAttrs(base, id, patch) }
  }) }))
  const removerBlocoDoc = (id: string) => {
    setBuilder((b) => ({ ...b, itens: b.itens.map((it) => {
      if (it.id !== b.ativo) return it
      const preset = presetDoItem(it)
      const base = it.docEdit ?? (preset ? docDoPreset(preset) : null)
      if (!base) return it
      return { ...it, docEdit: removerBloco(base, id) }
    }) }))
    setPickerBloco(null)
  }

  function adicionarGrupo() { setPickerMode('add'); setPickerOpen(true) }
  function trocarModelo() { setPickerMode('trocar'); setPickerOpen(true) }
  function selecionarGrupo(id: string) { setBuilder((b) => ({ ...b, ativo: id })) }
  function removerGrupo(id: string) {
    setBuilder((b) => {
      if (b.itens.length <= 1) return b
      const itens = b.itens.filter((it) => it.id !== id)
      return { ...b, itens, ativo: b.ativo === id ? itens[0].id : b.ativo }
    })
  }
  function onPicker(m: Modalidade, modeloId: string) {
    setBuilder((b) => {
      if (pickerMode === 'add') {
        const src = itemAtivo(b).ajustes
        const it = novoItem(m, modeloId)
        it.ajustes = { ...it.ajustes, titulo: src.titulo, corPrimaria: src.corPrimaria, corSecundaria: src.corSecundaria }
        return { ...b, itens: [...b.itens, it], ativo: it.id }
      }
      return { ...b, itens: b.itens.map((it) => {
        if (it.id !== b.ativo) return it
        const novo = novoItem(m, modeloId)
        return { ...novo, id: it.id, ajustes: { ...novo.ajustes, titulo: it.ajustes.titulo, corPrimaria: it.ajustes.corPrimaria, corSecundaria: it.ajustes.corSecundaria } }
      }) }
    })
    setPickerOpen(false)
  }
  function trocarBanco(bancoId: string | null) {
    setBuilder((b) => ({ ...b, bancoId }))
    setAlunoIdx(0)
    if (!bancoId) { setQuestoes([]); setRegistros([]); setDisciplinasBanco([]); return }
    setCarregandoQ(true)
    previewQuestoesBanco(bancoId).then((r) => { if (r.ok) setQuestoes(r.questoes ?? []) }).finally(() => setCarregandoQ(false))
    dadosBancoTeste(bancoId).then((r) => { if (r.ok) { setRegistros(r.registros); setDisciplinasBanco(r.disciplinas) } })
  }
  const alunoAtual = registros[Math.min(alunoIdx, Math.max(0, registros.length - 1))] ?? null
  const varsPrevia = alunoAtual?.vars ?? SEM_VARS
  // Fontes de dados disponíveis do simulado: pilares canônicos + pilares presentes nos dados + disciplinas do banco.
  const fontesDisponiveis = (() => {
    const map = new Map<string, { chave: string; nome: string; tipo: 'pilar' | 'disciplina' }>()
    const human = (s: string) => s.replace(/_/g, ' ').replace(/(^|\s)\S/g, (m) => m.toUpperCase())
    for (const k of Object.keys(CORES_PILAR_PADRAO)) map.set('p:' + k, { chave: k, nome: human(k), tipo: 'pilar' })
    for (const k of Object.keys(varsPrevia)) { const m = k.match(/^pct_pilar_(.+)$/); if (m) map.set('p:' + m[1], { chave: m[1], nome: human(m[1]), tipo: 'pilar' }) }
    for (const d of disciplinasBanco) map.set('d:' + d.chave, { chave: d.chave, nome: d.nome, tipo: 'disciplina' })
    return [...map.values()]
  })()
  // Painel de estrutura (outline) do diagnóstico: lista → ordena (setas/arrastar) → edita/remove cada bloco.
  const outline = ativo.modalidade === 'diagnostico' && builder.bancoId ? outlineDoItem(ativo, questoes, varsPrevia, disciplinasBanco) : []
  const conteudoBase = () => ativo.conteudo ?? DIAG_PADRAO
  const reordenar = (keys: string[]) => setConteudo({ ...conteudoBase(), ordem: keys })
  function moverEntrada(idx: number, dir: -1 | 1) { const keys = outline.map((e) => e.key); const j = idx + dir; if (j < 0 || j >= keys.length) return; [keys[idx], keys[j]] = [keys[j], keys[idx]]; reordenar(keys) }
  function soltarEntrada(from: number, to: number) { if (from === to) return; const keys = outline.map((e) => e.key); const [k] = keys.splice(from, 1); keys.splice(to, 0, k); reordenar(keys) }
  function apagarEntrada(e: DiagEntrada) { if (e.apagar === 'diag_cab') setAjuste({ mostrarCabecalho: false }); else setConteudo(removerParteDiag(ativo.conteudo, e.apagar)) }
  function editarEntrada(e: DiagEntrada) { if (!e.parte) return; abrirEdicaoDeParte(e.parte, e.label) }
  function abrirEdicaoDeParte(parte: string, label: string) { setOrigemEstrutura(true); setEstruturaAberta(false); setPickerBloco(null); setPickerCapa(false); setPickerCor({ parte, label, cor: a.coresParte?.[parte] ?? a.corPrimaria }) }
  // Pilares: cada card é listado individualmente no painel (editar/apagar/reordenar dentro do array).
  function moverPilar(i: number, dir: -1 | 1) { const pilares = [...conteudoBase().pilares]; const j = i + dir; if (j < 0 || j >= pilares.length) return; [pilares[i], pilares[j]] = [pilares[j], pilares[i]]; setConteudo({ ...conteudoBase(), pilares }) }
  function apagarPilar(i: number) { setConteudo({ ...conteudoBase(), pilares: conteudoBase().pilares.filter((_, j) => j !== i) }) }
  const fecharPickerCor = () => { setPickerCor(null); setOrigemEstrutura(false) }
  const ICONE_TIPO: Record<TipoBloco, any> = { cabecalho: LayoutTemplate, nome: FileText, nota: BarChart3, texto: Type, secao: Heading, card: LayoutGrid, desempenho: BarChart3 }
  const exportUrl = (fmt: 'word' | 'html') => `/api/admin/caderno-teste/exportar?caderno=${cadernoId}&grupo=${ativo.id}&formato=${fmt}${alunoAtual ? `&aluno=${alunoAtual.id}` : ''}`
  // Saída FIEL: abre a prévia A4 (mesma render) p/ imprimir / salvar como PDF pelo navegador.
  const pdfUrl = `/imprimir/caderno-teste/${cadernoId}?grupo=${ativo.id}${alunoAtual ? `&aluno=${alunoAtual.id}` : ''}`
  function salvar() {
    start(async () => {
      const r = await salvarBuilderTeste(cadernoId, builder)
      if (r.ok) toast.success('Caderno de teste salvo'); else toast.error(r.error ?? 'Erro ao salvar')
    })
  }
  /** Importa um caderno (Word/HTML) → cria um novo grupo de Diagnóstico já mapeado. */
  async function importar(file: File) {
    setImportando(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const resp = await fetch('/api/admin/caderno-teste/importar', { method: 'POST', body: fd })
      const r = await resp.json().catch(() => ({ ok: false, error: 'Resposta inválida do servidor.' }))
      if (!resp.ok || !r.ok || !r.conteudo) { toast.error(r.error ?? 'Falha ao importar.'); return }
      const it = novoItem('diagnostico', 'padrao')
      it.conteudo = r.conteudo
      it.ajustes = { ...it.ajustes, corPrimaria: '#2d254f', corSecundaria: '#f6b420', titulo: 'Diagnóstico de Desempenho' }
      setBuilder((b) => ({ ...b, itens: [...b.itens, it], ativo: it.id }))
      if (Array.isArray(r.avisos) && r.avisos.length) toast.warning(`Importado com ${r.avisos.length} aviso(s) — revise a prévia.`)
      toast.success('Caderno importado como novo grupo de Diagnóstico. Revise e salve.')
    } catch (e) { toast.error('Erro ao enviar o arquivo.'); console.error(e) }
    finally { setImportando(false) }
  }

  const Tog = ({ campo, label }: { campo: keyof BuilderAjustes; label: string }) => (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <input type="checkbox" checked={!!a[campo]} onChange={(e) => setAjuste({ [campo]: e.target.checked } as any)} />
    </label>
  )
  const Segment = ({ label, valor, opcoes, onChange }: { label: string; valor: number; opcoes: number[]; onChange: (n: number) => void }) => (
    <div className="rounded-md border bg-background px-2 py-1.5">
      <div className="mb-1 text-[11px] text-muted-foreground">{label}</div>
      <div className="flex overflow-hidden rounded-md border">
        {opcoes.map((o) => <button key={o} type="button" onClick={() => onChange(o)} className={cn('flex-1 py-1 text-xs', valor === o ? 'bg-primary text-primary-foreground font-semibold' : 'hover:bg-muted')}>{o}</button>)}
      </div>
    </div>
  )

  return (
    <div className="-m-6 flex h-screen flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between gap-3 border-b bg-card/60 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Link href="/admin/cadernos-teste" className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronLeft className="h-5 w-5" /></Link>
          <div>
            <h1 className="text-lg font-bold leading-tight">Construtor de caderno (teste)</h1>
            <p className="text-xs text-muted-foreground">Vários grupos (modalidades) num caderno. Escolha o modelo e o banco nos pop-ups e ajuste à esquerda.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {registros.length > 0 && (
            <div className="flex items-center gap-1 rounded-lg border bg-muted/40 px-1.5 py-1 text-xs" title="Pré-visualizar com os dados reais de um aluno">
              <Users className="ml-0.5 h-3.5 w-3.5 text-primary" />
              <button onClick={() => setAlunoIdx((i) => Math.max(0, i - 1))} disabled={alunoIdx === 0} className="rounded p-0.5 hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              <span className="min-w-[110px] truncate text-center font-medium" title={alunoAtual?.nome}>{alunoAtual?.nome ?? '—'}</span>
              <span className="text-muted-foreground">{Math.min(alunoIdx + 1, registros.length)}/{registros.length}</span>
              <button onClick={() => setAlunoIdx((i) => Math.min(registros.length - 1, i + 1))} disabled={alunoIdx >= registros.length - 1} className="rounded p-0.5 hover:bg-muted disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
          <div className="flex items-center overflow-hidden rounded-lg border">
            <button type="button" onClick={undo} disabled={!podeUndo} title="Desfazer (Ctrl+Z)" className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
            <button type="button" onClick={redo} disabled={!podeRedo} title="Refazer (Ctrl+Shift+Z)" className="flex h-8 w-8 items-center justify-center border-l text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
          </div>
          <input ref={importRef} type="file" accept=".docx,.html,.htm,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = '' }} />
          <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} disabled={importando} title="Importar um caderno (Word .docx, HTML ou PDF) — mapeia como Diagnóstico">
            {importando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileUp className="mr-1.5 h-4 w-4" />} Importar
          </Button>
          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setBaixarAberto((o) => !o)} title="Baixar este grupo em Word ou HTML">
              <Download className="mr-1.5 h-4 w-4" /> Baixar <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </Button>
            {baixarAberto && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setBaixarAberto(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-lg border bg-background shadow-lg">
                  <a href={pdfUrl} target="_blank" rel="noreferrer" onClick={() => setBaixarAberto(false)} className="block px-3 py-2 text-sm hover:bg-muted">PDF (imprimir) — <span className="text-muted-foreground">fiel à prévia</span></a>
                  <a href={exportUrl('html')} download onClick={() => setBaixarAberto(false)} className="block border-t px-3 py-2 text-sm hover:bg-muted">HTML (.html)</a>
                  <a href={exportUrl('word')} download onClick={() => setBaixarAberto(false)} className="block border-t px-3 py-2 text-sm hover:bg-muted">Word (.doc) — <span className="text-muted-foreground">simplificado</span></a>
                </div>
              </>
            )}
          </div>
          <Button onClick={salvar} disabled={pending} size="sm">{pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Salvar</Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[380px_1fr]">
        {/* Esquerda: 2 colunas */}
        <div className="scroll-claro grid min-h-0 grid-cols-2 content-start gap-x-2.5 gap-y-4 overflow-y-auto border-r bg-muted/20 p-3">
          {/* Grupos: barra de seleção (dropdown) — abre embaixo com as descrições + Editar */}
          <div className="col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Layers className="h-3.5 w-3.5" /> Grupos deste caderno</p>
              <button type="button" onClick={() => setEditandoGrupos((e) => !e)} className={cn('flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium', editandoGrupos ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
                <Pencil className="h-3 w-3" /> {editandoGrupos ? 'Concluir' : 'Editar'}
              </button>
            </div>
            <div className="relative">
              {/* Barra: grupo atual + seta */}
              <button type="button" onClick={() => setGruposAberto((o) => !o)} className={cn('flex w-full items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-left shadow-sm transition-colors hover:border-primary/50', gruposAberto && 'border-primary')}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"><IconeMod className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold leading-tight">{ativo.ajustes.titulo || meta.nome}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{meta.nome} · {modeloNome}</span>
                </span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', gruposAberto && 'rotate-180')} />
              </button>
              {/* Menu flutuante (estilo select): divisórias + nome + descrição + check */}
              {gruposAberto && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setGruposAberto(false)} />
                  <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-lg border bg-background shadow-lg">
                    <div className="divide-y">
                      {builder.itens.map((it) => {
                        const m = metaDaModalidade(it.modalidade)
                        const Icon = ICONE_MOD[it.modalidade]
                        const on = it.id === builder.ativo
                        return (
                          <div key={it.id} className={cn('group flex items-center gap-2 px-3 py-2 transition-colors', on ? 'bg-primary/5' : 'hover:bg-muted/60')}>
                            <button type="button" onClick={() => { selecionarGrupo(it.id); setGruposAberto(false) }} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', on ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary')}><Icon className="h-4 w-4" /></span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium leading-tight">{it.ajustes.titulo || m.nome}</span>
                                <span className="block truncate text-[11px] text-muted-foreground">{m.nome} · {m.modelos.find((x) => x.id === it.modelo)?.nome}</span>
                              </span>
                            </button>
                            {editandoGrupos && builder.itens.length > 1
                              ? <button type="button" onClick={() => removerGrupo(it.id)} title="Remover grupo" className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                              : on && <Check className="h-4 w-4 shrink-0 text-primary" />}
                          </div>
                        )
                      })}
                      <button type="button" onClick={() => { adicionarGrupo(); setGruposAberto(false) }} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5">
                        <Plus className="h-4 w-4" /> Adicionar grupo
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Modelo do grupo */}
          <div className="col-span-1">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Modelo</p>
            <div className="rounded-xl border bg-background p-2.5 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><IconeMod className="h-4 w-4" /></span>
                <div className="min-w-0"><p className="truncate text-[13px] font-semibold leading-tight">{meta.nome}</p><p className="truncate text-[10px] text-muted-foreground">{modeloNome}</p></div>
              </div>
              <Button variant="outline" size="sm" className="mt-2 h-7 w-full text-xs" onClick={trocarModelo}><LayoutTemplate className="mr-1 h-3.5 w-3.5" /> Trocar</Button>
            </div>
          </div>

          {/* Banco (pop-up com capa) */}
          <div className="col-span-1">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Banco</p>
            <div className="rounded-xl border bg-background p-2.5 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
                  {bancoAtual?.capa ? <img src={bancoAtual.capa} alt="" className="h-full w-full object-cover" /> : <Database className="h-4 w-4" />}
                </span>
                <div className="min-w-0"><p className="truncate text-[13px] font-semibold leading-tight">{bancoAtual?.nome ?? 'Nenhum'}</p><p className="truncate text-[10px] text-muted-foreground">{carregandoQ ? 'carregando…' : builder.bancoId ? `${questoes.length} questões` : 'exemplo'}</p></div>
              </div>
              <Button variant="outline" size="sm" className="mt-2 h-7 w-full text-xs" onClick={() => setBancoPickerOpen(true)}><Database className="mr-1 h-3.5 w-3.5" /> Escolher</Button>
            </div>
          </div>

          {/* Ajustes (2 colunas) — só com banco selecionado */}
          {builder.bancoId && (<>
          <div className="col-span-2 mt-1"><p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Pencil className="h-3.5 w-3.5" /> Ajustes do grupo</p></div>
          {presetAtivo && (
            <div className="col-span-2 rounded-md border border-dashed px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
              📄 Modelo pronto (layout do v1), idêntico ao Caderno de Prova. A <strong>Capa</strong> e o fundo de cada página (<strong>Folha</strong>) aparecem ao enviar as imagens abaixo. Ajustes de cor/toggles ainda não se aplicam a este modelo.
            </div>
          )}
          <label className="col-span-2 block text-xs text-muted-foreground">
            <span className="mb-1 block">Título</span>
            <input value={a.titulo} onChange={(e) => setAjuste({ titulo: e.target.value })} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm text-foreground" />
          </label>
          <div className="col-span-1 rounded-md border bg-background px-2 py-1.5"><div className="mb-1 text-[11px] text-muted-foreground">Cor primária</div><HexColorField value={a.corPrimaria} onChange={(v) => setAjuste({ corPrimaria: v })} /></div>
          <div className="col-span-1 rounded-md border bg-background px-2 py-1.5"><div className="mb-1 text-[11px] text-muted-foreground">Cor secundária</div><HexColorField value={a.corSecundaria} onChange={(v) => setAjuste({ corSecundaria: v })} /></div>
          {ativo.modalidade === 'caderno_questoes' && <>
            <div className="col-span-1"><Tog campo="mostrarGabarito" label="Gabarito" /></div>
            <div className="col-span-1"><Tog campo="mostrarComentarios" label="Comentários" /></div>
          </>}
          {(ativo.modalidade === 'caderno_questoes' || ativo.modalidade === 'folha_respostas') && (
            <div className="col-span-1"><Segment label="Nº alternativas" valor={a.numAlternativas} opcoes={[4, 5]} onChange={(n) => setAjuste({ numAlternativas: n })} /></div>
          )}
          {ativo.modalidade === 'folha_respostas' && (
            <div className="col-span-1"><Segment label="Colunas" valor={a.colunas} opcoes={[2, 3, 4, 5]} onChange={(n) => setAjuste({ colunas: n })} /></div>
          )}
          {/* Imagens do caderno (opcionais) — agrupadas 2×2 */}
          <div className="col-span-2 mt-1"><p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><FileUp className="h-3.5 w-3.5" /> Imagens (opcionais)</p></div>
          <div className="col-span-1"><CampoImagem label="Capa (página inteira)" valor={a.capaUrl} onChange={(url) => setAjuste({ capaUrl: url })} /></div>
          <div className="col-span-1"><CampoImagem label="Folha (fundo da página)" valor={a.folhaUrl} onChange={(url) => setAjuste({ folhaUrl: url })} /></div>
          <div className="col-span-1"><CampoImagem label="Cabeçalho (faixa no topo)" valor={a.cabecalhoUrl} onChange={(url) => setAjuste({ cabecalhoUrl: url })} /></div>
          <div className="col-span-1"><CampoImagem label="Rodapé (faixa na base)" valor={a.rodapeUrl} onChange={(url) => setAjuste({ rodapeUrl: url })} /></div>
          {ativo.modalidade === 'diagnostico' && (
            <div className="col-span-2 rounded-md border border-dashed px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
              💡 Cor das disciplinas por pilar: <strong>clique no card de uma disciplina na prévia</strong> (à direita) e escolha a cor ao lado.
            </div>
          )}
          </>)}
        </div>

        {/* Direita: prévia A4 do grupo ativo (padding lateral menor) */}
        <div ref={ref} className="scroll-claro relative min-h-0 overflow-auto bg-[radial-gradient(circle,theme(colors.slate.300)_1px,transparent_1px)] [background-size:18px_18px] px-3 py-5 dark:bg-[radial-gradient(circle,theme(colors.slate.700)_1px,transparent_1px)]">
          {ativo.modalidade === 'diagnostico' && builder.bancoId && (
            <div className="pointer-events-none sticky top-0 z-20 -mt-2 mb-1 flex justify-end pr-1">
              <button type="button" onClick={() => setEstruturaAberta(true)} title="Estrutura do diagnóstico (ordenar/editar/adicionar blocos)"
                className="pointer-events-auto flex items-center gap-1.5 rounded-lg border bg-background/95 px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition-colors hover:border-primary/50">
                <Menu className="h-4 w-4" /> Estrutura
              </button>
            </div>
          )}
          {builder.bancoId ? (
            <div className="mx-auto" style={{ zoom } as any}>
              {presetAtivo ? (
                <PreviaBlocos presetId={presetAtivo} questoes={questoes} vars={varsPrevia} titulo={a.titulo} capaUrl={a.capaUrl} folhaUrl={a.folhaUrl}
                  capa={ativo.capa} onPickCapa={() => { setPickerCapa(true); setPickerCor(null); setPickerBloco(null) }} selCapa={pickerCapa}
                  docOverride={ativo.docEdit} onPickBloco={(id) => { setPickerBloco(id); setPickerCapa(false); setPickerCor(null) }} selBlocoId={pickerBloco} />
              ) : (
                <Previa item={ativo} questoes={questoes} vars={varsPrevia} discBanco={disciplinasBanco} selParte={pickerCor?.parte}
                  onPick={(parte, label, cor) => { setPickerCapa(false); setPickerBloco(null); setPickerCor({ parte, label, cor }) }}
                  onPickCapa={() => { setPickerCapa(true); setPickerCor(null); setPickerBloco(null) }} selCapa={pickerCapa} />
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center">
              <div className="max-w-xs">
                <LayoutTemplate className="mx-auto mb-3 h-9 w-9 text-muted-foreground/40" />
                <p className="text-sm font-medium">Prévia do caderno</p>
                <p className="mt-1 text-xs text-muted-foreground">Escolha um <strong>modelo</strong> e selecione um <strong>banco</strong> à esquerda para ver a prévia com os dados reais.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <ModeloPicker open={pickerOpen} onClose={() => setPickerOpen(false)} atual={{ modalidade: ativo.modalidade, modelo: ativo.modelo }} onSelecionar={onPicker} />
      <BancoPicker open={bancoPickerOpen} onClose={() => setBancoPickerOpen(false)} bancos={bancos} atual={builder.bancoId} onSelecionar={trocarBanco} />
      {pickerCor && (() => {
        const campos = camposDoBloco(ativo, pickerCor.parte, pickerCor.label)
        const onCampo = (campo: (typeof campos)[number], v: string) => campo.alvo === 'titulo' ? setAjuste({ titulo: v }) : setConteudo(aplicarCampoBloco(ativo.conteudo, pickerCor.parte, campo.id, v))
        const temCorTexto = ['diag_nota_num', 'diag_nota_faixa', 'diag_cab', 'diag_cab_titulo', 'diag_cab_sub', 'diag_nome_rot', 'diag_nome_val'].includes(pickerCor.parte) || pickerCor.parte.startsWith('sec_')
        return (
        <>
          <div className="pointer-events-none fixed inset-0 z-40 bg-black/5" />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-80 max-w-[85vw] flex-col border-l bg-background shadow-2xl duration-200 animate-in slide-in-from-right">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                {origemEstrutura && <button onClick={() => { setPickerCor(null); setOrigemEstrutura(false); setEstruturaAberta(true) }} title="Voltar para a estrutura" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronLeft className="h-4 w-4" /></button>}
                <div className="min-w-0">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Editar bloco</div>
                  <div className="truncate text-sm font-semibold" title={pickerCor.label}>{pickerCor.label}</div>
                </div>
              </div>
              <button onClick={fecharPickerCor} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="scroll-claro min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {pickerCor.parte.startsWith('sug:') ? (() => {
                const i = Number(pickerCor.parte.slice('sug:'.length))
                const cf = (ativo.conteudo ?? {}) as DiagConteudo
                const s = cf.sugestoes?.[i]
                return (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="mb-1 text-[11px] text-muted-foreground">Cor</div>
                        <HexColorField value={a.coresParte?.[pickerCor.parte] ?? pickerCor.cor} onChange={(v) => setAjuste({ coresParte: { ...(a.coresParte ?? {}), [pickerCor.parte]: v } })} />
                      </div>
                      <div>
                        <div className="mb-1 text-[11px] text-muted-foreground">Cor do título</div>
                        <HexColorField value={s?.corTitulo || '#9a6e00'} onChange={(v) => setConteudo({ ...cf, sugestoes: (cf.sugestoes ?? []).map((x, j) => j === i ? { ...x, corTitulo: v } : x) })} />
                      </div>
                      <div><div className="mb-1 text-[11px] text-muted-foreground">Cor de <b>&gt;</b></div><HexColorField value={cf.corMarcador || '#3b5bdb'} onChange={(v) => setConteudo({ ...cf, corMarcador: v })} /></div>
                      <div><div className="mb-1 text-[11px] text-muted-foreground">Cor de <b>&gt;&gt;</b></div><HexColorField value={cf.corMarcadorForte || '#e8850c'} onChange={(v) => setConteudo({ ...cf, corMarcadorForte: v })} /></div>
                    </div>
                    <p className="text-[10px] leading-snug text-muted-foreground">Nos Tópicos, comece a linha com <code>&gt;</code> ou <code>&gt;&gt;</code> para o marcador pegar a cor.</p>
                  </div>
                )
              })() : temCorTexto ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="mb-1 text-[11px] text-muted-foreground">Cor</div>
                    <HexColorField value={a.coresParte?.[pickerCor.parte] ?? pickerCor.cor} onChange={(v) => setAjuste({ coresParte: { ...(a.coresParte ?? {}), [pickerCor.parte]: v } })} />
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] text-muted-foreground">Cor do texto</div>
                    <HexColorField value={a.coresTextoParte?.[pickerCor.parte] || '#ffffff'} onChange={(v) => setAjuste({ coresTextoParte: { ...(a.coresTextoParte ?? {}), [pickerCor.parte]: v } })} />
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Cor</div>
                  <HexColorField value={a.coresParte?.[pickerCor.parte] ?? pickerCor.cor} onChange={(v) => setAjuste({ coresParte: { ...(a.coresParte ?? {}), [pickerCor.parte]: v } })} />
                  {a.coresParte?.[pickerCor.parte] && (
                    <button onClick={() => { const cp = { ...(a.coresParte ?? {}) }; delete cp[pickerCor.parte]; setAjuste({ coresParte: cp }) }} className="mt-2 text-[11px] text-muted-foreground hover:underline">Restaurar cor padrão</button>
                  )}
                </>
              )}
              {(pickerCor.parte.startsWith('pilar:') || pickerCor.parte === 'lingua_card') && (() => {
                const cf = (ativo.conteudo ?? {}) as DiagConteudo
                const isLP = pickerCor.parte === 'lingua_card'
                const idx = Number(pickerCor.parte.slice(pickerCor.parte.indexOf(':') + 1))
                const alvo = isLP ? cf.linguaPortuguesa : (cf.pilares ?? [])[idx]
                const chave = alvo?.chave ?? '', tipo = (alvo?.tipoFonte ?? 'pilar') as 'pilar' | 'disciplina'
                const val = (tipo === 'disciplina' ? 'd' : 'p') + ':' + chave
                const sel = (nc: string, nt: 'pilar' | 'disciplina') => {
                  if (isLP) { if (cf.linguaPortuguesa) setConteudo({ ...cf, linguaPortuguesa: { ...cf.linguaPortuguesa, chave: nc, tipoFonte: nt, totalTxt: totalTxtDe(nc, nt) } }) }
                  else setConteudo({ ...cf, pilares: (cf.pilares ?? []).map((pl, i) => i === idx ? { ...pl, chave: nc, tipoFonte: nt, totalTxt: totalTxtDe(nc, nt) } : pl) })
                }
                const existe = fontesDisponiveis.some((f) => (f.tipo === 'disciplina' ? 'd' : 'p') + ':' + f.chave === val)
                return (
                  <div className="mt-3">
                    <div className="mb-1 text-[11px] text-muted-foreground">Fonte dos dados (pilar/disciplina do simulado)</div>
                    <select value={val} onChange={(e) => { const v = e.target.value; const t = v.slice(0, 1); sel(v.slice(2), t === 'd' ? 'disciplina' : 'pilar') }} className="w-full rounded border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary">
                      {!existe && <option value={val}>{chave || '(escolher)'}</option>}
                      <optgroup label="Pilares">{fontesDisponiveis.filter((f) => f.tipo === 'pilar').map((f) => <option key={'p:' + f.chave} value={'p:' + f.chave}>{f.nome}</option>)}</optgroup>
                      <optgroup label="Disciplinas">{fontesDisponiveis.filter((f) => f.tipo === 'disciplina').map((f) => <option key={'d:' + f.chave} value={'d:' + f.chave}>{f.nome}</option>)}</optgroup>
                    </select>
                    <p className="mt-1 text-[10px] leading-snug text-muted-foreground">De qual pilar/disciplina do simulado vêm o % e a contagem deste card.</p>
                  </div>
                )
              })()}
              {pickerCor.parte === 'sec_pilares' && (() => {
                const cf = (ativo.conteudo ?? {}) as DiagConteudo
                return (
                  <div className="mt-3">
                    <button type="button" onClick={() => setConteudo({ ...cf, pilares: [...(cf.pilares ?? []), { nome: 'Novo pilar', chave: '', tipoFonte: 'pilar', totalTxt: '', bandas: [{ faixa: '0-49', texto: '' }, { faixa: '50-80', texto: '' }, { faixa: '81-100', texto: '' }] }] })} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/40 px-2 py-1.5 text-[12px] font-medium text-primary hover:bg-primary/10">
                      <Plus className="h-3.5 w-3.5" /> Adicionar pilar
                    </button>
                    <p className="mt-1 text-[10px] leading-snug text-muted-foreground">Depois clique no card do novo pilar para escolher a fonte e o texto.</p>
                  </div>
                )
              })()}
              <div className="mt-3">
                <div className="mb-1 text-[11px] text-muted-foreground">Alinhamento</div>
                <div className="flex overflow-hidden rounded-md border">
                  {([['left', 'Esq.'], ['center', 'Centro'], ['right', 'Dir.'], ['justify', 'Justif.']] as const).map(([v, lbl]) => (
                    <button key={v} type="button" onClick={() => setAjuste({ alinhamentoParte: { ...(a.alinhamentoParte ?? {}), [pickerCor.parte]: v } })}
                      className={cn('flex-1 py-1 text-[11px]', (a.alinhamentoParte?.[pickerCor.parte]) === v ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-muted')}>{lbl}</button>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex items-start gap-2">
                <div className="shrink-0">
                  <div className="mb-1 text-[11px] text-muted-foreground">Estilo</div>
                  <div className="flex gap-1.5">
                    {([['b', <b key="b">B</b>], ['i', <i key="i">I</i>], ['u', <u key="u">U</u>]] as const).map(([k, ic]) => {
                      const cur = a.estiloParte?.[pickerCor.parte] ?? {}
                      return <button key={k} type="button" onClick={() => setAjuste({ estiloParte: { ...(a.estiloParte ?? {}), [pickerCor.parte]: { ...cur, [k]: !(cur as any)[k] } } })}
                        className={cn('flex h-8 w-8 items-center justify-center rounded border text-[13px]', (cur as any)[k] ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>{ic}</button>
                    })}
                  </div>
                </div>
                <div className="mt-5 w-px self-stretch bg-border/70" />
                {(() => {
                  const base = a.compacto ? 9 : 10 // corpo padrão (casa com previa.tsx)
                  const px = Math.round((a.tamanhoParte?.[pickerCor.parte] ?? 1) * base)
                  const setPx = (v: number) => { const nv = Math.min(48, Math.max(6, Math.round(v))); const t = { ...(a.tamanhoParte ?? {}) }; if (nv === base) delete t[pickerCor.parte]; else t[pickerCor.parte] = Math.round((nv / base) * 100) / 100; setAjuste({ tamanhoParte: t }) }
                  const TAMS = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36]
                  return (
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground"><span>Tamanho</span>{px !== base && <button type="button" onClick={() => setPx(base)} className="text-[11px] hover:underline">Padrão</button>}</div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setPx(px - 1)} title="Diminuir" className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md border text-base font-semibold hover:bg-muted">−</button>
                        <select value={px} onChange={(e) => setPx(Number(e.target.value))} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-1 text-center text-sm outline-none focus:border-primary">
                          {!TAMS.includes(px) && <option value={px}>{px}</option>}
                          {TAMS.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <button type="button" onClick={() => setPx(px + 1)} title="Aumentar" className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md border text-base font-semibold hover:bg-muted">+</button>
                      </div>
                    </div>
                  )
                })()}
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
                  {campos.map((campo) => (
                    <CampoFormatavel key={campo.id} campo={campo} onChange={(v) => onCampo(campo, v)} />
                  ))}
                  <p className="text-[10px] leading-snug text-muted-foreground">Selecione um trecho e use <b>B</b> / <i>I</i> / <u>U</u>, ou escreva <code>**negrito**</code>, <code>*itálico*</code>, <code>&lt;u&gt;sublinhado&lt;/u&gt;</code>.</p>
                </div>
              )}
              {pickerCor.parte.startsWith('disc:') && (() => {
                const chave = pickerCor.parte.slice('disc:'.length)
                const cf = (ativo.conteudo ?? {}) as DiagConteudo
                return (
                  <div className="mt-4 space-y-3 border-t pt-4">
                    <div>
                      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Cor do texto</div>
                      <HexColorField value={cf.discCorTexto?.[chave] || '#2d254f'} onChange={(v) => setConteudo({ ...cf, discCorTexto: { ...(cf.discCorTexto ?? {}), [chave]: v } })} />
                    </div>
                    {disciplinasBanco.length > 0 && (
                      <div>
                        <div className="mb-1 text-[11px] text-muted-foreground">Disciplina (dados/assuntos)</div>
                        <select value={cf.discFonte?.[chave] ?? chave} onChange={(e) => {
                          const src = e.target.value
                          const nome = disciplinasBanco.find((x) => x.chave === src)?.nome ?? ''
                          setConteudo({ ...cf, discFonte: { ...(cf.discFonte ?? {}), [chave]: src }, discNomes: { ...(cf.discNomes ?? {}), [chave]: nome } })
                        }} className="w-full rounded border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary">
                          {disciplinasBanco.map((x) => <option key={x.chave} value={x.chave}>{x.nome}</option>)}
                        </select>
                        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">Escolhe de qual disciplina vêm os assuntos e as estatísticas deste card.</p>
                      </div>
                    )}
                    {(() => {
                      const src = cf.discFonte?.[chave] ?? chave
                      const qs = questoesMeta.filter((q) => q.disciplinaChave === src)
                      return (
                        <div>
                          <div className="mb-1 text-[11px] text-muted-foreground">Questões desta disciplina (na ordem do caderno)</div>
                          {qs.length ? (
                            <div className="scroll-claro max-h-60 space-y-0.5 overflow-y-auto rounded-md border bg-muted/20 p-1.5">
                              {qs.map((q) => (
                                <div key={q.numero} className="flex items-start gap-1.5 text-[11px] leading-snug">
                                  <span className="mt-px shrink-0 rounded bg-primary/10 px-1 font-semibold text-primary">{q.numero}</span>
                                  <span className="min-w-0 flex-1 text-muted-foreground">{q.assunto || <span className="italic opacity-70">sem assunto</span>}</span>
                                </div>
                              ))}
                            </div>
                          ) : <p className="rounded-md border border-dashed px-2 py-2 text-[11px] text-muted-foreground">Nenhuma questão desta disciplina no banco (ou os metadados ainda estão carregando).</p>}
                          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">Só para referência — mostra o número da questão e o assunto de cada uma desta disciplina.</p>
                        </div>
                      )
                    })()}
                  </div>
                )
              })()}
              <p className="mt-4 text-[10px] leading-snug text-muted-foreground">Personaliza só este bloco. Clique em qualquer bloco da prévia para editá-lo.</p>
              {podeRemoverParte(pickerCor.parte) && (
                <button type="button" onClick={() => { setConteudo(removerParteDiag(ativo.conteudo, pickerCor.parte)); setPickerCor(null) }} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-destructive/40 px-2 py-1.5 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5" /> Apagar este bloco
                </button>
              )}
            </div>
          </aside>
        </>
        )
      })()}

      {/* Barra lateral direita — editar o TÍTULO DA CAPA (modelos prontos) */}
      {pickerCapa && a.capaUrl && (
        <>
          <div className="pointer-events-none fixed inset-0 z-40 bg-black/5" />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-80 max-w-[85vw] flex-col border-l bg-background shadow-2xl duration-200 animate-in slide-in-from-right">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Editar capa</div>
                <div className="truncate text-sm font-semibold">Título sobre a capa</div>
              </div>
              <button onClick={() => setPickerCapa(false)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="scroll-claro min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div>
                <div className="mb-1 text-[11px] text-muted-foreground">Texto</div>
                <textarea value={capaEfetiva.titulo} onChange={(e) => setCapa({ titulo: e.target.value })} rows={3} className="w-full resize-y rounded border bg-background px-2 py-1 text-xs leading-snug outline-none focus:border-primary" />
              </div>

              <div>
                <div className="mb-1 text-[11px] text-muted-foreground">Fonte</div>
                <select value={capaEfetiva.fonte} onChange={(e) => setCapa({ fonte: e.target.value })} className="w-full rounded border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary">
                  <option value="">Padrão do tema</option>
                  {FONTES_CADERNO.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>

              <div>
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Cor</div>
                <HexColorField value={capaEfetiva.cor} onChange={(v) => setCapa({ cor: v })} />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground"><span>Tamanho</span><span className="font-semibold text-foreground">{capaEfetiva.tamanho}px</span></div>
                <input type="range" min={16} max={96} step={1} value={capaEfetiva.tamanho} onChange={(e) => setCapa({ tamanho: Number(e.target.value) })} className="w-full accent-primary" />
              </div>

              <div>
                <div className="mb-1 text-[11px] text-muted-foreground">Estilo</div>
                <div className="flex gap-1.5">
                  {([['negrito', <b key="b">B</b>], ['italico', <i key="i">I</i>], ['sublinhado', <u key="u">U</u>]] as const).map(([k, ic]) => (
                    <button key={k} type="button" onClick={() => setCapa({ [k]: !capaEfetiva[k] } as Partial<CapaConfig>)}
                      className={cn('flex h-7 w-8 items-center justify-center rounded border text-[13px]', capaEfetiva[k] ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>{ic}</button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 text-[11px] text-muted-foreground">Alinhamento do texto</div>
                <div className="flex overflow-hidden rounded-md border">
                  {(['left', 'center', 'right'] as const).map((al) => (
                    <button key={al} type="button" onClick={() => setCapa({ alinhamento: al })}
                      className={cn('flex-1 py-1 text-xs capitalize', capaEfetiva.alinhamento === al ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-muted')}>
                      {al === 'left' ? 'Esq.' : al === 'center' ? 'Centro' : 'Dir.'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground"><span>Posição horizontal</span><span className="font-semibold text-foreground">{capaEfetiva.posH}%</span></div>
                <input type="range" min={0} max={100} step={1} value={capaEfetiva.posH} onChange={(e) => setCapa({ posH: Number(e.target.value) })} className="w-full accent-primary" />
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">0% = esquerda · 100% = direita.</p>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground"><span>Posição vertical</span><span className="font-semibold text-foreground">{capaEfetiva.posV}%</span></div>
                <input type="range" min={0} max={100} step={1} value={capaEfetiva.posV} onChange={(e) => setCapa({ posV: Number(e.target.value) })} className="w-full accent-primary" />
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">0% = topo · 100% = base da página.</p>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Barra lateral direita — editar um BLOCO do modelo pronto (cor/fonte/texto individual) */}
      {pickerBloco && blocoSel && (
        <>
          <div className="pointer-events-none fixed inset-0 z-40 bg-black/5" />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-80 max-w-[85vw] flex-col border-l bg-background shadow-2xl duration-200 animate-in slide-in-from-right">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Editar bloco</div>
                <div className="truncate text-sm font-semibold">{NOME_BLOCO[blocoSel.type] ?? blocoSel.type}</div>
              </div>
              <button onClick={() => setPickerBloco(null)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="scroll-claro min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
              {camposDoBlocoDoc(blocoSel).map((campo) => (
                <CampoBlocoEditor key={campo.id} campo={campo} onChange={(v) => setBlocoAttr(pickerBloco!, { [campo.id]: v })} />
              ))}

              {/* Card de dados/desempenho: editar os rótulos e valores das linhas */}
              {blocoSel.type === 'identificacao' && (['destaque', 'campos', 'desempenho'] as const).map((chave) => {
                const linhas = ((blocoSel!.attributes as any)[chave] ?? []) as { rotulo: string; valor: string }[]
                if (!linhas.length) return null
                const rotChave = chave === 'destaque' ? 'Destaques' : chave === 'campos' ? 'Campos' : 'Desempenho'
                const setLinha = (i: number, patch: Partial<{ rotulo: string; valor: string }>) =>
                  setBlocoAttr(pickerBloco!, { [chave]: linhas.map((l, j) => j === i ? { ...l, ...patch } : l) })
                return (
                  <div key={chave} className="space-y-2 border-t pt-3">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{rotChave}</div>
                    {linhas.map((l, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input value={l.rotulo} onChange={(e) => setLinha(i, { rotulo: e.target.value })} placeholder="Rótulo" className="w-1/2 rounded border bg-background px-2 py-1 text-xs outline-none focus:border-primary" />
                        <input value={l.valor} onChange={(e) => setLinha(i, { valor: e.target.value })} placeholder="Valor" className="w-1/2 rounded border bg-background px-2 py-1 text-xs outline-none focus:border-primary" />
                      </div>
                    ))}
                  </div>
                )
              })}

              {camposDoBlocoDoc(blocoSel).length === 0 && blocoSel.type !== 'identificacao' && <p className="text-[11px] text-muted-foreground">Este bloco não tem propriedades editáveis por aqui.</p>}
              <p className="pt-1 text-[10px] leading-snug text-muted-foreground">Edita este bloco do modelo. Nas questões, a mudança vale para todas (é o mesmo bloco repetido).</p>

              <button type="button" onClick={() => removerBlocoDoc(pickerBloco!)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-destructive/40 px-2 py-1.5 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5" /> Apagar este bloco
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Painel de ESTRUTURA (outline) — lista/ordena/edita/remove os blocos do diagnóstico */}
      {estruturaAberta && (
        <>
          <div className="pointer-events-none fixed inset-0 z-40 bg-black/5" />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-96 max-w-[90vw] flex-col border-l bg-background shadow-2xl duration-200 animate-in slide-in-from-right">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Estrutura</div>
                <div className="truncate text-sm font-semibold">Blocos do diagnóstico</div>
              </div>
              <button onClick={() => setEstruturaAberta(false)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="scroll-claro min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <p className="mb-2 px-1 text-[11px] leading-snug text-muted-foreground">Arraste pelo <GripVertical className="inline h-3 w-3" /> ou use as setas para reordenar. Clique no lápis para editar o bloco.</p>
              <div className="space-y-1">
                {outline.map((e, i) => {
                  const Icon = ICONE_TIPO[e.tipo] ?? Type
                  const pilares = e.key === 'pilares' ? (ativo.conteudo?.pilares ?? []) : []
                  return (
                    <Fragment key={e.key}>
                      <div draggable onDragStart={() => setDragIdx(i)} onDragOver={(ev) => ev.preventDefault()}
                        onDrop={() => { if (dragIdx != null) soltarEntrada(dragIdx, i); setDragIdx(null) }} onDragEnd={() => setDragIdx(null)}
                        className={cn('group flex items-center gap-1.5 rounded-md border bg-background px-1.5 py-1.5', dragIdx === i && 'opacity-50')}>
                        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60" />
                        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate text-[12px]" title={e.label}>{e.label}</span>
                        <div className="flex shrink-0 items-center">
                          <button type="button" onClick={() => moverEntrada(i, -1)} disabled={i === 0} title="Subir" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => moverEntrada(i, 1)} disabled={i === outline.length - 1} title="Descer" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                          {e.parte && <button type="button" onClick={() => editarEntrada(e)} title="Editar bloco" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>}
                          {e.removivel && <button type="button" onClick={() => apagarEntrada(e)} title="Apagar bloco" className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
                        </div>
                      </div>
                      {pilares.map((pl, pi) => (
                        <div key={pi} className="ml-6 flex items-center gap-1.5 rounded-md border border-dashed bg-muted/20 px-1.5 py-1.5">
                          <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                          <span className="min-w-0 flex-1 truncate text-[12px]" title={pl.nome}>{pl.nome || `Pilar ${pi + 1}`}</span>
                          <div className="flex shrink-0 items-center">
                            <button type="button" onClick={() => moverPilar(pi, -1)} disabled={pi === 0} title="Subir" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                            <button type="button" onClick={() => moverPilar(pi, 1)} disabled={pi === pilares.length - 1} title="Descer" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                            <button type="button" onClick={() => abrirEdicaoDeParte(`pilar:${pi}`, pl.nome || `Pilar ${pi + 1}`)} title="Editar pilar" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                            <button type="button" onClick={() => apagarPilar(pi)} title="Apagar pilar" className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                      ))}
                    </Fragment>
                  )
                })}
                {outline.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Sem blocos para exibir.</p>}
              </div>
              <div className="mt-3 rounded-md border border-dashed px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
                <Plus className="mr-1 inline h-3.5 w-3.5" /> Adicionar novos blocos (texto, card, desempenho) — em breve.
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  )
}

/** Editor de um campo de bloco (texto/cor/fonte/número/toggle). */
function CampoBlocoEditor({ campo, onChange }: { campo: CampoBlocoDoc; onChange: (v: any) => void }) {
  if (campo.tipo === 'cor') return (
    <div><div className="mb-1 text-[11px] text-muted-foreground">{campo.label}</div><HexColorField value={campo.valor || '#000000'} onChange={onChange} /></div>
  )
  if (campo.tipo === 'fonte') return (
    <div>
      <div className="mb-1 text-[11px] text-muted-foreground">{campo.label}</div>
      <select value={campo.valor || ''} onChange={(e) => onChange(e.target.value)} className="w-full rounded border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary">
        <option value="">Padrão do tema</option>
        {FONTES_CADERNO.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
      </select>
    </div>
  )
  if (campo.tipo === 'num') return (
    <div><div className="mb-1 text-[11px] text-muted-foreground">{campo.label}</div><input type="number" value={Number(campo.valor) || 0} onChange={(e) => onChange(Number(e.target.value))} className="w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:border-primary" /></div>
  )
  if (campo.tipo === 'bool') return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5 text-[13px]">
      <span className="text-muted-foreground">{campo.label}</span>
      <input type="checkbox" checked={!!campo.valor} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
  // Texto: usa o campo com barra B/I/U (mesma sintaxe do diagnóstico) — renderiza no preview.
  return <CampoFormatavel campo={{ id: campo.id, label: campo.label, valor: String(campo.valor ?? ''), multiline: true }} onChange={onChange} />
}

/** Campo de texto com barra de formatação (negrito/itálico/sublinhado) que envolve a seleção. */
function CampoFormatavel({ campo, onChange }: { campo: CampoTexto; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null)
  function wrap(pre: string, suf: string) {
    const el = ref.current
    const val = campo.valor
    const s = el?.selectionStart ?? val.length
    const e = el?.selectionEnd ?? val.length
    const sel = val.slice(s, e) || 'texto'
    onChange(val.slice(0, s) + pre + sel + suf + val.slice(e))
    requestAnimationFrame(() => { if (!el) return; el.focus(); const p = s + pre.length; try { el.setSelectionRange(p, p + sel.length) } catch {} })
  }
  const btn = 'flex h-5 w-6 items-center justify-center rounded border text-[11px] leading-none hover:bg-muted'
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-muted-foreground">{campo.label}</span>
        <div className="flex shrink-0 gap-0.5">
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap('**', '**')} className={btn} title="Negrito"><b>B</b></button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap('*', '*')} className={btn} title="Itálico"><i>I</i></button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap('<u>', '</u>')} className={btn} title="Sublinhado"><u>U</u></button>
        </div>
      </div>
      {campo.multiline
        ? <textarea ref={ref as any} value={campo.valor} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full resize-y rounded border bg-background px-2 py-1 text-xs leading-snug outline-none focus:border-primary" />
        : <input ref={ref as any} value={campo.valor} onChange={(e) => onChange(e.target.value)} className="w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:border-primary" />}
    </div>
  )
}

/** Upload/preview/remoção de uma imagem (capa/folha). Sobe base64→URL (bucket pdfs/assets). */
function CampoImagem({ label, valor, onChange }: { label: string; valor: string; onChange: (url: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  async function enviar(file: File) {
    if (!file.type.startsWith('image/')) { toast.error('Envie uma imagem.'); return }
    if (file.size > 6 * 1024 * 1024) { toast.error('Imagem muito grande (máx. ~6 MB).'); return }
    setEnviando(true)
    try {
      const dataUri = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(new Error('leitura')); fr.readAsDataURL(file) })
      const r = await hospedarImagemCadernoAction(dataUri)
      if (r.ok && r.url) onChange(r.url); else toast.error(r.error ?? 'Falha ao enviar a imagem.')
    } catch { toast.error('Erro ao ler a imagem.') } finally { setEnviando(false) }
  }
  return (
    <div className="rounded-md border bg-background p-1.5">
      <div className="mb-1 truncate text-[11px] text-muted-foreground" title={label}>{label}</div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = '' }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={enviando} title={valor ? 'Trocar imagem' : 'Enviar imagem'} className="flex h-16 w-full items-center justify-center overflow-hidden rounded border bg-muted/40 text-muted-foreground transition-colors hover:border-primary/50">
        {valor ? <img src={valor} alt="" className="h-full w-full object-cover" /> : (enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />)}
      </button>
      <div className="mt-1 flex gap-1">
        <Button variant="outline" size="sm" className="h-6 flex-1 px-1 text-[11px]" onClick={() => ref.current?.click()} disabled={enviando}>{enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (valor ? 'Trocar' : 'Enviar')}</Button>
        {valor && <Button variant="outline" size="sm" className="h-6 px-1.5 text-[11px] text-destructive" onClick={() => onChange('')} disabled={enviando}><X className="h-3.5 w-3.5" /></Button>}
      </div>
    </div>
  )
}
