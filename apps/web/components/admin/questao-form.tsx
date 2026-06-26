'use client'

import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

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
    alternativas: z.array(alternativaSchema).optional(),
    competencias: z.array(competenciaSchema).optional(),
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
    } else if (data.tipo === 'discursiva') {
      if ((data.competencias ?? []).filter((c) => c.nome.trim()).length < 1) {
        ctx.addIssue({ code: 'custom', path: ['competencias'], message: 'Adicione ao menos 1 competência.' })
      }
    }
  })

export type QuestaoFormData = z.infer<typeof questaoSchema>

interface QuestaoFormProps {
  initialData?: Partial<QuestaoFormData>
  /** Sugestões (nomes já cadastrados) para autocomplete — não são uma base fixa. */
  bancasSugestoes?: string[]
  disciplinasSugestoes?: string[]
  onSubmit: (data: QuestaoFormData) => Promise<{ error?: string } | void>
}

const LETRA = ['A', 'B', 'C', 'D', 'E']

export function QuestaoForm({ initialData, bancasSugestoes = [], disciplinasSugestoes = [], onSubmit }: QuestaoFormProps) {
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                defaultValue={initialData?.tipo ?? 'objetiva'}
                onValueChange={(v) => setValue('tipo', v as 'objetiva' | 'discursiva')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="objetiva">Objetiva</SelectItem>
                  <SelectItem value="discursiva">Discursiva</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                defaultValue={initialData?.status ?? 'rascunho'}
                onValueChange={(v) => setValue('status', v as QuestaoFormData['status'])}
              >
                <SelectTrigger>
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

          <div className="space-y-2">
            <Label htmlFor="enunciado">Enunciado *</Label>
            <Textarea
              id="enunciado"
              placeholder="Digite o enunciado da questão..."
              rows={5}
              {...register('enunciado')}
              aria-invalid={!!errors.enunciado}
            />
            {errors.enunciado && (
              <p className="text-sm text-destructive">{errors.enunciado.message}</p>
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
              <SelectTrigger>
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
                <Textarea
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
            <CardTitle>Competências (critérios de correção)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Defina os critérios e a pontuação máxima de cada um. O corretor dará nota por competência.
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
          <Textarea
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
