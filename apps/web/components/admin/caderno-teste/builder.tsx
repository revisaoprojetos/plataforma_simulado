'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ChevronLeft, Save, Loader2, Database, FileText, ClipboardList, BarChart3, LayoutTemplate, Pencil, Plus, X, Layers, FileUp, ChevronDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { HexColorField } from '@/components/admin/hex-color-field'
import { Previa } from '@/lib/caderno-teste/previa'
import { ModeloPicker } from '@/components/admin/caderno-teste/modelo-picker'
import { BancoPicker, type BancoOpcao } from '@/components/admin/caderno-teste/banco-picker'
import { metaDaModalidade, itemAtivo, novoItem, type BuilderV3, type BuilderAjustes, type Modalidade, type PreviewQuestao } from '@/lib/caderno-teste/tipos'
import { camposDoBloco, aplicarCampoBloco } from '@/lib/caderno-teste/edicao'
import type { DiagConteudo } from '@/lib/caderno-teste/diagnostico'
import { salvarBuilderTeste, previewQuestoesBanco, dadosBancoTeste, type RegistroTeste, type DiscBancoTeste } from '@/app/admin/cadernos-teste/actions'
import { hospedarImagemCadernoAction } from '@/app/admin/cadernos/actions'
import { Users, ChevronRight, Download } from 'lucide-react'

