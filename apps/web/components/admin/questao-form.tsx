'use client'

import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState, useRef } from 'react'
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
import { Separator } from '@/components/ui/separator'
import { Loader2, Plus, Trash2, ImagePlus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { OCULTAR_DISCURSIVA } from '@/lib/flags'
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
})

const competenciaSchema = z.object({
  nome: z.string(),
  pontos: z.coerce.number().min(0),
  ordem: z.number(),
})

const questaoSchema = z
  .object({
    tipo: z.enum(['objetiva', 'discursiva']),
    enunciado: z.string().min(10, 'Enunciado deve ter ao menos 10 caracteres'),
    banca: z.string().optional(),
    orgao: z.string().optional(),
    ano: z.coerce.number().optional(),
    disciplina: z.string().optional(),
    assunto: z.string().optional(),
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
  /** Bancos (pastas) disponíveis para armazenar a questão diretamente. */
  bancos?: { id: string; nome: string }[]
  onSubmit: (data: QuestaoFormData) => Promise<{ error?: string } | void>
}

const LETRA = ['A', 'B', 'C', 'D', 'E']

export function QuestaoForm({ initialData, bancasSugestoes = [], disciplinasSugestoes = [], bancos = [], onSubmit }: QuestaoFormProps) {
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<QuestaoFormData>({
    resolver: zodResolver(questaoSchema),
    defaultValues: {
      tipo: 'objetiva',
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

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'alternativas',
  })

  const { fields: compFields, append: appendComp, remove: removeComp } = useFieldArray({
    control,
    name: 'competencias',
  })

  const tipo = watch('tipo')
  const alternativas = watch('alternativas')
  const imagemUrl = watch('imagem_url')
  const imgInputRef = useRef<HTMLInputElement>(null)
  const [uploadingImg, setUploadingImg] = useState(false)

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
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Informações da Questão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div key="tipo" className="space-y-2">
              <Label>Tipo</Label>
              <Select
                defaultValue={initialData?.tipo ?? 'objetiva'}
                onValueChange={(v) => setValue('tipo', v as 'objetiva' | 'discursiva')}
              >
                <SelectTrigger className="min-w-44 capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="objetiva">Objetiva</SelectItem>
                  {!OCULTAR_DISCURSIVA && <SelectItem value="discursiva">Discursiva</SelectItem>}
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
                    <SelectItem value="Peça jurídica">Peça jurídica</SelectItem>
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

      {bancos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Banco(s) de destino</CardTitle>
            <p className="text-sm text-muted-foreground">
              Armazene esta questão diretamente em um ou mais bancos. Pode ficar em vários.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {bancos.map((banco) => {
                const selecionados = (watch('bancoIds') ?? []) as string[]
                const ativo = selecionados.includes(banco.id)
                return (
                  <button
                    key={banco.id}
                    type="button"
                    onClick={() =>
                      setValue(
                        'bancoIds',
                        ativo ? selecionados.filter((b) => b !== banco.id) : [...selecionados, banco.id],
                        { shouldDirty: true },
                      )
                    }
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      ativo
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground hover:border-primary'
                    }`}
                  >
                    {banco.nome}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {tipo === 'objetiva' && (
        <Card>
          <CardHeader>
            <CardTitle>Alternativas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setCorreta(index)}
                  className={`mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                    alternativas?.[index]?.correta
                      ? 'border-green-600 bg-green-600 text-white'
                      : 'border-border text-muted-foreground hover:border-primary'
                  }`}
                  title="Marcar como correta"
                >
                  {LETRA[index] ?? index + 1}
                </button>
                <MarkdownTextarea
                  previewInline
                  placeholder={`Alternativa ${LETRA[index] ?? index + 1}`}
                  rows={2}
                  className="flex-1"
                  {...register(`alternativas.${index}.texto`)}
                />
                {fields.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mt-2 text-destructive hover:text-destructive"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}

            {fields.length < 5 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({ texto: '', correta: false, ordem: fields.length })
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar alternativa
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

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => history.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            'Salvar Questão'
          )}
        </Button>
      </div>
    </form>
  )
}
