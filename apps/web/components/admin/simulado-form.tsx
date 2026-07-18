'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const simuladoSchema = z.object({
  titulo: z.string().min(3, 'Título deve ter ao menos 3 caracteres'),
  descricao: z.string().optional(),
  modo_aplicacao: z.enum(['janela_fixa', 'prazo_relativo', 'aberto']),
  data_inicio: z.string().optional(),
  data_fim: z.string().optional(),
  tempo_limite_min: z.coerce.number().optional(),
  metodo_identificacao: z.enum(['email', 'email_cpf', 'email_telefone']).optional(),
  embed_ativo: z.boolean().optional(),
  regras: z
    .object({
      embaralhar_questoes: z.boolean().optional(),
      embaralhar_alternativas: z.boolean().optional(),
      revisao_antes_enviar: z.boolean().optional(),
      retentativas: z.coerce.number().optional(),
      politica_nota: z.enum(['ultima', 'melhor', 'media']).optional(),
      liberar_nota: z.enum(['imediato', 'apos_janela', 'manual']).optional(),
      liberar_gabarito: z.enum(['imediato', 'apos_janela', 'manual']).optional(),
      liberar_caderno: z.enum(['imediato', 'apos_janela', 'manual']).optional(),
      caderno_publico: z.enum(['todos', 'passaporte']).optional(),
      iniciar_atrasado: z.boolean().optional(),
      entrada_antecipada: z.boolean().optional(),
      politica_anulacao: z.enum(['pontua_todos', 'desconsidera']).optional(),
    })
    .optional(),
})

export type SimuladoFormData = z.infer<typeof simuladoSchema>

interface SimuladoFormProps {
  initialData?: Partial<SimuladoFormData>
  onSubmit: (data: SimuladoFormData) => Promise<{ error?: string; ok?: boolean } | void>
}

