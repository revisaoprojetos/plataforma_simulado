import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SimuladoForm } from '@/components/admin/simulado-form'
import { SimuladoActions } from '@/components/admin/simulado-actions'
import { updateSimuladoAction } from '../actions'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Link from 'next/link'
import { ChevronLeft, Code } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PageProps {
  params: Promise<{ id: string }>
}

const statusConfig: Record<string, { label: string; class: string }> = {
  rascunho: { label: 'Rascunho', class: 'bg-muted text-muted-foreground' },
  publicado: { label: 'Publicado', class: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  encerrado: { label: 'Encerrado', class: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
}

const sessaoStatusMap: Record<string, string> = {
  aguardando: 'Aguardando',
  em_andamento: 'Em andamento',
  finalizada: 'Finalizada',
}

export default async function SimuladoDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: simulado } = await supabase
    .from('simulados')
    .select('*')
    .eq('id', id)
    .single()

  if (!simulado) {
    notFound()
  }

  const [
    { data: questoes, count: totalQuestoes },
    { data: sessoes, count: totalSessoes },
  ] = await Promise.all([
    supabase
      .from('simulado_questoes')
      .select(`
        id, ordem, peso, anulada,
        questoes(id, enunciado, disciplinas(nome))
      `, { count: 'exact' })
      .eq('simulado_id', id)
      .order('ordem'),
    supabase
      .from('sessoes_prova')
      .select(`
        id, status, nota, iniciado_em, finalizado_em, is_teste,
        estudantes(nome, user_id)
      `, { count: 'exact' })
      .eq('simulado_id', id)
      .order('iniciado_em', { ascending: false })
      .limit(50),
  ])

  const sessoesFinalizadas = sessoes?.filter((s) => s.status === 'finalizada') ?? []
  const notaMedia =
    sessoesFinalizadas.length > 0
      ? sessoesFinalizadas.reduce((acc, s) => acc + (s.nota ?? 0), 0) / sessoesFinalizadas.length
      : null

  const statusCfg = statusConfig[simulado.status] ?? statusConfig.rascunho

  function formatDate(date: string | null) {
    if (!date) return '—'
    return format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  }

  const initialFormData = {
    titulo: simulado.titulo,
    descricao: simulado.descricao ?? undefined,
    modo_aplicacao: simulado.modo_aplicacao,
    data_inicio: simulado.data_inicio
      ? new Date(simulado.data_inicio).toISOString().slice(0, 16)
      : undefined,
    data_fim: simulado.data_fim
      ? new Date(simulado.data_fim).toISOString().slice(0, 16)
      : undefined,
    tempo_limite_min: simulado.tempo_limite_min ?? undefined,
    metodo_identificacao: simulado.metodo_identificacao ?? undefined,
    embed_ativo: simulado.embed_ativo ?? false,
    regras: simulado.regras ?? undefined,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/admin/simulados"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar para Simulados
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{simulado.titulo}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.class}`}>
              {statusCfg.label}
            </span>
          </div>
        </div>
        <SimuladoActions simuladoId={id} status={simulado.status} />
      </div>

      <Tabs defaultValue="visao-geral">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
            <TabsTrigger value="questoes">Questões ({totalQuestoes ?? 0})</TabsTrigger>
            <TabsTrigger value="sessoes">Sessões ({totalSessoes ?? 0})</TabsTrigger>
            <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" render={<Link href={`/admin/simulados/${id}/embed`} />}>
            <Code className="mr-2 h-3.5 w-3.5" />
            Embed
          </Button>
        </div>

        {/* Visão Geral */}
        <TabsContent value="visao-geral" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total de Sessões</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalSessoes ?? 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Finalizadas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{sessoesFinalizadas.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Nota Média</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {notaMedia !== null ? notaMedia.toFixed(1) : '—'}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Questões</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalQuestoes ?? 0}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Detalhes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Modo: </span>
                  <span className="font-medium capitalize">{simulado.modo_aplicacao?.replace(/_/g, ' ')}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Início: </span>
                  <span className="font-medium">{formatDate(simulado.data_inicio)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Fim: </span>
                  <span className="font-medium">{formatDate(simulado.data_fim)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Tempo limite: </span>
                  <span className="font-medium">
                    {simulado.tempo_limite_min ? `${simulado.tempo_limite_min} min` : '—'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Questões */}
        <TabsContent value="questoes">
          <Card>
            <CardHeader>
              <CardTitle>Questões do Simulado</CardTitle>
              <CardDescription>
                Gerencie as questões incluídas neste simulado
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Ordem</TableHead>
                    <TableHead>Enunciado</TableHead>
                    <TableHead>Disciplina</TableHead>
                    <TableHead>Peso</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!questoes || questoes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhuma questão adicionada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    questoes.map((sq: any) => {
                      const q = sq.questoes
                      const enunciado = (q?.enunciado as string) ?? ''
                      const preview = enunciado.length > 60 ? enunciado.slice(0, 60) + '…' : enunciado
                      return (
                        <TableRow key={sq.id}>
                          <TableCell className="text-center">{sq.ordem}</TableCell>
                          <TableCell className="text-sm">{preview}</TableCell>
                          <TableCell className="text-sm">{q?.disciplinas?.nome ?? '—'}</TableCell>
                          <TableCell>{sq.peso ?? 1}</TableCell>
                          <TableCell>
                            {sq.anulada ? (
                              <Badge variant="destructive">Anulada</Badge>
                            ) : (
                              <Badge variant="secondary">Ativa</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sessões */}
        <TabsContent value="sessoes">
          <Card>
            <CardHeader>
              <CardTitle>Sessões de Prova</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estudante</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Nota</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Fim</TableHead>
                    <TableHead>Teste</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!sessoes || sessoes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhuma sessão registrada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sessoes.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm font-medium">
                          {s.estudantes?.nome ?? '—'}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{sessaoStatusMap[s.status] ?? s.status}</span>
                        </TableCell>
                        <TableCell>
                          {s.nota !== null ? s.nota?.toFixed(1) : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(s.iniciado_em)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(s.finalizado_em)}
                        </TableCell>
                        <TableCell>
                          {s.is_teste && <Badge variant="outline">Teste</Badge>}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configurações */}
        <TabsContent value="configuracoes">
          <SimuladoForm
            initialData={initialFormData as any}
            onSubmit={(data) => updateSimuladoAction(id, data)}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
