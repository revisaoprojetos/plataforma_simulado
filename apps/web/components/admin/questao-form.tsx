'use client'

import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useReducer, useRef, useState, type ReactNode, type FocusEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Loader2, Plus, Trash2, RefreshCw, ArrowLeft, Undo2, Check, ChevronDown,
  Bold, Italic, List, Link2, Code, Image as ImageIcon, MessageSquare, Database,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { confirmar } from '@/components/ui/confirm-dialog'
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

function BarraMD({ onAplicar }: { onAplicar: (t: MdTipo) => void }) {
  const btns: [MdTipo, ReactNode, string][] = [
    ['bold', <Bold key="b" className="h-3.5 w-3.5" />, 'Negrito'],
    ['italic', <Italic key="i" className="h-3.5 w-3.5" />, 'Itálico'],
    ['ul', <List key="l" className="h-3.5 w-3.5" />, 'Lista'],
    ['link', <Link2 key="k" className="h-3.5 w-3.5" />, 'Link'],
    ['code', <Code key="c" className="h-3.5 w-3.5" />, 'Código'],
  ]
  return (
    <div className="flex items-center gap-0.5">
      {btns.map(([t, icon, title]) => (
        <button key={t} type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={() => onAplicar(t)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          {icon}
        </button>
      ))}
      <span className="ml-1 hidden text-[11px] font-medium text-muted-foreground sm:inline">Markdown</span>
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
  /** Bancos (pastas) de destino + contagem de questões. */
  bancos?: { id: string; nome: string; total?: number }[]
  /** Conteúdo extra da barra lateral (ex.: seletor de etiquetas). */
  sidebarExtra?: ReactNode
  onSubmit: (data: QuestaoFormData) => Promise<{ error?: string } | void>
}

const LETRA = ['A', 'B', 'C', 'D', 'E']
const TA_CLS = 'w-full resize-y rounded-lg border bg-background/50 px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60 focus:ring-1 focus:ring-primary/30'

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

/** <select> nativo estilizado (chevron custom) — mesmo visual do mockup. */
function SelectBox({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full appearance-none rounded-lg border bg-background/50 px-3 pr-8 text-sm text-foreground outline-none transition-colors focus:border-primary/60 focus:ring-1 focus:ring-primary/30">
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
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

  function desfazer() { reset(); toast.success('Alterações desfeitas.') }

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
    <form onSubmit={handleSubmit(handleFormSubmit)}>
      {/* Barra do topo — full-bleed (contra o p-6 do layout) e fixa ao rolar. */}
      <div className="sticky top-0 z-30 -mx-6 -mt-6 mb-5 flex flex-wrap items-center justify-between gap-3 border-b bg-background/85 px-4 py-2.5 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => history.back()} aria-label="Voltar" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-semibold leading-tight">{codigo ? 'Editar questão' : 'Nova questão'}</h1>
              {codigo && <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{codigo}</span>}
              <StatusBadge status={status} />
            </div>
            <p className="text-xs text-muted-foreground">{isDirty ? 'Alterações não salvas' : 'Tudo salvo'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={desfazer} disabled={!isDirty} title="Desfazer todas as alterações">
            <Undo2 className="mr-1.5 h-4 w-4" /> Desfazer
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => history.back()}>Cancelar</Button>
          <Button type="submit" size="sm" disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />} Salvar questão
          </Button>
        </div>
      </div>

      {/* Corpo — conteúdo à esquerda, edição/banco à direita. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {/* ENUNCIADO */}
          <Secao titulo="Enunciado" acao={<BarraMD onAplicar={(t) => aplicarMarkdown(activeTa.current, t)} />}>
            <textarea
              rows={5}
              className={cn(TA_CLS, 'min-h-[7rem]')}
              placeholder="Digite o enunciado da questão… (selecione um trecho e use a barra para negrito, itálico, etc.)"
              onFocus={focar}
              {...register('enunciado')}
              aria-invalid={!!errors.enunciado}
            />
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
            <Secao titulo="Gabarito — Certo / Errado" acao={<BarraMD onAplicar={(t) => aplicarMarkdown(activeTa.current, t)} />}>
              <div className="space-y-3">
                {fields.slice(0, 2).map((field, index) => {
                  const isCerto = index === 0
                  const correta = !!alternativas?.[index]?.correta
                  return (
                    <div key={field.id} className={cn('space-y-2 rounded-xl border p-3 transition-colors', correta ? 'border-primary bg-primary/[0.04]' : 'bg-muted/20')}>
                      <input type="hidden" defaultValue={isCerto ? 'Certo' : 'Errado'} {...register(`alternativas.${index}.texto`)} />
                      <button type="button" onClick={() => setCorreta(index)}
                        className={cn('flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition-colors',
                          correta ? isCerto ? 'border-emerald-500 bg-emerald-500/10' : 'border-rose-500 bg-rose-500/10' : 'border-border hover:border-primary')}>
                        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold',
                          correta ? isCerto ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-rose-600 bg-rose-600 text-white' : 'border-muted-foreground/40 text-muted-foreground')}>
                          {correta ? <Check className="h-4 w-4" /> : isCerto ? 'C' : 'E'}
                        </span>
                        <span className="text-sm font-semibold">{isCerto ? 'Certo' : 'Errado'}</span>
                        {correta && <span className="ml-auto text-xs font-medium text-muted-foreground">resposta correta</span>}
                      </button>
                      <div className="flex items-start gap-2">
                        <MessageSquare className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <textarea rows={2} className={cn(TA_CLS, 'flex-1 text-[13px]')} placeholder="Comentário desta opção — por que a resposta é essa…" onFocus={focar}
                          defaultValue={(field as { comentario?: string }).comentario ?? ''} {...register(`alternativas.${index}.comentario`)} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Secao>
          ) : tipo === 'objetiva' ? (
            <Secao titulo="Alternativas" acao={
              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-muted-foreground sm:inline">clique na letra para marcar a correta</span>
                <BarraMD onAplicar={(t) => aplicarMarkdown(activeTa.current, t)} />
              </div>
            }>
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
                        <textarea rows={2} className={cn(TA_CLS, 'flex-1')} placeholder={`Alternativa ${LETRA[index] ?? index + 1}`} onFocus={focar}
                          defaultValue={(field as { texto?: string }).texto ?? ''} {...register(`alternativas.${index}.texto`)} />
                        {fields.length > 2 && (
                          <Button type="button" variant="ghost" size="icon-sm" className="mt-1 text-destructive hover:text-destructive" onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="flex items-start gap-2 pl-11">
                        <MessageSquare className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <textarea rows={2} className={cn(TA_CLS, 'flex-1 text-[13px]')} placeholder="Comentário da alternativa — por que está certa/errada…" onFocus={focar}
                          defaultValue={(field as { comentario?: string }).comentario ?? ''} {...register(`alternativas.${index}.comentario`)} />
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
          <Secao titulo="Comentário do professor" acao={<BarraMD onAplicar={(t) => aplicarMarkdown(activeTa.current, t)} />}>
            <textarea rows={4} className={TA_CLS} placeholder="Explicação geral da questão (gabarito comentado)…" onFocus={focar} {...register('comentario_professor')} />
            <p className="mt-2 text-xs text-muted-foreground">Exibido ao aluno depois de responder, junto com os comentários por alternativa.</p>
          </Secao>
        </div>

        {/* SIDEBAR — Edição + Banco + extra (etiquetas) */}
        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Secao titulo="Edição">
            <div className="space-y-3.5">
              <Campo label="Tipo">
                <SelectBox value={tipoUi} onChange={(v) => mudarTipo(v as 'multipla' | 'certo_errado' | 'discursiva')}>
                  <option value="multipla">Múltipla escolha</option>
                  <option value="certo_errado">Certo / Errado</option>
                  {!ocultarDiscursiva && <option value="discursiva">Discursiva</option>}
                </SelectBox>
              </Campo>

              {tipo === 'discursiva' && (
                <>
                  <Campo label="Categoria">
                    <SelectBox value={watch('categoria_discursiva') ?? 'Questão discursiva'} onChange={(v) => setValue('categoria_discursiva', v, { shouldDirty: true })}>
                      <option value="Questão discursiva">Questão discursiva</option>
                      <option value="Peça judicial">Peça judicial</option>
                    </SelectBox>
                  </Campo>
                  <div className="grid grid-cols-2 gap-3">
                    <Campo label="Nota (pontos)"><Input type="number" step="0.5" min="0" placeholder="10" {...register('pontuacao_total')} /></Campo>
                    <Campo label="Linhas (máx.)"><Input type="number" step="1" min="0" placeholder="15" {...register('linhas')} /></Campo>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Banca">
                  <SelectBox value={watch('banca') ?? ''} onChange={(v) => setValue('banca', v, { shouldDirty: true })}>
                    <option value="">—</option>
                    {bancasOpts.map((n) => <option key={n} value={n}>{n}</option>)}
                  </SelectBox>
                </Campo>
                <Campo label="Ano">
                  <SelectBox value={String(watch('ano') ?? '')} onChange={(v) => setValue('ano', v ? Number(v) : undefined, { shouldDirty: true })}>
                    <option value="">—</option>
                    {anos.map((y) => <option key={y} value={y}>{y}</option>)}
                  </SelectBox>
                </Campo>
              </div>

              <Campo label="Disciplina">
                <SelectBox value={watch('disciplina') ?? ''} onChange={(v) => setValue('disciplina', v, { shouldDirty: true })}>
                  <option value="">—</option>
                  {discOpts.map((n) => <option key={n} value={n}>{n}</option>)}
                </SelectBox>
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
                  <SelectBox value={watch('gabarito_tipo') ?? 'oficial'} onChange={(v) => setValue('gabarito_tipo', v as 'oficial' | 'extraoficial', { shouldDirty: true })}>
                    <option value="oficial">Oficial</option>
                    <option value="extraoficial">Extraoficial</option>
                  </SelectBox>
                </Campo>
                <Campo label="Status">
                  <SelectBox value={status ?? 'rascunho'} onChange={(v) => setValue('status', v as QuestaoFormData['status'], { shouldDirty: true })}>
                    <option value="rascunho">Rascunho</option>
                    <option value="publicada">Publicada</option>
                    <option value="arquivada">Arquivada</option>
                  </SelectBox>
                </Campo>
              </div>
            </div>
          </Secao>

          {bancos.length > 0 && (
            <Secao titulo="Banco">
              <Campo label="Banco selecionado">
                <SelectBox value={bancoSel} onChange={(v) => setValue('bancoIds', v ? [v] : [], { shouldDirty: true })}>
                  <option value="">Nenhum</option>
                  {bancos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                </SelectBox>
              </Campo>
              {bancoAtual && typeof bancoAtual.total === 'number' && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Database className="h-3.5 w-3.5" />
                  {bancoAtual.total.toLocaleString('pt-BR')} questões neste banco
                </p>
              )}
            </Secao>
          )}

          {sidebarExtra}
        </aside>
      </div>
    </form>
  )
}
