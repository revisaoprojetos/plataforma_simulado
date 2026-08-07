'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ChevronLeft, Save, Loader2, Database, FileText, ClipboardList, BarChart3, LayoutTemplate, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { HexColorField } from '@/components/admin/hex-color-field'
import { Previa } from '@/lib/caderno-teste/previa'
import { ModeloPicker } from '@/components/admin/caderno-teste/modelo-picker'
import { metaDaModalidade, builderDeModelo, type BuilderV3, type Modalidade, type PreviewQuestao } from '@/lib/caderno-teste/tipos'
import { salvarBuilderTeste, previewQuestoesBanco } from '@/app/admin/cadernos-teste/actions'

const ICONE_MOD: Record<Modalidade, any> = { caderno_questoes: FileText, folha_respostas: ClipboardList, diagnostico: BarChart3 }

/** Zoom da prévia para caber na largura do painel direito. */
function useZoomAjustado(alvoLargura = 794) {
  const ref = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(0.7)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const calc = () => setZoom(Math.min(1, Math.max(0.35, (el.clientWidth - 48) / alvoLargura)))
    calc()
    const ro = new ResizeObserver(calc); ro.observe(el)
    return () => ro.disconnect()
  }, [alvoLargura])
  return { ref, zoom }
}

export function CadernoTesteBuilder({ cadernoId, builderInicial, bancos, questoesIniciais, abrirPickerInicial = false }: {
  cadernoId: string
  builderInicial: BuilderV3
  bancos: { id: string; nome: string }[]
  questoesIniciais: PreviewQuestao[]
  abrirPickerInicial?: boolean
}) {
  const [builder, setBuilder] = useState<BuilderV3>(builderInicial)
  const [questoes, setQuestoes] = useState<PreviewQuestao[]>(questoesIniciais)
  const [carregandoQ, setCarregandoQ] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(abrirPickerInicial)
  const [pending, start] = useTransition()
  const { ref, zoom } = useZoomAjustado()

  const meta = metaDaModalidade(builder.modalidade)
  const modeloNome = meta.modelos.find((m) => m.id === builder.modelo)?.nome ?? meta.modelos[0].nome
  const IconeMod = ICONE_MOD[builder.modalidade]
  const a = builder.ajustes
  const setAjuste = (patch: Partial<BuilderV3['ajustes']>) => setBuilder((b) => ({ ...b, ajustes: { ...b.ajustes, ...patch } }))

  /** Aplica modalidade+modelo do pop-up preservando título/cores/banco do usuário. */
  function escolherModelo(m: Modalidade, modeloId: string) {
    const base = builderDeModelo(m, modeloId, builder.bancoId)
    setBuilder((b) => ({ ...base, ajustes: { ...base.ajustes, titulo: b.ajustes.titulo, corPrimaria: b.ajustes.corPrimaria, corSecundaria: b.ajustes.corSecundaria } }))
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

  const Tog = ({ campo, label }: { campo: keyof BuilderV3['ajustes']; label: string }) => (
    <label className="flex cursor-pointer items-center justify-between gap-2 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input type="checkbox" checked={!!a[campo]} onChange={(e) => setAjuste({ [campo]: e.target.checked } as any)} />
    </label>
  )
  const Segment = ({ label, valor, opcoes, onChange }: { label: string; valor: number; opcoes: number[]; onChange: (n: number) => void }) => (
    <div className="flex items-center justify-between gap-2 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex overflow-hidden rounded-md border">
        {opcoes.map((o) => <button key={o} type="button" onClick={() => onChange(o)} className={cn('px-2.5 py-1 text-xs', valor === o ? 'bg-primary text-primary-foreground font-semibold' : 'hover:bg-muted')}>{o}</button>)}
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
            <p className="text-xs text-muted-foreground">Escolha o modelo no pop-up e ajuste à esquerda — a prévia atualiza à direita.</p>
          </div>
        </div>
        <Button onClick={salvar} disabled={pending} size="sm">{pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Salvar</Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr]">
        {/* Esquerda: modelo (pop-up) + banco + ajustes */}
        <div className="scroll-claro flex min-h-0 flex-col gap-5 overflow-y-auto border-r bg-muted/20 p-4">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Modelo</p>
            <div className="rounded-xl border bg-background p-3 shadow-sm">
              <div className="flex items-start gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><IconeMod className="h-4.5 w-4.5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight">{meta.nome}</p>
                  <p className="text-[11px] text-muted-foreground">Modelo: {modeloNome}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="mt-2.5 w-full" onClick={() => setPickerOpen(true)}>
                <LayoutTemplate className="mr-1.5 h-4 w-4" /> Escolher modelo
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Database className="h-3.5 w-3.5" /> Banco de questões</p>
            <select value={builder.bancoId ?? ''} onChange={(e) => trocarBanco(e.target.value || null)} className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm shadow-sm">
              <option value="">Nenhum (exemplo)</option>
              {bancos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
            {carregandoQ && <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> carregando questões…</p>}
            {!carregandoQ && builder.bancoId && <p className="mt-1 text-[11px] text-muted-foreground">{questoes.length} questão(ões) na prévia.</p>}
          </div>

          <div className="space-y-1">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Pencil className="h-3.5 w-3.5" /> Ajustes</p>
            <label className="block text-xs text-muted-foreground">
              <span className="mb-1 block">Título</span>
              <input value={a.titulo} onChange={(e) => setAjuste({ titulo: e.target.value })} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm text-foreground" />
            </label>
            <label className="flex items-center justify-between gap-2 py-1 text-sm"><span className="text-muted-foreground">Cor primária</span><HexColorField value={a.corPrimaria} onChange={(v) => setAjuste({ corPrimaria: v })} /></label>
            <label className="flex items-center justify-between gap-2 py-1 text-sm"><span className="text-muted-foreground">Cor secundária</span><HexColorField value={a.corSecundaria} onChange={(v) => setAjuste({ corSecundaria: v })} /></label>
            <Tog campo="mostrarCabecalho" label="Cabeçalho (título)" />
            <Tog campo="mostrarDadosAluno" label="Dados do aluno" />
            {builder.modalidade === 'caderno_questoes' && <>
              <Tog campo="mostrarGabarito" label="Destacar gabarito" />
              <Tog campo="mostrarComentarios" label="Comentários" />
            </>}
            {(builder.modalidade === 'caderno_questoes' || builder.modalidade === 'folha_respostas') && (
              <Segment label="Nº de alternativas" valor={a.numAlternativas} opcoes={[4, 5]} onChange={(n) => setAjuste({ numAlternativas: n })} />
            )}
            {builder.modalidade === 'folha_respostas' && (
              <Segment label="Colunas" valor={a.colunas} opcoes={[2, 3, 4, 5]} onChange={(n) => setAjuste({ colunas: n })} />
            )}
            <Tog campo="compacto" label="Compacto" />
          </div>
        </div>

        {/* Direita: prévia A4 */}
        <div ref={ref} className="scroll-claro min-h-0 overflow-auto bg-[radial-gradient(circle,theme(colors.slate.300)_1px,transparent_1px)] [background-size:18px_18px] p-6 dark:bg-[radial-gradient(circle,theme(colors.slate.700)_1px,transparent_1px)]">
          <div className="mx-auto" style={{ width: 794 * zoom }}>
            <div style={{ width: 794, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
              <Previa builder={builder} questoes={questoes} />
            </div>
          </div>
        </div>
      </div>

      <ModeloPicker open={pickerOpen} onClose={() => setPickerOpen(false)} atual={{ modalidade: builder.modalidade, modelo: builder.modelo }} onSelecionar={escolherModelo} />
    </div>
  )
}