export function SimuladoForm({ initialData, onSubmit }: SimuladoFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SimuladoFormData>({
    resolver: zodResolver(simuladoSchema),
    defaultValues: {
      modo_aplicacao: 'janela_fixa',
      embed_ativo: false,
      regras: {
        embaralhar_questoes: true,
        embaralhar_alternativas: true,
        revisao_antes_enviar: true,
        retentativas: 1,
        politica_nota: 'ultima',
        liberar_nota: 'imediato',
        liberar_gabarito: 'apos_janela',
        liberar_caderno: 'apos_janela',
        caderno_publico: 'todos',
        iniciar_atrasado: false,
        entrada_antecipada: false,
        politica_anulacao: 'pontua_todos',
      },
      ...initialData,
    },
  })

  const modo = watch('modo_aplicacao')
  const embedAtivo = watch('embed_ativo')

  async function handleFormSubmit(data: SimuladoFormData) {
    setIsLoading(true)
    try {
      const result = await onSubmit(data)
      if (result?.error) {
        toast.error(result.error)
      } else {
        // Edição bem-sucedida (a criação faz redirect e não chega aqui): confirma e recarrega.
        toast.success('Simulado salvo com sucesso')
        router.refresh()
      }
    } catch (e) {
      // redirect() em server action lança NEXT_REDIRECT — deixar o Next navegar.
      if (e && typeof e === 'object' && 'digest' in e && String((e as { digest?: string }).digest).startsWith('NEXT_REDIRECT')) {
        throw e
      }
      toast.error('Erro ao salvar simulado')
    } finally {
      setIsLoading(false)
    }
  }

  // Bloqueou por validação → o usuário precisa saber (senão "clica em salvar e nada acontece").
  function onInvalid() {
    toast.error('Verifique os campos destacados antes de salvar.')
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit, onInvalid)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Informações Gerais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="titulo">Título *</Label>
            <Input
              id="titulo"
              placeholder="Nome do simulado"
              {...register('titulo')}
              aria-invalid={!!errors.titulo}
            />
            {errors.titulo && (
              <p className="text-sm text-destructive">{errors.titulo.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              placeholder="Descrição opcional do simulado..."
              rows={3}
              {...register('descricao')}
            />
          </div>

          <div className="space-y-2">
            <Label>Modo de Aplicação *</Label>
            <Select
              defaultValue={initialData?.modo_aplicacao ?? 'janela_fixa'}
              onValueChange={(v) => setValue('modo_aplicacao', v as SimuladoFormData['modo_aplicacao'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="janela_fixa">Janela Fixa (ex.: 8h–13h com 1000+ simultâneos)</SelectItem>
                <SelectItem value="prazo_relativo">Prazo Relativo (acesso avulso com prazo)</SelectItem>
                <SelectItem value="aberto">Aberto (sempre disponível)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(modo === 'janela_fixa') && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="data_inicio">Data/Hora de Início</Label>
                <Input
                  id="data_inicio"
                  type="datetime-local"
                  {...register('data_inicio')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="data_fim">Data/Hora de Fim</Label>
                <Input
                  id="data_fim"
                  type="datetime-local"
                  {...register('data_fim')}
                />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tempo_limite_min">Tempo Limite (minutos)</Label>
              <Input
                id="tempo_limite_min"
                type="number"
                placeholder="Ex: 300"
                {...register('tempo_limite_min')}
              />
            </div>

            <div className="space-y-2">
              <Label>Método de Identificação</Label>
              <Select
                defaultValue={initialData?.metodo_identificacao ?? 'email'}
                onValueChange={(v) => setValue('metodo_identificacao', v as SimuladoFormData['metodo_identificacao'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Somente E-mail</SelectItem>
                  <SelectItem value="email_cpf">E-mail + CPF</SelectItem>
                  <SelectItem value="email_telefone">E-mail + Telefone</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="embed_ativo"
              checked={embedAtivo}
              onCheckedChange={(v) => setValue('embed_ativo', v)}
            />
            <Label htmlFor="embed_ativo">Habilitar área embedável (iframe/widget)</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regras de Aplicação</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion className="w-full" multiple>
            <AccordionItem value="inicio">
              <AccordionTrigger>Início e janela</AccordionTrigger>
              <AccordionContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <Switch
                    id="entrada_antecipada"
                    defaultChecked={initialData?.regras?.entrada_antecipada ?? false}
                    onCheckedChange={(v) => setValue('regras.entrada_antecipada', v)}
                  />
                  <div>
                    <Label htmlFor="entrada_antecipada">Permitir entrada antecipada (aguardar o início)</Label>
                    <p className="text-xs text-muted-foreground">O aluno pode fazer login antes do horário e fica numa tela de espera com contagem regressiva; o simulado abre sozinho ao chegar a hora — sem gastar tempo de prova. (Só faz efeito no modo Janela Fixa, com data/hora de início.)</p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="embaralhamento">
              <AccordionTrigger>Embaralhamento</AccordionTrigger>
              <AccordionContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch
                    id="embaralhar_questoes"
                    defaultChecked={initialData?.regras?.embaralhar_questoes ?? true}
                    onCheckedChange={(v) => setValue('regras.embaralhar_questoes', v)}
                  />
                  <Label htmlFor="embaralhar_questoes">Embaralhar ordem das questões</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="embaralhar_alternativas"
                    defaultChecked={initialData?.regras?.embaralhar_alternativas ?? true}
                    onCheckedChange={(v) => setValue('regras.embaralhar_alternativas', v)}
                  />
                  <Label htmlFor="embaralhar_alternativas">Embaralhar alternativas</Label>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="retentativas">
              <AccordionTrigger>Retentativas</AccordionTrigger>
              <AccordionContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="retentativas">Número de tentativas permitidas</Label>
                  <Input
                    id="retentativas"
                    type="number"
                    min={1}
                    placeholder="1"
                    {...register('regras.retentativas')}
                    className="max-w-[120px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Política de Nota</Label>
                  <Select
                    defaultValue={initialData?.regras?.politica_nota ?? 'ultima'}
                    onValueChange={(v) => setValue('regras.politica_nota', v as any)}
                  >
                    <SelectTrigger className="max-w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ultima">Última tentativa</SelectItem>
                      <SelectItem value="melhor">Melhor nota</SelectItem>
                      <SelectItem value="media">Média das tentativas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="gabarito">
              <AccordionTrigger>Liberações (nota, gabarito e caderno)</AccordionTrigger>
              <AccordionContent className="space-y-3">
                <div className="space-y-2">
                  <Label>Liberação da nota / desempenho</Label>
                  <Select
                    defaultValue={initialData?.regras?.liberar_nota ?? 'imediato'}
                    onValueChange={(v) => setValue('regras.liberar_nota', v as any)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="imediato">Imediato (ao finalizar)</SelectItem>
                      <SelectItem value="apos_janela">Após encerramento da janela</SelectItem>
                      <SelectItem value="manual">Manual (admin libera)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Liberação de gabarito</Label>
                  <Select
                    defaultValue={initialData?.regras?.liberar_gabarito ?? 'apos_janela'}
                    onValueChange={(v) => setValue('regras.liberar_gabarito', v as any)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="imediato">Imediato (ao finalizar)</SelectItem>
                      <SelectItem value="apos_janela">Após encerramento da janela</SelectItem>
                      <SelectItem value="manual">Manual (admin libera)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Liberação do caderno (PDF)</Label>
                  <Select
                    defaultValue={initialData?.regras?.liberar_caderno ?? 'apos_janela'}
                    onValueChange={(v) => setValue('regras.liberar_caderno', v as any)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="imediato">Imediato (ao finalizar)</SelectItem>
                      <SelectItem value="apos_janela">Após encerramento da janela</SelectItem>
                      <SelectItem value="manual">Manual (admin libera)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Público do caderno</Label>
                  <Select
                    defaultValue={initialData?.regras?.caderno_publico ?? 'todos'}
                    onValueChange={(v) => setValue('regras.caderno_publico', v as any)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os alunos</SelectItem>
                      <SelectItem value="passaporte">Só alunos passaporte</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="outros">
              <AccordionTrigger>Outras Configurações</AccordionTrigger>
              <AccordionContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch
                    id="revisao_antes_enviar"
                    defaultChecked={initialData?.regras?.revisao_antes_enviar ?? true}
                    onCheckedChange={(v) => setValue('regras.revisao_antes_enviar', v)}
                  />
                  <Label htmlFor="revisao_antes_enviar">Tela de revisão antes de enviar</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="iniciar_atrasado"
                    defaultChecked={initialData?.regras?.iniciar_atrasado ?? false}
                    onCheckedChange={(v) => setValue('regras.iniciar_atrasado', v)}
                  />
                  <Label htmlFor="iniciar_atrasado">Permitir iniciar após a hora de início</Label>
                </div>
                <div className="space-y-2">
                  <Label>Política de Anulação</Label>
                  <Select
                    defaultValue={initialData?.regras?.politica_anulacao ?? 'pontua_todos'}
                    onValueChange={(v) => setValue('regras.politica_anulacao', v as any)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pontua_todos">Pontua todos (questão anulada conta para todos)</SelectItem>
                      <SelectItem value="desconsidera">Desconsidera a questão do cálculo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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
            'Salvar Simulado'
          )}
        </Button>
      </div>
    </form>
  )
}
