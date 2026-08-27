'use client'

import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MarkdownTextarea } from '@/components/admin/markdown-textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Plus, Trash2, ImagePlus, RefreshCw, Database, Search, Check, X, ChevronRight, Undo2, Save, ListChecks, CircleDot, ClipboardList } from 'lucide-react'
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
    // Discursiva — informativos ao aluno (não afetam a correção).
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
    // Discursiva: competências são OPCIONAIS. Sem elas, o backend cria uma "Nota"
    // com a pontuação total da questão (a correção continua sendo por competência).
  })

export type QuestaoFormData = z.infer<typeof questaoSchema>

interface QuestaoFormProps {
  initialData?: Partial<QuestaoFormData>
  /** Sugestões (nomes já cadastrados) para autocomplete — não são uma base fixa. */
  bancasSugestoes?: string[]
  disciplinasSugestoes?: string[]
  assuntosSugestoes?: string[]
  /** Bancos (pastas) disponíveis para armazenar a questão diretamente. */
  bancos?: { id: string; nome: string }[]
  onSubmit: (data: QuestaoFormData) => Promise<{ error?: string } | void>
}

const LETRA = ['A', 'B', 'C', 'D', 'E']

export function QuestaoForm({ initialData, bancasSugestoes = [], disciplinasSugestoes = [], assuntosSugestoes = [], bancos = [], onSubmit }: QuestaoFormProps) {
  const ocultarDiscursiva = useOcultarDiscursiva()
  const [isLoading, setIsLoading] = useState(false)
  const [bancoModal, setBancoModal] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    reset,
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

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'alternativas',
  })

  const { fields: compFields, append: appendComp, remove: removeComp } = useFieldArray({
    control,
    name: 'competencias',
  })

  const tipo = watch('tipo')
  const formato = watch('formato')
  const alternativas = watch('alternativas')
  const imagemUrl = watch('imagem_url')
  const imgInputRef = useRef<HTMLInputElement>(null)
  const [uploadingImg, setUploadingImg] = useState(false)

  // Tipo unificado exibido no seletor: Múltipla escolha · Certo/Errado · Discursiva.
  const tipoUi: 'multipla' | 'certo_errado' | 'discursiva' =
    tipo === 'discursiva' ? 'discursiva' : formato === 'certo_errado' ? 'certo_errado' : 'multipla'
  const ehCE = tipo === 'objetiva' && formato === 'certo_errado'

  const TIPO_LABEL: Record<'multipla' | 'certo_errado' | 'discursiva', string> = {
    multipla: 'Múltipla escolha', certo_errado: 'Certo / Errado', discursiva: 'Discursiva',
  }

  /** A questão já tem conteúdo (enunciado ou alguma alternativa preenchida)? */
  function temConteudo(): boolean {
    const enun = (watch('enunciado') ?? '').trim()
    const alts = watch('alternativas') ?? []
    return enun.length > 0 || alts.some((a) => (a.texto ?? '').trim().length > 0 || (a.comentario ?? '').trim().length > 0)
  }

  /** Troca o tipo — com pop-up de confirmação quando a questão já está montada. */
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
      if (!ok) return
    }
    aplicarTipo(novo)
  }

  function aplicarTipo(novo: 'multipla' | 'certo_errado' | 'discursiva') {
    if (novo === 'discursiva') {
      setValue('tipo', 'discursiva', { shouldDirty: true })
      return
    }
    setValue('tipo', 'objetiva', { shouldDirty: true })
    setValue('formato', novo, { shouldDirty: true })
    const cur = watch('alternativas') ?? []
    if (novo === 'certo_errado') {
      // 2 opções fixas Certo/Errado — mantém os comentários das 2 primeiras alternativas.
      const corretaIdx = cur.findIndex((a) => a.correta)
      replace([
        { texto: 'Certo', correta: corretaIdx <= 0, ordem: 0, comentario: cur[0]?.comentario ?? '' },
        { texto: 'Errado', correta: corretaIdx === 1, ordem: 1, comentario: cur[1]?.comentario ?? '' },
      ])
    } else {
      // Múltipla escolha: se vinha de C/E (Certo/Errado), volta às 5 alternativas em branco.
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

  function desfazer() {
    reset()
    toast.success('Alterações desfeitas.')
  }

  async function onImagemFile(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    setUploadingImg(true)
    try {
      const dataUri = await redimensionarImagem(file)
      const r = await hospedarImagemQuestaoAction(dataUri)
      if (!r.ok || !r.url) { toast.error(r.error ?? 'Falha ao enviar a imagem.'); return }
      setValue('imagem_url', r.url, { shouldDirty: true })
    } catch {
      toast.error('Falha ao processar a imagem.')
    } finally {
      setUploadingImg(false)
    }
  }

  function setCorreta(index: number) {
    fields.forEach((_, i) => {
      setValue(`alternativas.${i}.correta`, i === index)
    })
  }

  async function handleFormSubmit(data: QuestaoFormData) {
    setIsLoading(true)
    try {
      const result = await onSubmit(data)
      if (result?.error) {
        toast.error(result.error)
      }
    } catch (e) {
      // redirect() em server action lança NEXT_REDIRECT — deixar o Next navegar.
      if (e && typeof e === 'object' && 'digest' in e && String((e as { digest?: string }).digest).startsWith('NEXT_REDIRECT')) {
        throw e
      }
      toast.error('Erro ao salvar questão')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
      {/* Barra de ações — fica fixa no topo ao rolar (Desfazer · Cancelar · Salvar). */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/90 px-3 py-2.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/70 sm:px-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          {tipoUi === 'discursiva' ? <ClipboardList className="h-3.5 w-3.5" /> : tipoUi === 'certo_errado' ? <CircleDot className="h-3.5 w-3.5" /> : <ListChecks className="h-3.5 w-3.5" />}
          {TIPO_LABEL[tipoUi]}
          {isDirty && <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">não salvo</span>}
        </span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={desfazer} disabled={!isDirty} title="Desfazer todas as alterações">
            <Undo2 className="mr-1.5 h-4 w-4" /> Desfazer
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => history.back()}>Cancelar</Button>
          <Button type="submit" size="sm" disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Salvar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informações da Questão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div key="tipo" className="space-y-2">
              <Label>Tipo da questão</Label>
              <Select value={tipoUi} onValueChange={(v) => mudarTipo(v as 'multipla' | 'certo_errado' | 'discursiva')}>
                <SelectTrigger className="min-w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="multipla">Múltipla escolha</SelectItem>
                  <SelectItem value="certo_errado">Certo / Errado</SelectItem>
                  {!ocultarDiscursiva && <SelectItem value="discursiva">Discursiva</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            {/* Discursiva — categoria à direita do Tipo (mesma linha), mais larga p/ caber o texto. */}
            {tipo === 'discursiva' && (
              <div key="categoria" className="space-y-2 sm:shrink-0">
                <Label>Categoria</Label>
                <Select defaultValue={initialData?.categoria_discursiva ?? 'Questão discursiva'} onValueChange={(v) => setValue('categoria_discursiva', v as string)}>
                  <SelectTrigger className="w-64 *:data-[slot=select-value]:line-clamp-none *:data-[slot=select-value]:whitespace-nowrap"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Questão discursiva">Questão discursiva</SelectItem>
                    <SelectItem value="Peça judicial">Peça judicial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div key="status" className="space-y-2 sm:ml-auto">
              <Label>Status</Label>
              <Select
                defaultValue={initialData?.status ?? 'rascunho'}
                onValueChange={(v) => setValue('status', v as QuestaoFormData['status'])}
              >
                <SelectTrigger className="min-w-44 capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="publicada">Publicada</SelectItem>
                  <SelectItem value="arquivada">Arquivada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Discursiva — informativos ao aluno (nota + nº de linhas), inline. Não afetam a correção. */}
          {tipo === 'discursiva' && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="font-medium">Nota:</span>
                <Input type="number" step="0.5" min="0" placeholder="10" className="h-8 w-16 text-center" {...register('pontuacao_total')} />
                <span className="text-muted-foreground">pontos</span>
              </div>
              <span className="text-muted-foreground/40">|</span>
              <div className="flex items-center gap-1.5">
                <span className="font-medium">Linhas:</span>
                <span className="text-muted-foreground">máximo</span>
                <Input type="number" step="1" min="0" placeholder="15" className="h-8 w-16 text-center" {...register('linhas')} />
                <span className="text-muted-foreground">linhas</span>
              </div>
              <span className="ml-auto text-xs text-muted-foreground">só informativo — mostrado ao aluno</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="enunciado">Enunciado *</Label>
            <MarkdownTextarea
              id="enunciado"
              placeholder="Digite o enunciado da questão... (selecione um trecho e use a barra para negrito, itálico, etc.)"
              rows={5}
              {...register('enunciado')}
              aria-invalid={!!errors.enunciado}
            />
            {errors.enunciado && (
              <p className="text-sm text-destructive">{errors.enunciado.message}</p>
            )}
          </div>

          {/* Imagem da questão (opcional) — exibida na prova entre o enunciado e as alternativas. */}
          <div className="space-y-2">
            <Label>Imagem (opcional)</Label>
            <p className="text-xs text-muted-foreground">Aparece na prova <strong>entre o enunciado e as alternativas</strong>. Só é exibida nas questões que têm imagem.</p>
            <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onImagemFile(e.target.files?.[0] ?? null)} />
            {imagemUrl ? (
              <div className="space-y-2">
                <div className="overflow-hidden rounded-lg border bg-muted/30 p-2">
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
              <button type="button" onClick={() => imgInputRef.current?.click()} disabled={uploadingImg}
                className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60">
                {uploadingImg ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
                <span className="text-sm font-medium">{uploadingImg ? 'Enviando…' : 'Adicionar imagem'}</span>
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Metadados</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="banca">Banca</Label>
            <Input
              id="banca"
              list="bancas-sugestoes"
              placeholder="Digite ou selecione"
              {...register('banca')}
            />
            <datalist id="bancas-sugestoes">
              {bancasSugestoes.map((nome) => (
                <option key={nome} value={nome} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ano">Ano</Label>
            <Input
              id="ano"
              type="number"
              placeholder="Ex: 2024"
              {...register('ano')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="disciplina">Disciplina</Label>
            <Input
              id="disciplina"
              list="disciplinas-sugestoes"
              placeholder="Digite ou selecione"
              {...register('disciplina')}
            />
            <datalist id="disciplinas-sugestoes">
              {disciplinasSugestoes.map((nome) => (
                <option key={nome} value={nome} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assunto">Assunto</Label>
            <Input
              id="assunto"
              list="assuntos-sugestoes"
              placeholder="Digite ou selecione"
              {...register('assunto')}
            />
            <datalist id="assuntos-sugestoes">
              {assuntosSugestoes.map((nome) => (
                <option key={nome} value={nome} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assunto_detalhe">Assunto específico</Label>
            <Input
              id="assunto_detalhe"
              placeholder="Detalhe do assunto (ex.: importado)"
              {...register('assunto_detalhe')}
            />
          </div>

          <div className="space-y-2">
            <Label>Dificuldade</Label>
            <Select
              defaultValue={initialData?.nivel_dificuldade ?? ''}
              onValueChange={(v) => setValue('nivel_dificuldade', v as QuestaoFormData['nivel_dificuldade'])}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="facil">Fácil</SelectItem>
                <SelectItem value="medio">Médio</SelectItem>
                <SelectItem value="dificil">Difícil</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tipo de Gabarito</Label>
            <Select
              defaultValue={initialData?.gabarito_tipo ?? 'oficial'}
              onValueChange={(v) => setValue('gabarito_tipo', v as QuestaoFormData['gabarito_tipo'])}
            >
              <SelectTrigger className="capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oficial">Oficial</SelectItem>
                <SelectItem value="extraoficial">Extraoficial</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {bancos.length > 0 && (() => {
        const selecionados = (watch('bancoIds') ?? []) as string[]
        const sel = bancos.filter((b) => selecionados.includes(b.id))
        return (
          <Card>
            <CardHeader>
              <CardTitle>Banco(s) de destino</CardTitle>
              <p className="text-sm text-muted-foreground">
                Armazene esta questão diretamente em um ou mais bancos. Pode ficar em vários.
              </p>
            </CardHeader>
            <CardContent>
              {/* Card clicável → abre o pop-up de seleção. */}
              <button
                type="button"
                onClick={() => setBancoModal(true)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:border-primary hover:bg-muted/40"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {sel.length === 0 ? (
                    <span className="text-sm text-muted-foreground">Nenhum banco selecionado — clique para escolher</span>
                  ) : (
                    sel.map((b) => (
                      <span key={b.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                        <Database className="h-3 w-3" /> {b.nome}
                      </span>
                    ))
                  )}
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  {sel.length > 0 && <span className="tabular-nums">{sel.length}</span>}
                  <ChevronRight className="h-4 w-4" />
                </span>
              </button>
            </CardContent>
          </Card>
        )
      })()}

      {bancoModal && (
        <SelecionarBancosModal
          bancos={bancos}
          selecionadosIniciais={(watch('bancoIds') ?? []) as string[]}
          onClose={() => setBancoModal(false)}
          onSalvar={(ids) => { setValue('bancoIds', ids, { shouldDirty: true }); setBancoModal(false) }}
        />
      )}

      {/* CERTO / ERRADO — 2 opções fixas (Certo, Errado), marca a correta + comentário por opção. */}
      {ehCE && (
        <Card>
          <CardHeader>
            <CardTitle>Gabarito — Certo / Errado</CardTitle>
            <p className="text-sm text-muted-foreground">Marque a resposta correta. O comentário de cada opção entra no gabarito comentado.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.slice(0, 2).map((field, index) => {
              const isCerto = index === 0
              const correta = !!alternativas?.[index]?.correta
              return (
                <div key={field.id} className="space-y-2 rounded-xl border bg-muted/20 p-3">
                  {/* texto fixo (Certo/Errado) via input oculto — garante o valor no submit */}
                  <input type="hidden" defaultValue={isCerto ? 'Certo' : 'Errado'} {...register(`alternativas.${index}.texto`)} />
                  <button
                    type="button"
                    onClick={() => setCorreta(index)}
                    className={cn('flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition-colors',
                      correta
                        ? isCerto ? 'border-emerald-500 bg-emerald-500/10' : 'border-rose-500 bg-rose-500/10'
                        : 'border-border hover:border-primary')}
                  >
                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
                      correta
                        ? isCerto ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-rose-600 bg-rose-600 text-white'
                        : 'border-muted-foreground/40 text-muted-foreground')}>
                      {correta ? <Check className="h-4 w-4" /> : isCerto ? 'C' : 'E'}
                    </span>
                    <span className="text-sm font-semibold">{isCerto ? 'Certo' : 'Errado'}</span>
                    {correta && <span className="ml-auto text-xs font-medium text-muted-foreground">resposta correta</span>}
                  </button>
                  <div className="pl-9">
                    <Label className="mb-1 block text-xs text-muted-foreground">Comentário desta opção (gabarito)</Label>
                    <MarkdownTextarea
                      previewInline
                      placeholder="Por que a resposta é essa (opcional)"
                      rows={2}
                      defaultValue={(field as { comentario?: string }).comentario ?? ''}
                      {...register(`alternativas.${index}.comentario`)}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* MÚLTIPLA ESCOLHA — alternativas A–E editáveis + comentário por alternativa. */}
      {tipo === 'objetiva' && !ehCE && (
        <Card>
          <CardHeader>
            <CardTitle>Alternativas</CardTitle>
            <p className="text-sm text-muted-foreground">Escreva as opções, marque a correta pela letra e, se quiser, comente cada uma.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="space-y-2 rounded-xl border bg-muted/20 p-3">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => setCorreta(index)}
                    className={cn('mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
                      alternativas?.[index]?.correta
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-border text-muted-foreground hover:border-primary')}
                    title="Marcar como correta"
                  >
                    {LETRA[index] ?? index + 1}
                  </button>
                  <MarkdownTextarea
                    previewInline
                    placeholder={`Alternativa ${LETRA[index] ?? index + 1}`}
                    rows={2}
                    className="flex-1"
                    defaultValue={(field as { texto?: string }).texto ?? ''}
                    {...register(`alternativas.${index}.texto`)}
                  />
                  {fields.length > 2 && (
                    <Button type="button" variant="ghost" size="icon-sm" className="mt-2 text-destructive hover:text-destructive" onClick={() => remove(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="pl-10">
                  <Label className="mb-1 block text-xs text-muted-foreground">Comentário desta alternativa (gabarito)</Label>
                  <MarkdownTextarea
                    previewInline
                    placeholder="Por que esta alternativa está correta/incorreta (opcional)"
                    rows={2}
                    defaultValue={(field as { comentario?: string }).comentario ?? ''}
                    {...register(`alternativas.${index}.comentario`)}
                  />
                </div>
              </div>
            ))}

            {fields.length < 5 && (
              <Button type="button" variant="outline" size="sm" onClick={() => append({ texto: '', correta: false, ordem: fields.length, comentario: '' })}>
                <Plus className="mr-2 h-4 w-4" /> Adicionar alternativa
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {tipo === 'discursiva' && (
        <Card>
          <CardHeader>
            <CardTitle>Competências (critérios de correção) — opcional</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Opcional: detalhe os critérios e a pontuação máxima de cada um (o corretor dá nota por competência).
              Se deixar em branco, a questão usa uma única nota igual à <strong>pontuação total</strong> acima.
            </p>
            {compFields.map((field, index) => (
              <div key={field.id} className="flex items-start gap-3">
                <Input
                  placeholder={`Critério ${index + 1} (ex.: Domínio do tema)`}
                  className="flex-1"
                  {...register(`competencias.${index}.nome`)}
                />
                <div className="w-28 shrink-0">
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="Pontos"
                    {...register(`competencias.${index}.pontos`)}
                  />
                </div>
                {compFields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeComp(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => appendComp({ nome: '', pontos: 1, ordem: compFields.length })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar competência
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Comentário do Professor</CardTitle>
        </CardHeader>
        <CardContent>
          <MarkdownTextarea
            placeholder="Adicione um comentário ou resolução para esta questão..."
            rows={4}
            {...register('comentario_professor')}
          />
        </CardContent>
      </Card>

      {/* Ações ficam na barra fixa do topo (Desfazer · Cancelar · Salvar). */}
    </form>
  )
}

/** Pop-up de seleção dos bancos de destino: busca + lista com marcação, confirma no "Salvar". */
function SelecionarBancosModal({ bancos, selecionadosIniciais, onClose, onSalvar }: {
  bancos: { id: string; nome: string }[]
  selecionadosIniciais: string[]
  onClose: () => void
  onSalvar: (ids: string[]) => void
}) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(selecionadosIniciais))
  const [q, setQ] = useState('')
  const termo = q.trim().toLowerCase()
  const lista = termo ? bancos.filter((b) => b.nome.toLowerCase().includes(termo)) : bancos
  const toggle = (id: string) => setSel((prev) => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Database className="h-4 w-4" /> Banco(s) de destino</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar banco…" className="pl-9" autoFocus />
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-auto p-3">
          {lista.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">Nenhum banco encontrado.</p>
          ) : (
            lista.map((b) => {
              const ativo = sel.has(b.id)
              return (
                <button key={b.id} type="button" onClick={() => toggle(b.id)}
                  className={cn('flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors', ativo ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
                  <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border', ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                    {ativo && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.nome}</span>
                </button>
              )
            })
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
          <span className="text-xs text-muted-foreground">{sel.size} selecionado(s)</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
            <button type="button" onClick={() => onSalvar([...sel])} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">Salvar</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