const ICONE_MOD: Record<Modalidade, any> = { caderno_questoes: FileText, folha_respostas: ClipboardList, diagnostico: BarChart3 }

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
  const [builder, setBuilder] = useState<BuilderV3>(builderInicial)
  const [questoes, setQuestoes] = useState<PreviewQuestao[]>(questoesIniciais)
  const [registros, setRegistros] = useState<RegistroTeste[]>(registrosIniciais)
  const [disciplinasBanco, setDisciplinasBanco] = useState<DiscBancoTeste[]>(disciplinasIniciais)
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
  const importRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const { ref, zoom } = useZoomAjustado()

  const ativo = itemAtivo(builder)
  const meta = metaDaModalidade(ativo.modalidade)
  const modeloNome = meta.modelos.find((m) => m.id === ativo.modelo)?.nome ?? meta.modelos[0].nome
  const IconeMod = ICONE_MOD[ativo.modalidade]
  const a = ativo.ajustes
  const bancoAtual = bancos.find((b) => b.id === builder.bancoId) ?? null
  const setAjuste = (patch: Partial<BuilderAjustes>) => setBuilder((b) => ({ ...b, itens: b.itens.map((it) => it.id === b.ativo ? { ...it, ajustes: { ...it.ajustes, ...patch } } : it) }))
  const setConteudo = (conteudo: DiagConteudo) => setBuilder((b) => ({ ...b, itens: b.itens.map((it) => it.id === b.ativo ? { ...it, conteudo } : it) }))

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
  const varsPrevia = alunoAtual?.vars ?? (builder.bancoId ? {} : {})
  const exportUrl = (fmt: 'word' | 'html') => `/api/admin/caderno-teste/exportar?caderno=${cadernoId}&grupo=${ativo.id}&formato=${fmt}${alunoAtual ? `&aluno=${alunoAtual.id}` : ''}`
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
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-background">
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
                <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border bg-background shadow-lg">
                  <a href={exportUrl('word')} onClick={() => setBaixarAberto(false)} className="block px-3 py-2 text-sm hover:bg-muted">Word (.doc)</a>
                  <a href={exportUrl('html')} onClick={() => setBaixarAberto(false)} className="block border-t px-3 py-2 text-sm hover:bg-muted">HTML (.html)</a>
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
          <label className="col-span-2 block text-xs text-muted-foreground">
            <span className="mb-1 block">Título</span>
            <input value={a.titulo} onChange={(e) => setAjuste({ titulo: e.target.value })} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm text-foreground" />
          </label>
          <div className="col-span-1 rounded-md border bg-background px-2 py-1.5"><div className="mb-1 text-[11px] text-muted-foreground">Cor primária</div><HexColorField value={a.corPrimaria} onChange={(v) => setAjuste({ corPrimaria: v })} /></div>
          <div className="col-span-1 rounded-md border bg-background px-2 py-1.5"><div className="mb-1 text-[11px] text-muted-foreground">Cor secundária</div><HexColorField value={a.corSecundaria} onChange={(v) => setAjuste({ corSecundaria: v })} /></div>
          <div className="col-span-1"><Tog campo="mostrarCabecalho" label="Cabeçalho" /></div>
          <div className="col-span-1"><Tog campo="mostrarDadosAluno" label="Dados aluno" /></div>
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
          <div className="col-span-1"><Tog campo="compacto" label="Compacto" /></div>
          <div className="col-span-2"><CampoImagem label="Capa (página inteira)" valor={a.capaUrl} onChange={(url) => setAjuste({ capaUrl: url })} /></div>
          <div className="col-span-2"><CampoImagem label="Folha (fundo de cada página)" valor={a.folhaUrl} onChange={(url) => setAjuste({ folhaUrl: url })} /></div>
          <div className="col-span-2"><CampoImagem label="Cabeçalho (faixa no topo)" valor={a.cabecalhoUrl} onChange={(url) => setAjuste({ cabecalhoUrl: url })} /></div>
          <div className="col-span-2"><CampoImagem label="Rodapé (faixa na base)" valor={a.rodapeUrl} onChange={(url) => setAjuste({ rodapeUrl: url })} /></div>
          {ativo.modalidade === 'diagnostico' && (
            <div className="col-span-2 rounded-md border border-dashed px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
              💡 Cor das disciplinas por pilar: <strong>clique no card de uma disciplina na prévia</strong> (à direita) e escolha a cor ao lado.
            </div>
          )}
          </>)}
        </div>

        {/* Direita: prévia A4 do grupo ativo (padding lateral menor) */}
        <div ref={ref} className="scroll-claro min-h-0 overflow-auto bg-[radial-gradient(circle,theme(colors.slate.300)_1px,transparent_1px)] [background-size:18px_18px] px-3 py-5 dark:bg-[radial-gradient(circle,theme(colors.slate.700)_1px,transparent_1px)]">
          {builder.bancoId ? (
            <div className="mx-auto" style={{ zoom } as any}>
              <Previa item={ativo} questoes={questoes} vars={varsPrevia} discBanco={disciplinasBanco} selParte={pickerCor?.parte}
                onPick={(parte, label, cor) => setPickerCor({ parte, label, cor })} />
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
        const campos = camposDoBloco(ativo, pickerCor.parte)
        const onCampo = (campo: (typeof campos)[number], v: string) => campo.alvo === 'titulo' ? setAjuste({ titulo: v }) : setConteudo(aplicarCampoBloco(ativo.conteudo, pickerCor.parte, campo.id, v))
        return (
        <>
          <div className="fixed inset-0 z-40 bg-black/10" onClick={() => setPickerCor(null)} />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-80 max-w-[85vw] flex-col border-l bg-background shadow-2xl duration-200 animate-in slide-in-from-right">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Editar bloco</div>
                <div className="truncate text-sm font-semibold" title={pickerCor.label}>{pickerCor.label}</div>
              </div>
              <button onClick={() => setPickerCor(null)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="scroll-claro min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Cor</div>
              <HexColorField value={a.coresParte?.[pickerCor.parte] ?? pickerCor.cor} onChange={(v) => setAjuste({ coresParte: { ...(a.coresParte ?? {}), [pickerCor.parte]: v } })} />
              {a.coresParte?.[pickerCor.parte] && (
                <button onClick={() => { const cp = { ...(a.coresParte ?? {}) }; delete cp[pickerCor.parte]; setAjuste({ coresParte: cp }) }} className="mt-2 text-[11px] text-muted-foreground hover:underline">Restaurar cor padrão</button>
              )}
              {campos.length > 0 && (
                <div className="mt-4 space-y-2.5 border-t pt-4">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Texto</div>
                  {campos.map((campo) => (
                    <label key={campo.id} className="block">
                      <span className="mb-0.5 block text-[11px] text-muted-foreground">{campo.label}</span>
                      {campo.multiline ? (
                        <textarea value={campo.valor} onChange={(e) => onCampo(campo, e.target.value)} rows={3} className="w-full resize-y rounded border bg-background px-2 py-1 text-xs leading-snug outline-none focus:border-primary" />
                      ) : (
                        <input value={campo.valor} onChange={(e) => onCampo(campo, e.target.value)} className="w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:border-primary" />
                      )}
                    </label>
                  ))}
                </div>
              )}
              <p className="mt-4 text-[10px] leading-snug text-muted-foreground">Personaliza só este bloco. Clique em qualquer bloco da prévia para editá-lo.</p>
            </div>
          </aside>
        </>
        )
      })()}
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
    <div className="rounded-md border bg-background px-2 py-1.5">
      <div className="mb-1 text-[11px] text-muted-foreground">{label}</div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = '' }} />
      <div className="flex items-center gap-2">
        <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/40 text-muted-foreground">
          {valor ? <img src={valor} alt="" className="h-full w-full object-cover" /> : <FileText className="h-4 w-4" />}
        </div>
        <div className="flex flex-1 gap-1.5">
          <Button variant="outline" size="sm" className="h-7 flex-1 text-xs" onClick={() => ref.current?.click()} disabled={enviando}>{enviando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileUp className="mr-1 h-3.5 w-3.5" />}{valor ? 'Trocar' : 'Enviar'}</Button>
          {valor && <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={() => onChange('')} disabled={enviando}><X className="h-3.5 w-3.5" /></Button>}
        </div>
      </div>
    </div>
  )
}
