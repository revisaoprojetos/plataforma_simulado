'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ChevronLeft, Save, Loader2, Database, FileText, ClipboardList, BarChart3, LayoutTemplate, Pencil, Plus, X, Layers, FileUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { HexColorField } from '@/components/admin/hex-color-field'
import { Previa } from '@/lib/caderno-teste/previa'
import { ModeloPicker } from '@/components/admin/caderno-teste/modelo-picker'
import { BancoPicker, type BancoOpcao } from '@/components/admin/caderno-teste/banco-picker'
import { metaDaModalidade, itemAtivo, novoItem, type BuilderV3, type BuilderAjustes, type Modalidade, type PreviewQuestao } from '@/lib/caderno-teste/tipos'
import { salvarBuilderTeste, previewQuestoesBanco } from '@/app/admin/cadernos-teste/actions'

const ICONE_MOD: Record<Modalidade, any> = { caderno_questoes: FileText, folha_respostas: ClipboardList, diagnostico: BarChart3 }

/** Zoom da prévia para caber na largura do painel direito. */
function useZoomAjustado(alvoLargura = 794) {
  const ref = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(0.7)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const calc = () => setZoom(Math.min(1, Math.max(0.35, (el.clientWidth - 32) / alvoLargura)))
    calc()
    const ro = new ResizeObserver(calc); ro.observe(el)
    return () => ro.disconnect()
  }, [alvoLargura])
  return { ref, zoom }
}

export function CadernoTesteBuilder({ cadernoId, builderInicial, bancos, questoesIniciais, abrirPickerInicial = false }: {
  cadernoId: string
  builderInicial: BuilderV3
  bancos: BancoOpcao[]
  questoesIniciais: PreviewQuestao[]
  abrirPickerInicial?: boolean
}) {
  const [builder, setBuilder] = useState<BuilderV3>(builderInicial)
  const [questoes, setQuestoes] = useState<PreviewQuestao[]>(questoesIniciais)
  const [carregandoQ, setCarregandoQ] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(abrirPickerInicial)
  const [pickerMode, setPickerMode] = useState<'add' | 'trocar'>('trocar')
  const [bancoPickerOpen, setBancoPickerOpen] = useState(false)
  const [editandoGrupos, setEditandoGrupos] = useState(false)
  const [importando, setImportando] = useState(false)
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
    if (!bancoId) { setQuestoes([]); return }
    setCarregandoQ(true)
    previewQuestoesBanco(bancoId).then((r) => { if (r.ok) setQuestoes(r.questoes ?? []) }).finally(() => setCarregandoQ(false))
  }
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
          <input ref={importRef} type="file" accept=".docx,.html,.htm,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = '' }} />
          <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} disabled={importando} title="Importar um caderno (Word .docx ou HTML) — mapeia como Diagnóstico">
            {importando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileUp className="mr-1.5 h-4 w-4" />} Importar
          </Button>
          <Button onClick={salvar} disabled={pending} size="sm">{pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Salvar</Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[380px_1fr]">
        {/* Esquerda: 2 colunas */}
        <div className="scroll-claro grid min-h-0 grid-cols-2 content-start gap-x-2.5 gap-y-4 overflow-y-auto border-r bg-muted/20 p-3">
          {/* Grupos: barra de seleção (pills) + Editar ao lado */}
          <div className="col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Layers className="h-3.5 w-3.5" /> Grupos deste caderno</p>
              <button type="button" onClick={() => setEditandoGrupos((e) => !e)} className={cn('flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium', editandoGrupos ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
                <Pencil className="h-3 w-3" /> {editandoGrupos ? 'Concluir' : 'Editar'}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {builder.itens.map((it) => {
                const m = metaDaModalidade(it.modalidade)
                const Icon = ICONE_MOD[it.modalidade]
                const on = it.id === builder.ativo
                return (
                  <div key={it.id} className="relative">
                    <button type="button" onClick={() => selecionarGrupo(it.id)} title={`${m.nome} · ${m.modelos.find((x) => x.id === it.modelo)?.nome}`}
                      className={cn('flex max-w-[150px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] transition-all', on ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'bg-background hover:border-primary/50')}>
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate font-medium">{it.ajustes.titulo || m.nome}</span>
                    </button>
                    {editandoGrupos && builder.itens.length > 1 && (
                      <button type="button" onClick={() => removerGrupo(it.id)} title="Remover grupo" className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border bg-background text-destructive shadow hover:bg-destructive hover:text-destructive-foreground"><X className="h-3 w-3" /></button>
                    )}
                  </div>
                )
              })}
              <button type="button" onClick={adicionarGrupo} title="Adicionar grupo" className="flex items-center gap-1 rounded-lg border border-dashed px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                <Plus className="h-3.5 w-3.5" /> Grupo
              </button>
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

          {/* Ajustes (2 colunas) */}
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
        </div>

        {/* Direita: prévia A4 do grupo ativo (padding lateral menor) */}
        <div ref={ref} className="scroll-claro min-h-0 overflow-auto bg-[radial-gradient(circle,theme(colors.slate.300)_1px,transparent_1px)] [background-size:18px_18px] px-3 py-5 dark:bg-[radial-gradient(circle,theme(colors.slate.700)_1px,transparent_1px)]">
          <div className="mx-auto" style={{ width: 794 * zoom }}>
            <div style={{ width: 794, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
              <Previa item={ativo} questoes={questoes} />
            </div>
          </div>
        </div>
      </div>

      <ModeloPicker open={pickerOpen} onClose={() => setPickerOpen(false)} atual={{ modalidade: ativo.modalidade, modelo: ativo.modelo }} onSelecionar={onPicker} />
      <BancoPicker open={bancoPickerOpen} onClose={() => setBancoPickerOpen(false)} bancos={bancos} atual={builder.bancoId} onSelecionar={trocarBanco} />
    </div>
  )
}
