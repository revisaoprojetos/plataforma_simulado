'use client'

import { useForm, useFieldArray, type UseFormRegisterReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useEffect, useReducer, useRef, useState, type ReactNode, type FocusEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Loader2, Plus, Trash2, RefreshCw, ArrowLeft, Undo2, Check, ChevronDown,
  Bold, Italic, List, Link2, Code, Image as ImageIcon, MessageSquare, Database, Eye, Pencil, X, Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { confirmar } from '@/components/ui/confirm-dialog'
import { MarkdownContent } from '@/components/markdown-content'
import { useUnsavedGuard, confirmarDescartarAlteracoes } from '@/components/admin/use-unsaved-guard'
import { useAbreFecha } from '@/lib/use-abre-fecha'
import { useOcultarDiscursiva } from '@/components/auth/can-provider'
import { hospedarImagemQuestaoAction } from '@/app/admin/questoes/actions'

/** Redimensiona a imagem no cliente (máx. 1600px) e devolve um data URL JPEG leve. */
async function redimensionarImagem(file: File, max = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(bitmap, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.9)
}

// ── Markdown: barra única no cabeçalho que aplica no textarea EM FOCO ──────────
type MdTipo = 'bold' | 'italic' | 'ul' | 'link' | 'code'
function aplicarMarkdown(ta: HTMLTextAreaElement | null, tipo: MdTipo) {
  if (!ta) return
  const start = ta.selectionStart ?? 0, end = ta.selectionEnd ?? 0
  const val = ta.value
  const sel = val.slice(start, end)
  let novo = val, ini = start, fim = end
  const envolver = (mark: string, ph: string) => {
    const txt = sel || ph
    novo = val.slice(0, start) + mark + txt + mark + val.slice(end)
    ini = start + mark.length; fim = ini + txt.length
  }
  if (tipo === 'bold') envolver('**', 'negrito')
  else if (tipo === 'italic') envolver('*', 'itálico')
  else if (tipo === 'code') envolver('`', 'código')
  else if (tipo === 'link') { const txt = sel || 'texto'; novo = val.slice(0, start) + `[${txt}](https://)` + val.slice(end); ini = start + 1; fim = ini + txt.length }
  else { const bloco = (sel || 'item').split('\n').map((l) => '- ' + l).join('\n'); novo = val.slice(0, start) + bloco + val.slice(end); ini = start; fim = start + bloco.length }
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(ta, novo)
  ta.dispatchEvent(new Event('input', { bubbles: true }))
  ta.focus()
  requestAnimationFrame(() => ta.setSelectionRange(ini, fim))
}

function BarraMD({ onAplicar, preview, onTogglePreview }: { onAplicar: (t: MdTipo) => void; preview?: boolean; onTogglePreview?: () => void }) {
  const btns: [MdTipo, ReactNode, string][] = [
    ['bold', <Bold key="b" className="h-3.5 w-3.5" />, 'Negrito'],
    ['italic', <Italic key="i" className="h-3.5 w-3.5" />, 'Itálico'],
    ['ul', <List key="l" className="h-3.5 w-3.5" />, 'Lista'],
    ['link', <Link2 key="k" className="h-3.5 w-3.5" />, 'Link'],
    ['code', <Code key="c" className="h-3.5 w-3.5" />, 'Código'],
  ]
  return (
    <div className="flex items-center gap-0.5">
      {!preview && btns.map(([t, icon, title]) => (
        <button key={t} type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={() => onAplicar(t)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          {icon}
        </button>
      ))}
      <span className="mx-1 hidden text-[11px] font-medium text-muted-foreground sm:inline">Markdown</span>
      {onTogglePreview && (
        <>
          <span className="mx-1 h-4 w-px bg-border" />
          <button type="button" onClick={onTogglePreview}
            className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors', preview ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            {preview ? <><Pencil className="h-3.5 w-3.5" /> Editar</> : <><Eye className="h-3.5 w-3.5" /> Prévia</>}
          </button>
        </>
      )}
    </div>
  )
}

/** Textarea que cresce com o conteúdo (sem barra de rolagem nem alça de resize). */
function AutoTextarea({ reg, defaultValue, placeholder, className, onFocus, ariaInvalid }: {
  reg: UseFormRegisterReturn
  defaultValue?: string
  placeholder?: string
  className?: string
  onFocus?: (e: FocusEvent<HTMLTextAreaElement>) => void
  ariaInvalid?: boolean
}) {
  const localRef = useRef<HTMLTextAreaElement | null>(null)
  const ajustar = () => { const el = localRef.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px` }
  useEffect(() => { ajustar() }, [])
  const { ref, onChange, ...rest } = reg
  return (
    <textarea
      ref={(el) => { ref(el); localRef.current = el }}
      defaultValue={defaultValue}
      placeholder={placeholder}
      aria-invalid={ariaInvalid}
      rows={1}
      onChange={(e) => { onChange(e); ajustar() }}
      onFocus={onFocus}
      className={cn('block w-full resize-none overflow-hidden rounded-lg border bg-background/50 px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60 focus:ring-1 focus:ring-primary/30', className)}
      {...rest}
    />
  )
}

/** Prévia do markdown renderizado (usada quando o toggle Prévia está ligado). */
function PreviaMD({ children, className }: { children?: string; className?: string }) {
  const txt = (children ?? '').trim()
  return (
    <div className={cn('rounded-lg border bg-muted/20 px-3 py-2.5 text-sm', className)}>
      {txt ? <MarkdownContent>{txt}</MarkdownContent> : <span className="text-muted-foreground">Nada para pré-visualizar.</span>}
    </div>
  )
}

const alternativaSchema = z.object({
  texto: z.string(),
  correta: z.boolean(),
  ordem: z.number(),
  comentario: z.string().optional(),
})

const competenciaSchema = z.object({
  nome: z.string(),
  pontos: z.coerce.number().min(0),
  ordem: z.number(),
})

const questaoSchema = z
  .object({
    tipo: z.enum(['objetiva', 'discursiva']),
    formato: z.enum(['multipla', 'certo_errado']).optional(),
    enunciado: z.string().min(10, 'Enunciado deve ter ao menos 10 caracteres'),
    banca: z.string().optional(),
    orgao: z.string().optional(),
    ano: z.coerce.number().optional(),
    disciplina: z.string().optional(),
    assunto: z.string().optional(),
    assunto_detalhe: z.string().optional(),
    nivel_dificuldade: z.enum(['facil', 'medio', 'dificil']).optional(),
    gabarito_tipo: z.enum(['oficial', 'extraoficial']).optional(),
    comentario_professor: z.string().optional(),
    status: z.enum(['rascunho', 'publicada', 'arquivada']),
    imagem_url: z.string().optional(),
    pontuacao_total: z.coerce.number().min(0).optional(),
    linhas: z.coerce.number().int().min(0).optional(),
    categoria_discursiva: z.string().optional(),
    alternativas: z.array(alternativaSchema).optional(),
    competencias: z.array(competenciaSchema).optional(),
    bancoIds: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tipo === 'objetiva') {
      const alts = data.alternativas ?? []
      if (alts.filter((a) => a.texto.trim()).length < 2) {
        ctx.addIssue({ code: 'custom', path: ['alternativas'], message: 'Preencha ao menos 2 alternativas.' })
      }
      if (!alts.some((a) => a.correta && a.texto.trim())) {
        ctx.addIssue({ code: 'custom', path: ['alternativas'], message: 'Marque a alternativa correta.' })
      }
    }
  })

export type QuestaoFormData = z.infer<typeof questaoSchema>

interface QuestaoFormProps {
  initialData?: Partial<QuestaoFormData>
  /** Código da questão (ex.: Q-4.812) — mostrado na barra do topo (só na edição). */
  codigo?: string
  bancasSugestoes?: string[]
  disciplinasSugestoes?: string[]
  assuntosSugestoes?: string[]
  /** Bancos (pastas) de destino + contagem de questões + capa/cor para os pôsteres. */
  bancos?: BancoOpt[]
  /** Conteúdo extra da barra lateral (ex.: seletor de etiquetas). */
  sidebarExtra?: ReactNode
  onSubmit: (data: QuestaoFormData) => Promise<{ error?: string } | void>
}

const LETRA = ['A', 'B', 'C', 'D', 'E']

/** Seção padrão da área (rótulo em maiúsculas + ação opcional à direita). */
function Secao({ titulo, acao, children, className }: { titulo: string; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border bg-card p-4 shadow-sm sm:p-5', className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  )
}

/** Rótulo curto de campo da sidebar. */
function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

type Opt = { value: string; label: string; disabled?: boolean }

/**
 * Dropdown custom (substitui o <select> nativo) — menu estilizado com os tokens do tema,
 * check na opção ativa, fecha ao clicar fora / Esc. Mesmo visual do gatilho do mockup.
 */
function SelectMenu({ value, onChange, options, placeholder, ariaLabel }: {
  value: string
  onChange: (v: string) => void
  options: Opt[]
  placeholder?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const { montado, aberto } = useAbreFecha(open, 140)
  const ref = useRef<HTMLDivElement>(null)
  const atual = options.find((o) => o.value === value)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
        className={cn('flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-background/50 px-3 text-left text-sm outline-none transition-colors hover:border-primary/40 focus-visible:border-primary/60 focus-visible:ring-1 focus-visible:ring-primary/30',
          open && 'border-primary/60 ring-1 ring-primary/30')}>
        <span className={cn('truncate', atual?.value ? 'text-foreground' : 'text-muted-foreground')}>{atual?.label ?? placeholder ?? '—'}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {montado && (
        <div role="listbox" className={cn('absolute left-0 right-0 top-[calc(100%+4px)] z-40 max-h-60 origin-top overflow-auto rounded-xl border bg-popover p-1 shadow-lg transition duration-150 ease-out',
          aberto ? 'scale-100 opacity-100 translate-y-0' : 'pointer-events-none -translate-y-1 scale-95 opacity-0')}>
          {options.map((o) => {
            const sel = o.value === value
            return (
              <button key={o.value || '__vazio'} type="button" role="option" aria-selected={sel} disabled={o.disabled}
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-40',
                  sel ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted')}>
                <span className="truncate">{o.label}</span>
                {sel && <Check className="h-4 w-4 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

type BancoOpt = { id: string; nome: string; total?: number; cor?: string | null; icone?: string | null; capa?: string | null }

/** Miniatura pôster do banco (capa ou degradê da cor) — usada no gatilho da sidebar. */
function PosterMini({ banco }: { banco: BancoOpt }) {
  const c = banco.cor ?? '#6d28d9'
  return (
    <span className="relative h-12 w-10 shrink-0 overflow-hidden rounded-lg border">
      {banco.capa ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={banco.capa} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />
      )}
    </span>
  )
}

/** Card pôster selecionável dentro do modal de escolha do banco. */
function PosterEscolha({ banco, ativo, onClick, nenhum }: { banco?: BancoOpt; ativo: boolean; onClick: () => void; nenhum?: boolean }) {
  const c = banco?.cor ?? '#6d28d9'
  return (
    <button type="button" onClick={onClick}
      className={cn('group relative aspect-[4/5] overflow-hidden rounded-xl border text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
        ativo && 'ring-2 ring-primary ring-offset-2 ring-offset-card')}>
      {nenhum ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-muted/40 text-muted-foreground">
          <Database className="h-6 w-6" /><span className="text-xs font-medium">Nenhum</span>
        </span>
      ) : banco?.capa ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={banco.capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <span className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />
      )}
      {!nenhum && (
        <>
          <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
          <span className="absolute inset-x-0 bottom-0 p-2">
            <span className="line-clamp-2 text-xs font-bold leading-tight text-white drop-shadow-sm">{banco!.nome}</span>
            {typeof banco!.total === 'number' && <span className="mt-1 block text-[10px] text-white/80">{banco!.total.toLocaleString('pt-BR')} questões</span>}
          </span>
        </>
      )}
      {ativo && <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"><Check className="h-3 w-3" /></span>}
    </button>
  )
}

/** Modal de seleção do banco (grade de pôsteres com capa + nome + botão Salvar). */
function BancoModal({ open, bancos, selecionadoId, onSalvar, onClose }: {
  open: boolean
  bancos: BancoOpt[]
  selecionadoId: string
  onSalvar: (id: string) => void
  onClose: () => void
}) {
  const { montado, aberto } = useAbreFecha(open, 200)
  const [sel, setSel] = useState(selecionadoId)
  const [busca, setBusca] = useState('')
  useEffect(() => { if (open) { setSel(selecionadoId); setBusca('') } }, [open, selecionadoId])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!montado) return null
  const q = busca.trim().toLowerCase()
  const filtrados = q ? bancos.filter((b) => b.nome.toLowerCase().includes(q)) : bancos
  const nomeSel = bancos.find((b) => b.id === sel)?.nome
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className={cn('absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200', aberto ? 'opacity-100' : 'opacity-0')} onClick={onClose} />
      <div role="dialog" aria-modal="true" className={cn('relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl transition-all duration-200 ease-out',
        aberto ? 'scale-100 opacity-100 translate-y-0' : 'translate-y-2 scale-95 opacity-0')}>
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Database className="h-4 w-4" /> Selecionar banco</h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="border-b px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar banco…" className="pl-8" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            <PosterEscolha nenhum ativo={sel === ''} onClick={() => setSel('')} />
            {filtrados.map((b) => <PosterEscolha key={b.id} banco={b} ativo={sel === b.id} onClick={() => setSel(b.id)} />)}
          </div>
          {filtrados.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum banco encontrado.</p>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t px-5 py-3.5">
          <p className="truncate text-xs text-muted-foreground">{sel ? nomeSel : 'Nenhum banco'}</p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button type="button" size="sm" onClick={() => onSalvar(sel)}><Check className="mr-1.5 h-4 w-4" /> Salvar</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function StatusBadge({ status }: { status?: string }) {
  const cfg = status === 'publicada'
    ? { label: 'Ativa', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' }
    : status === 'arquivada'
      ? { label: 'Arquivada', cls: 'bg-muted text-muted-foreground' }
      : { label: 'Rascunho', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' }
  return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', cfg.cls)}>{cfg.label}</span>
}

export function QuestaoForm({ initialData, codigo, bancasSugestoes = [], disciplinasSugestoes = [], assuntosSugestoes = [], bancos = [], sidebarExtra, onSubmit }: QuestaoFormProps) {
  const ocultarDiscursiva = useOcultarDiscursiva()
  const [isLoading, setIsLoading] = useState(false)
  const [, forcar] = useReducer((x: number) => x + 1, 0) // força re-render (reverte o <select> Tipo ao cancelar)
  const activeTa = useRef<HTMLTextAreaElement | null>(null)
  const focar = (e: FocusEvent<HTMLTextAreaElement>) => { activeTa.current = e.currentTarget }
  const formRef = useRef<HTMLFormElement>(null)
  // Prévia (markdown renderizado) por seção.
  const [prevEnun, setPrevEnun] = useState(false)
  const [prevAlts, setPrevAlts] = useState(false)
  const [prevProf, setPrevProf] = useState(false)
  // Reajusta a altura de todas as caixas (ex.: depois de Desfazer, quando os valores mudam sem digitar).
  const reajustarCaixas = () => requestAnimationFrame(() => formRef.current?.querySelectorAll('textarea').forEach((t) => { t.style.height = 'auto'; t.style.height = `${t.scrollHeight + 2}px` }))

  const [bancoModal, setBancoModal] = useState(false)

  const {
    register, handleSubmit, watch, setValue, control, reset,
    formState: { errors, isDirty },
  } = useForm<QuestaoFormData>({
    resolver: zodResolver(questaoSchema),
    defaultValues: {
      tipo: 'objetiva',
      formato: 'multipla',
      status: 'rascunho',
      alternativas: [
        { texto: '', correta: false, ordem: 0 },
        { texto: '', correta: false, ordem: 1 },
        { texto: '', correta: false, ordem: 2 },
        { texto: '', correta: false, ordem: 3 },
        { texto: '', correta: true, ordem: 4 },
      ],
      competencias: [{ nome: '', pontos: 1, ordem: 0 }],
      categoria_discursiva: 'questao',
      ...initialData,
    },
  })

  const { fields, append, remove, replace } = useFieldArray({ control, name: 'alternativas' })
  const { fields: compFields, append: appendComp, remove: removeComp } = useFieldArray({ control, name: 'competencias' })

  const tipo = watch('tipo')
  const formato = watch('formato')
  const alternativas = watch('alternativas')
  const status = watch('status')
  const dificuldade = watch('nivel_dificuldade')
  const imagemUrl = watch('imagem_url')
  const bancoSel = (watch('bancoIds') ?? [])[0] ?? ''
  const imgInputRef = useRef<HTMLInputElement>(null)
  const [uploadingImg, setUploadingImg] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const tipoUi: 'multipla' | 'certo_errado' | 'discursiva' =
    tipo === 'discursiva' ? 'discursiva' : formato === 'certo_errado' ? 'certo_errado' : 'multipla'
  const ehCE = tipo === 'objetiva' && formato === 'certo_errado'

  const anoAtual = new Date().getFullYear()
  const anos = Array.from({ length: anoAtual + 2 - 1999 }, (_, i) => anoAtual + 1 - i)
  const bancasOpts = [...new Set([watch('banca'), ...bancasSugestoes].filter(Boolean) as string[])]
  const discOpts = [...new Set([watch('disciplina'), ...disciplinasSugestoes].filter(Boolean) as string[])]
  const bancoAtual = bancos.find((b) => b.id === bancoSel)

  async function onImagemFile(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    setUploadingImg(true)
    try {
      const dataUri = await redimensionarImagem(file)
      const r = await hospedarImagemQuestaoAction(dataUri)
      if (!r.ok || !r.url) { toast.error(r.error ?? 'Falha ao enviar a imagem.'); return }
      setValue('imagem_url', r.url, { shouldDirty: true })
    } catch { toast.error('Falha ao processar a imagem.') } finally { setUploadingImg(false) }
  }

  function setCorreta(index: number) {
    fields.forEach((_, i) => setValue(`alternativas.${i}.correta`, i === index, { shouldDirty: true }))
  }

  function temConteudo(): boolean {
    const enun = (watch('enunciado') ?? '').trim()
    const alts = watch('alternativas') ?? []
    return enun.length > 0 || alts.some((a) => (a.texto ?? '').trim().length > 0 || (a.comentario ?? '').trim().length > 0)
  }

  async function mudarTipo(novo: 'multipla' | 'certo_errado' | 'discursiva') {
    if (novo === tipoUi) return
    if (temConteudo()) {
      const ok = await confirmar({
        titulo: 'Trocar o tipo da questão?',
        mensagem: novo === 'discursiva'
          ? 'A questão passará a ser discursiva. As alternativas cadastradas deixam de ser usadas. Deseja continuar?'
          : 'As alternativas serão reorganizadas para o novo formato. Os comentários das duas primeiras são mantidos. Deseja continuar?',
        confirmar: 'Trocar tipo',
      })
      if (!ok) { forcar(); return } // reverte o <select> ao valor atual
    }
    aplicarTipo(novo)
  }

  function aplicarTipo(novo: 'multipla' | 'certo_errado' | 'discursiva') {
    if (novo === 'discursiva') { setValue('tipo', 'discursiva', { shouldDirty: true }); return }
    setValue('tipo', 'objetiva', { shouldDirty: true })
    setValue('formato', novo, { shouldDirty: true })
    const cur = watch('alternativas') ?? []
    if (novo === 'certo_errado') {
      const corretaIdx = cur.findIndex((a) => a.correta)
      replace([
        { texto: 'Certo', correta: corretaIdx <= 0, ordem: 0, comentario: cur[0]?.comentario ?? '' },
        { texto: 'Errado', correta: corretaIdx === 1, ordem: 1, comentario: cur[1]?.comentario ?? '' },
      ])
    } else {
      const eraCE = cur.length === 2 && /^certo$/i.test((cur[0]?.texto ?? '').trim()) && /^errado$/i.test((cur[1]?.texto ?? '').trim())
      if (eraCE) {
        replace([
          { texto: '', correta: false, ordem: 0, comentario: cur[0]?.comentario ?? '' },
          { texto: '', correta: false, ordem: 1, comentario: cur[1]?.comentario ?? '' },
          { texto: '', correta: false, ordem: 2, comentario: '' },
          { texto: '', correta: false, ordem: 3, comentario: '' },
          { texto: '', correta: true, ordem: 4, comentario: '' },
        ])
      }
    }
  }

  function desfazer() { reset(); setPrevEnun(false); setPrevAlts(false); setPrevProf(false); reajustarCaixas(); toast.success('Alterações desfeitas.') }

  // Guarda edições não salvas (F5/fechar aba + navegação por link do menu → pop-up de confirmação).
  useUnsavedGuard(isDirty)
  // Saídas que não passam por um <a> (voltar/cancelar): confirma descartar antes de sair.
  async function sair() { if (await confirmarDescartarAlteracoes()) history.back() }

  async function handleFormSubmit(data: QuestaoFormData) {
    setIsLoading(true)
    try {
      const result = await onSubmit(data)
      if (result?.error) toast.error(result.error)
    } catch (e) {
      if (e && typeof e === 'object' && 'digest' in e && String((e as { digest?: string }).digest).startsWith('NEXT_REDIRECT')) throw e
      toast.error('Erro ao salvar questão')
    } finally { setIsLoading(false) }
  }

  return (
    // -m-6 cancela o p-6 do <main> → a top bar cola RENTE ao topo (sem margem negativa no
    // elemento sticky, que causava vão) e alinha com o cabeçalho da sidebar (h-14).
    <form ref={formRef} onSubmit={handleSubmit(handleFormSubmit)} className="-m-6">
      <div className="sticky -top-6 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={sair} aria-label="Voltar" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold leading-tight">{codigo ? 'Editar questão' : 'Nova questão'}</h1>
            {codigo && <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{codigo}</span>}
            <StatusBadge status={status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Status de salvamento — mesmo padrão da área de gamificação (ponto + rótulo). */}
          <span className={cn('mr-0.5 hidden items-center gap-1.5 text-xs font-medium sm:inline-flex', isDirty ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
            <span className={cn('h-1.5 w-1.5 rounded-full', isDirty ? 'bg-amber-500' : 'bg-emerald-500')} />
            {isDirty ? 'Não salvo' : 'Salvo'}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={desfazer} disabled={!isDirty} title="Desfazer todas as alterações">
            <Undo2 className="mr-1.5 h-4 w-4" /> Desfazer
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={sair}>Cancelar</Button>
          <Button type="submit" size="sm" disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />} Salvar questão
          </Button>
        </div>
      </div>

      {/* Corpo — conteúdo à esquerda, edição/banco à direita. Padding restaurado aqui (form tem -m-6). */}
      <div className="grid gap-5 p-4 pt-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {/* ENUNCIADO */}
          <Secao titulo="Enunciado" acao={<BarraMD onAplicar={(t) => aplicarMarkdown(activeTa.current, t)} preview={prevEnun} onTogglePreview={() => setPrevEnun((v) => !v)} />}>
            {prevEnun ? (
              <PreviaMD className="min-h-[7rem]">{watch('enunciado')}</PreviaMD>
            ) : (
              <AutoTextarea
                reg={register('enunciado')}
                className="min-h-[7rem]"
                placeholder="Digite o enunciado da questão… (selecione um trecho e use a barra para negrito, itálico, etc.)"
                onFocus={focar}
                ariaInvalid={!!errors.enunciado}
              />
            )}
            {errors.enunciado && <p className="mt-1.5 text-sm text-destructive">{errors.enunciado.message}</p>}

            {/* Imagem de apoio */}
            <p className="mb-2 mt-4 text-xs text-muted-foreground">Imagem de apoio (opcional) — arraste ou clique para importar</p>
            <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onImagemFile(e.target.files?.[0] ?? null)} />
            {imagemUrl ? (
              <div className="space-y-2">
                <div className="overflow-hidden rounded-xl border bg-muted/30 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagemUrl} alt="Imagem da questão" className="mx-auto max-h-80 w-auto object-contain" />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => imgInputRef.current?.click()} disabled={uploadingImg}>
                    {uploadingImg ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Trocar
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setValue('imagem_url', '', { shouldDirty: true })}>
                    <Trash2 className="mr-2 h-4 w-4" /> Remover
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); onImagemFile(e.dataTransfer.files?.[0] ?? null) }}
                onClick={() => imgInputRef.current?.click()}
                className={cn('flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-10 text-center transition-colors',
                  dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50')}
              >
                {uploadingImg ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
                <p className="text-sm text-muted-foreground">{uploadingImg ? 'Enviando…' : 'Solte a imagem da questão aqui'}</p>
                {!uploadingImg && <p className="text-xs text-muted-foreground">ou <span className="font-medium text-primary underline">selecionar arquivo</span></p>}
              </div>
            )}
          </Secao>

          {/* ALTERNATIVAS (múltipla) ou GABARITO (certo/errado) */}
          {ehCE ? (
            <Secao titulo="Gabarito — Certo / Errado" acao={<BarraMD onAplicar={(t) => aplicarMarkdown(activeTa.current, t)} preview={prevAlts} onTogglePreview={() => setPrevAlts((v) => !v)} />}>
              <div className="space-y-3">
                {fields.slice(0, 2).map((field, index) => {
                  const isCerto = index === 0
                  const correta = !!alternativas?.[index]?.correta
                  return (
                    <div key={field.id} className={cn('space-y-2 rounded-xl border p-3 transition-colors', correta ? 'border-primary bg-primary/[0.04]' : 'bg-muted/20')}>
                      <input type="hidden" defaultValue={isCerto ? 'Certo' : 'Errado'} {...register(`alternativas.${index}.texto`)} />
                      <button type="button" onClick={() => setCorreta(index)}
                        className={cn('flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition-colors',
                          correta ? 'border-emerald-500 bg-emerald-500/10' : 'border-border hover:border-primary')}>
                        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold',
                          correta ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-muted-foreground/40 text-muted-foreground')}>
                          {correta ? <Check className="h-4 w-4" /> : isCerto ? 'C' : 'E'}
                        </span>
                        <span className="text-sm font-semibold">{isCerto ? 'Certo' : 'Errado'}</span>
                        {correta && <span className="ml-auto text-xs font-medium text-muted-foreground">resposta correta</span>}
                      </button>
                      <div className="flex items-start gap-2">
                        <MessageSquare className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        {prevAlts ? (
                          <PreviaMD className="flex-1">{alternativas?.[index]?.comentario}</PreviaMD>
                        ) : (
                          <AutoTextarea reg={register(`alternativas.${index}.comentario`)} className="flex-1 text-[13px]" placeholder="Comentário desta opção — por que a resposta é essa…" onFocus={focar}
                            defaultValue={(field as { comentario?: string }).comentario ?? ''} />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Secao>
          ) : tipo === 'objetiva' ? (
            <Secao titulo="Alternativas" acao={<BarraMD onAplicar={(t) => aplicarMarkdown(activeTa.current, t)} preview={prevAlts} onTogglePreview={() => setPrevAlts((v) => !v)} />}>
              <div className="space-y-3">
                {fields.map((field, index) => {
                  const correta = !!alternativas?.[index]?.correta
                  return (
                    <div key={field.id} className={cn('space-y-2 rounded-xl border p-3 transition-colors', correta ? 'border-primary bg-primary/[0.04]' : 'bg-muted/20')}>
                      <div className="flex items-start gap-3">
                        <button type="button" onClick={() => setCorreta(index)} title="Marcar como correta"
                          className={cn('mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors',
                            correta ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary')}>
                          {LETRA[index] ?? index + 1}
                        </button>
                        {prevAlts ? (
                          <PreviaMD className="flex-1">{alternativas?.[index]?.texto}</PreviaMD>
                        ) : (
                          <AutoTextarea reg={register(`alternativas.${index}.texto`)} className="flex-1" placeholder={`Alternativa ${LETRA[index] ?? index + 1}`} onFocus={focar}
                            defaultValue={(field as { texto?: string }).texto ?? ''} />
                        )}
                        {fields.length > 2 && !prevAlts && (
                          <Button type="button" variant="ghost" size="icon-sm" className="mt-1 text-destructive hover:text-destructive" onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="flex items-start gap-2 pl-11">
                        <MessageSquare className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        {prevAlts ? (
                          <PreviaMD className="flex-1">{alternativas?.[index]?.comentario}</PreviaMD>
                        ) : (
                          <AutoTextarea reg={register(`alternativas.${index}.comentario`)} className="flex-1 text-[13px]" placeholder="Comentário da alternativa — por que está certa/errada…" onFocus={focar}
                            defaultValue={(field as { comentario?: string }).comentario ?? ''} />
                        )}
                      </div>
                      {correta && <p className="flex items-center gap-1.5 pl-11 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Alternativa correta</p>}
                    </div>
                  )
                })}
                {fields.length < 5 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => append({ texto: '', correta: false, ordem: fields.length, comentario: '' })}>
                    <Plus className="mr-2 h-4 w-4" /> Adicionar alternativa
                  </Button>
                )}
              </div>
            </Secao>
          ) : (
            <Secao titulo="Competências (critérios de correção) — opcional">
              <p className="mb-3 text-sm text-muted-foreground">Detalhe os critérios e a pontuação máxima de cada um. Em branco = uma única nota igual à pontuação total.</p>
              <div className="space-y-3">
                {compFields.map((field, index) => (
                  <div key={field.id} className="flex items-start gap-3">
                    <Input placeholder={`Critério ${index + 1} (ex.: Domínio do tema)`} className="flex-1" {...register(`competencias.${index}.nome`)} />
                    <div className="w-28 shrink-0"><Input type="number" step="0.5" min="0" placeholder="Pontos" {...register(`competencias.${index}.pontos`)} /></div>
                    {compFields.length > 1 && (
                      <Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => removeComp(index)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => appendComp({ nome: '', pontos: 1, ordem: compFields.length })}>
                  <Plus className="mr-2 h-4 w-4" /> Adicionar competência
                </Button>
              </div>
            </Secao>
          )}

          {/* COMENTÁRIO DO PROFESSOR */}
          <Secao titulo="Comentário do professor" acao={<BarraMD onAplicar={(t) => aplicarMarkdown(activeTa.current, t)} preview={prevProf} onTogglePreview={() => setPrevProf((v) => !v)} />}>
            {prevProf ? (
              <PreviaMD className="min-h-[5rem]">{watch('comentario_professor')}</PreviaMD>
            ) : (
              <AutoTextarea reg={register('comentario_professor')} className="min-h-[5rem]" placeholder="Explicação geral da questão (gabarito comentado)…" onFocus={focar} />
            )}
            <p className="mt-2 text-xs text-muted-foreground">Exibido ao aluno depois de responder, junto com os comentários por alternativa.</p>
          </Secao>
        </div>

        {/* SIDEBAR — Edição + Banco + extra (etiquetas) */}
        <aside className="space-y-5 lg:sticky lg:top-14 lg:self-start">
          <Secao titulo="Edição">
            <div className="space-y-3.5">
              <Campo label="Tipo">
                <SelectMenu value={tipoUi} ariaLabel="Tipo" onChange={(v) => mudarTipo(v as 'multipla' | 'certo_errado' | 'discursiva')}
                  options={[
                    { value: 'multipla', label: 'Múltipla escolha' },
                    { value: 'certo_errado', label: 'Certo / Errado' },
                    ...(ocultarDiscursiva ? [] : [{ value: 'discursiva', label: 'Discursiva' }]),
                  ]} />
              </Campo>

              {tipo === 'discursiva' && (
                <>
                  <Campo label="Categoria">
                    <SelectMenu value={watch('categoria_discursiva') ?? 'Questão discursiva'} ariaLabel="Categoria"
                      onChange={(v) => setValue('categoria_discursiva', v, { shouldDirty: true })}
                      options={[{ value: 'Questão discursiva', label: 'Questão discursiva' }, { value: 'Peça judicial', label: 'Peça judicial' }]} />
                  </Campo>
                  <div className="grid grid-cols-2 gap-3">
                    <Campo label="Nota (pontos)"><Input type="number" step="0.5" min="0" placeholder="10" {...register('pontuacao_total')} /></Campo>
                    <Campo label="Linhas (máx.)"><Input type="number" step="1" min="0" placeholder="15" {...register('linhas')} /></Campo>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Banca">
                  <SelectMenu value={watch('banca') ?? ''} ariaLabel="Banca" placeholder="—"
                    onChange={(v) => setValue('banca', v, { shouldDirty: true })}
                    options={[{ value: '', label: '—' }, ...bancasOpts.map((n) => ({ value: n, label: n }))]} />
                </Campo>
                <Campo label="Ano">
                  <SelectMenu value={String(watch('ano') ?? '')} ariaLabel="Ano" placeholder="—"
                    onChange={(v) => setValue('ano', v ? Number(v) : undefined, { shouldDirty: true })}
                    options={[{ value: '', label: '—' }, ...anos.map((y) => ({ value: String(y), label: String(y) }))]} />
                </Campo>
              </div>

              <Campo label="Disciplina">
                <SelectMenu value={watch('disciplina') ?? ''} ariaLabel="Disciplina" placeholder="—"
                  onChange={(v) => setValue('disciplina', v, { shouldDirty: true })}
                  options={[{ value: '', label: '—' }, ...discOpts.map((n) => ({ value: n, label: n }))]} />
              </Campo>

              <Campo label="Assunto">
                <Input list="assuntos-sugestoes" placeholder="Digite ou selecione" {...register('assunto')} />
                <datalist id="assuntos-sugestoes">{assuntosSugestoes.map((n) => <option key={n} value={n} />)}</datalist>
              </Campo>

              <Campo label="Assunto específico">
                <Input placeholder="Detalhe do assunto (ex.: importado)" {...register('assunto_detalhe')} />
              </Campo>

              <Campo label="Dificuldade">
                <div className="flex gap-2">
                  {([['facil', 'Fácil'], ['medio', 'Média'], ['dificil', 'Difícil']] as const).map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setValue('nivel_dificuldade', v, { shouldDirty: true })}
                      className={cn('flex-1 rounded-lg border px-2 py-1.5 text-sm font-medium transition-colors',
                        dificuldade === v ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/50')}>
                      {label}
                    </button>
                  ))}
                </div>
              </Campo>

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Gabarito">
                  <SelectMenu value={watch('gabarito_tipo') ?? 'oficial'} ariaLabel="Gabarito"
                    onChange={(v) => setValue('gabarito_tipo', v as 'oficial' | 'extraoficial', { shouldDirty: true })}
                    options={[{ value: 'oficial', label: 'Oficial' }, { value: 'extraoficial', label: 'Extraoficial' }]} />
                </Campo>
                <Campo label="Status">
                  <SelectMenu value={status ?? 'rascunho'} ariaLabel="Status"
                    onChange={(v) => setValue('status', v as QuestaoFormData['status'], { shouldDirty: true })}
                    options={[{ value: 'rascunho', label: 'Rascunho' }, { value: 'publicada', label: 'Publicada' }, { value: 'arquivada', label: 'Arquivada' }]} />
                </Campo>
              </div>
            </div>
          </Secao>

          {bancos.length > 0 && (
            <Secao titulo="Banco">
              <button type="button" onClick={() => setBancoModal(true)}
                className="flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors hover:border-primary/50">
                {bancoAtual ? (
                  <>
                    <PosterMini banco={bancoAtual} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{bancoAtual.nome}</p>
                      {typeof bancoAtual.total === 'number' && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground"><Database className="h-3 w-3" /> {bancoAtual.total.toLocaleString('pt-BR')} questões</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <span className="flex h-12 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed text-muted-foreground"><Database className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-muted-foreground">Nenhum banco selecionado</p>
                      <p className="text-xs text-muted-foreground">Clique para escolher</p>
                    </div>
                  </>
                )}
                <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground" />
              </button>
            </Secao>
          )}

          {sidebarExtra}
        </aside>
      </div>

      <BancoModal
        open={bancoModal}
        bancos={bancos}
        selecionadoId={bancoSel}
        onSalvar={(id) => { setValue('bancoIds', id ? [id] : [], { shouldDirty: true }); setBancoModal(false) }}
        onClose={() => setBancoModal(false)}
      />
    </form>
  )
}
