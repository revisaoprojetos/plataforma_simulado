'use client'

// Helpers de edição do editor de Modelos de Caderno — REPLICADOS do construtor (builder.tsx) para
// manter esta área ISOLADA (não importa builder.tsx). Reusam as primitivas puras (edicao-doc, blocks,
// theme) e o upload de imagem dos cadernos.

import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { HexColorField } from '@/components/admin/hex-color-field'
import { FONTES_CADERNO } from '@/lib/caderno-designer/theme'
import { hospedarImagemCadernoAction } from '@/app/admin/cadernos/actions'
import { BLOCKS, getBlockMeta } from '@/lib/caderno-designer/blocks'
import { listarBlocosDoc, camposDoBlocoDoc, type CampoBlocoDoc } from '@/lib/caderno-teste/edicao-doc'
import type { CampoTexto } from '@/lib/caderno-teste/edicao'
import type { CadernoDoc } from '@/lib/caderno-designer/types'
import {
  Loader2, FileUp, X, Plus, ArrowUp, ArrowDown, Pencil, Trash2, Type,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  LayoutTemplate, FileText, Users, BarChart3, Heading, LayoutGrid, StickyNote, ClipboardList,
} from 'lucide-react'

/** Zoom da prévia para caber na largura do painel. */
export function useZoomAjustado(alvoLargura = 794) {
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

export class EditorBoundary extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state: { erro: Error | null } = { erro: null }
  static getDerivedStateFromError(erro: Error) { return { erro } }
  render() {
    if (this.state.erro) return (
      <div className="-m-6 flex h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <div className="max-w-xl rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-destructive">
          <p className="text-sm font-semibold">Ocorreu um erro ao montar o editor.</p>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-left text-xs">{String(this.state.erro?.message ?? this.state.erro)}</pre>
        </div>
        <button type="button" onClick={() => this.setState({ erro: null })} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">Tentar de novo</button>
      </div>
    )
    return this.props.children
  }
}

export const ICONE_TIPO: Record<string, typeof Type> = { cabecalho: LayoutTemplate, nome: FileText, nota: BarChart3, texto: Type, secao: Heading, card: LayoutGrid, desempenho: BarChart3 }

// Blocos que a Estrutura do diagnóstico pode adicionar.
export const BLOCOS_ADD: { tipo: string; label: string; icon: typeof Type; contavel?: boolean; grupo?: 'composto' }[] = [
  { tipo: 'cabecalho', label: 'Cabeçalho', icon: LayoutTemplate },
  { tipo: 'nome', label: 'Nome do aluno', icon: FileText },
  { tipo: 'dados_card', label: 'Dados do estudante', icon: Users },
  { tipo: 'nota', label: 'Nota', icon: BarChart3 },
  { tipo: 'texto', label: 'Texto / parágrafo', icon: Type },
  { tipo: 'card', label: 'Faixa de seção', icon: Heading },
  { tipo: 'fita', label: 'Card com fita', icon: LayoutGrid },
  { tipo: 'card_texto', label: 'Card com texto', icon: StickyNote },
  { tipo: 'disc_individual', label: 'Disciplina individual', icon: LayoutGrid },
  { tipo: 'sug_individual', label: 'Sugestão individual', icon: ClipboardList },
  { tipo: 'pilares', label: 'Desempenho por pilar', icon: BarChart3, contavel: true, grupo: 'composto' },
  { tipo: 'disciplinas', label: 'Por disciplina', icon: Heading, grupo: 'composto' },
  { tipo: 'sugestoes', label: 'Sugestões', icon: ClipboardList, grupo: 'composto' },
  { tipo: 'gabarito', label: 'Gabarito desatualizado', icon: BarChart3, grupo: 'composto' },
]

export function Tog({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function Segment({ label, valor, opcoes, onChange }: { label: string; valor: number; opcoes: number[]; onChange: (n: number) => void }) {
  return (
    <div className="rounded-md border bg-background px-2 py-1.5">
      <div className="mb-1 text-[11px] text-muted-foreground">{label}</div>
      <div className="flex overflow-hidden rounded-md border">
        {opcoes.map((o) => <button key={o} type="button" onClick={() => onChange(o)} className={cn('flex-1 py-1 text-xs', valor === o ? 'bg-primary text-primary-foreground font-semibold' : 'hover:bg-muted')}>{o}</button>)}
      </div>
    </div>
  )
}

export function CampoAltura({ label, valor, onChange }: { label: string; valor: number; onChange: (n: number) => void }) {
  const v = valor || 0
  const clamp = (n: number) => Math.max(0, Math.min(400, Math.round(n) || 0))
  return (
    <div className="rounded-md border bg-background px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          <input type="number" min={0} max={400} value={v} onChange={(e) => onChange(clamp(Number(e.target.value)))} className="w-14 rounded border bg-background px-1.5 py-0.5 text-right text-xs text-foreground" />
          <span className="text-[10px] text-muted-foreground">px</span>
        </div>
      </div>
      <input type="range" min={0} max={400} step={4} value={v} onChange={(e) => onChange(clamp(Number(e.target.value)))} className="w-full accent-primary" />
      <div className="mt-0.5 text-[10px] text-muted-foreground">{v === 0 ? 'Automático' : `${v}px de reserva`}</div>
    </div>
  )
}

export function CampoImagem({ label, valor, onChange }: { label: string; valor: string; onChange: (url: string) => void }) {
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {valor ? <img src={valor} alt="" className="h-full w-full object-cover" /> : (enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />)}
      </button>
      <div className="mt-1 flex gap-1">
        <Button variant="outline" size="sm" className="h-6 flex-1 px-1 text-[11px]" onClick={() => ref.current?.click()} disabled={enviando}>{enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (valor ? 'Trocar' : 'Enviar')}</Button>
        {valor && <Button variant="outline" size="sm" className="h-6 px-1.5 text-[11px] text-destructive" onClick={() => onChange('')} disabled={enviando}><X className="h-3.5 w-3.5" /></Button>}
      </div>
    </div>
  )
}

/** Campo de texto com barra B/I/U que envolve a seleção (markdown). */
export function CampoFormatavel({ campo, onChange }: { campo: CampoTexto; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null)
  function wrap(pre: string, suf: string) {
    const el = ref.current
    const val = campo.valor
    const s = el?.selectionStart ?? val.length
    const e = el?.selectionEnd ?? val.length
    const sel = val.slice(s, e) || 'texto'
    onChange(val.slice(0, s) + pre + sel + suf + val.slice(e))
    requestAnimationFrame(() => { if (!el) return; el.focus(); const p = s + pre.length; try { el.setSelectionRange(p, p + sel.length) } catch { /* ignore */ } })
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
        ? <textarea ref={ref as React.RefObject<HTMLTextAreaElement>} value={campo.valor} placeholder={campo.placeholder} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full resize-y rounded border bg-background px-2 py-1 text-xs leading-snug outline-none focus:border-primary" />
        : <input ref={ref as React.RefObject<HTMLInputElement>} value={campo.valor} placeholder={campo.placeholder} onChange={(e) => onChange(e.target.value)} className="w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:border-primary" />}
    </div>
  )
}

/** Editor de um campo de bloco (texto/cor/fonte/número/toggle/align/select). */
export function CampoBlocoEditor({ campo, onChange }: { campo: CampoBlocoDoc; onChange: (v: unknown) => void }) {
  if (campo.tipo === 'cor') return (
    <div><div className="mb-1 text-[11px] text-muted-foreground">{campo.label}</div><HexColorField value={String(campo.valor || '#000000')} onChange={onChange} /></div>
  )
  if (campo.tipo === 'fonte') return (
    <div>
      <div className="mb-1 text-[11px] text-muted-foreground">{campo.label}</div>
      <select value={String(campo.valor || '')} onChange={(e) => onChange(e.target.value)} className="w-full rounded border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary">
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
  if (campo.tipo === 'align') {
    const cur = campo.valor || 'left'
    return (
      <div>
        <div className="mb-1 text-[11px] text-muted-foreground">{campo.label}</div>
        <div className="flex overflow-hidden rounded-md border">
          {([['left', 'Esq.'], ['center', 'Centro'], ['right', 'Dir.'], ['justify', 'Justif.']] as const).map(([v, lbl]) => (
            <button key={v} type="button" onClick={() => onChange(v)} className={cn('flex-1 py-1 text-[11px]', cur === v ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-muted')}>{lbl}</button>
          ))}
        </div>
      </div>
    )
  }
  if (campo.tipo === 'select') {
    const cur = campo.valor
    return (
      <div>
        <div className="mb-1 text-[11px] text-muted-foreground">{campo.label}</div>
        <div className="flex overflow-hidden rounded-md border">
          {(campo.opcoes ?? []).map((o) => (
            <button key={o.value} type="button" onClick={() => onChange(o.value)} className={cn('flex-1 px-1 py-1 text-[11px]', cur === o.value ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-muted')}>{o.label}</button>
          ))}
        </div>
      </div>
    )
  }
  return <CampoFormatavel campo={{ id: campo.id, label: campo.label, valor: String(campo.valor ?? ''), multiline: true, placeholder: campo.placeholder }} onChange={(v) => onChange(v)} />
}

const CAT_LABEL: Record<string, string> = { conteudo: 'Conteúdo', avaliacao: 'Avaliação', identificacao: 'Identificação', estrutura: 'Estrutura' }
const BLOCOS_NOVOS = new Set<string>(['cabecalho', 'nome-aluno', 'titulo-secao', 'texto-livre', 'card', 'diag-nota', 'diag-disciplina', 'diag-sugestoes'])

/** Painel Estrutura dos modelos doc-backed: listar/reordenar/editar/remover + adicionar da paleta. */
export function DocEstruturaPanel({ doc, onAdd, onMover, onRemover, onEditar }: {
  doc: CadernoDoc
  onAdd: (type: string) => void
  onMover: (id: string, dir: -1 | 1) => void
  onRemover: (id: string) => void
  onEditar: (id: string) => void
}) {
  const itens = listarBlocosDoc(doc)
  const paleta = BLOCKS.filter((b) => BLOCOS_NOVOS.has(b.type))
  const cats = ['conteudo', 'avaliacao', 'identificacao', 'estrutura'] as const
  return (
    <>
      <p className="mb-2 px-1 text-[11px] leading-snug text-muted-foreground">Use as setas para reordenar. Clique no lápis (ou no bloco na prévia) para editar. Adicione novos blocos abaixo.</p>
      <div className="space-y-1">
        {itens.map((e) => {
          const Icon = getBlockMeta(e.type)?.icon ?? Type
          return (
            <div key={e.id} className="group flex items-center gap-1.5 rounded-md border bg-background px-1.5 py-1.5">
              <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-[12px]" title={e.nome}>{e.nome}</span>
              <div className="flex shrink-0 items-center">
                <button type="button" onClick={() => onMover(e.id, -1)} disabled={e.indice === 0} title="Subir" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => onMover(e.id, 1)} disabled={e.indice === e.total - 1} title="Descer" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => onEditar(e.id)} title="Editar bloco" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => onRemover(e.id)} title="Apagar bloco" className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          )
        })}
        {itens.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Sem blocos ainda — adicione abaixo.</p>}
      </div>
      <div className="mt-4 border-t pt-3">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Plus className="mr-1 inline h-3.5 w-3.5" /> Adicionar bloco</p>
        {paleta.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-center text-[11px] leading-snug text-muted-foreground">Paleta em construção — os blocos novos aparecem aqui conforme forem criados.</p>
        ) : cats.map((cat) => {
          const blocos = paleta.filter((b) => b.category === cat)
          if (!blocos.length) return null
          return (
            <div key={cat} className="mt-3 first:mt-0">
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">{CAT_LABEL[cat]}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {blocos.map((b) => {
                  const Icon = b.icon
                  return (
                    <button key={b.type} type="button" onClick={() => onAdd(b.type)} title={b.description ?? b.title}
                      className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-left text-[12px] font-medium transition-colors hover:border-primary/50 hover:bg-primary/5">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" /> <span className="min-w-0 truncate">{b.title}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
