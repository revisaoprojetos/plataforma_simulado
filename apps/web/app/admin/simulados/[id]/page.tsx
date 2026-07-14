import { createClient } from '@/lib/supabase/server'
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
import { SimuladoQuestoesManager } from '@/components/admin/simulado-questoes-manager'
import { SimuladoCadernoLink } from '@/components/admin/simulado-caderno-link'
import { SimuladoRelatorio } from '@/components/admin/simulado-relatorio'
import { SimuladoRecorrecao } from '@/components/admin/simulado-recorrecao'
import { SimuladoAcessos } from '@/components/admin/simulado-acessos'
import { SimuladoLiberacoes } from '@/components/admin/simulado-liberacoes'
import { CopyLink } from '@/components/admin/copy-link'
import { updateSimuladoAction } from '../actions'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Link from 'next/link'
import { ChevronLeft, Code, Layers, CalendarClock, Clock, KeyRound, Link2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { TipoSimuladoBadge } from '@/components/admin/tipo-simulado-badge'
import { tipoDoSimulado } from '@/lib/simulado/tipo'

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
    .from('simulado_simulados')
    .select('*')
    .eq('id', id)
    .single()

  if (!simulado) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/simulados"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar para Simulados
        </Link>
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <h2 className="text-lg font-semibold">Simulado não encontrado</h2>
            <p className="text-sm text-muted-foreground">
              Este simulado não existe ou foi removido. O link pode estar desatualizado.
            </p>
            <Link href="/admin/simulados" className={buttonVariants({ variant: 'outline' }) + ' mt-2'}>
              Ver todos os simulados
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const modoLabelMap: Record<string, string> = {
    janela_fixa: 'Janela fixa',
    prazo_relativo: 'Prazo relativo',
    aberto: 'Aberto',
  }
  const metodoLabelMap: Record<string, string> = {
    email: 'Somente e-mail',
    email_cpf: 'E-mail + CPF',
    email_telefone: 'E-mail + telefone',
  }

  const [
    { data: questoes, count: totalQuestoes },
    { data: sessoes, count: totalSessoes },
    { data: todasQuestoes },
  ] = await Promise.all([
    supabase
      .from('simulado_prova_questoes')
      .select(`
        id, ordem, peso, anulada,
        questoes:simulado_questoes(id, tipo, enunciado, disciplinas:simulado_disciplinas(nome))
      `, { count: 'exact' })
      .eq('simulado_id', id)
      .order('ordem'),
    supabase
      .from('simulado_sessoes_prova')
      .select(`
        id, status, nota, iniciado_em, finalizado_em, is_teste,
        estudantes:simulado_estudantes(nome, user_id)
      `, { count: 'exact' })
      .eq('simulado_id', id)
      .eq('deletado', false)
      .order('iniciado_em', { ascending: false })
      .limit(50),
    supabase
      .from('simulado_questoes')
      .select('id, enunciado, status, disciplinas:simulado_disciplinas(nome)')
      .order('created_at', { ascending: false }),
  ])

  // Cadernos de design do tenant (para vincular o tema/HUD ao simulado).
  const { data: cadernosRaw } = await supabase
    .from('simulado_cadernos_designer')
    .select('id, nome')
    .order('atualizado_em', { ascending: false })
  const cadernos = (cadernosRaw ?? []).map((c: any) => ({ id: c.id as string, nome: (c.nome as string) ?? 'Caderno' }))
  const cadernoVinculado = ((simulado.regras as Record<string, unknown> | null)?.caderno_id as string | undefined) ?? null

  // Tipo do simulado (objetiva/discursiva/mista) derivado das questões vinculadas.
  const tipoSim = tipoDoSimulado((questoes ?? []).map((sq: any) => sq.questoes?.tipo))

  const questoesNoSimulado = (questoes ?? []).map((sq: any) => ({
    id: sq.id,
    ordem: sq.ordem ?? 0,
    peso: sq.peso ?? 1,
    anulada: sq.anulada ?? false,
    questao_id: sq.questoes?.id,
    enunciado: sq.questoes?.enunciado ?? '',
    disciplina: sq.questoes?.disciplinas?.nome,
  }))
  const idsNoSimulado = new Set(questoesNoSimulado.map((q) => q.questao_id))
  const questoesDisponiveis = (todasQuestoes ?? [])
    .filter((q: any) => !idsNoSimulado.has(q.id))
    .map((q: any) => ({
      id: q.id,
      enunciado: q.enunciado ?? '',
      status: q.status ?? 'rascunho',
      disciplina: q.disciplinas?.nome,
    }))

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
    <Tabs defaultValue="visao-geral">
      {/* Cabeçalho + abas — fixos no topo ao rolar o conteúdo */}
      <div className="sticky -top-6 z-40 -mx-6 -mt-6 space-y-3 border-b bg-background px-6 pb-3 pt-6 shadow-sm">
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
              <TipoSimuladoBadge tipo={tipoSim} />
            </div>
          </div>
          <SimuladoActions simuladoId={id} status={simulado.status} />
        </div>

        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
            <TabsTrigger value="questoes">Questões ({totalQuestoes ?? 0})</TabsTrigger>
            <TabsTrigger value="sessoes">Sessões ({totalSessoes ?? 0})</TabsTrigger>
            <TabsTrigger value="relatorio">Relatório</TabsTrigger>
            <TabsTrigger value="recorrecao">Re-correção</TabsTrigger>
            <TabsTrigger value="acessos">Acessos</TabsTrigger>
            <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
          </TabsList>
          <Link href={`/admin/simulados/${id}/embed`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Code className="mr-2 h-3.5 w-3.5" />
            Embed
          </Link>
        </div>
      </div>

      <div className="pt-6">
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
              <CardTitle>Início e Acesso</CardTitle>
              <CardDescription>
                Como e quando os alunos realizam este simulado, e o link de acesso.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Informações de aplicação */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Layers className="h-3.5 w-3.5" /> Modo de aplicação
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {modoLabelMap[simulado.modo_aplicacao] ?? simulado.modo_aplicacao}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" /> Disponibilidade
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {simulado.modo_aplicacao === 'aberto'
                      ? 'Sempre disponível'
                      : simulado.modo_aplicacao === 'prazo_relativo'
                      ? 'Liberado por aluno após a matrícula'
                      : simulado.data_inicio || simulado.data_fim
                      ? `${formatDate(simulado.data_inicio)} → ${formatDate(simulado.data_fim)}`
                      : 'Janela fixa — defina as datas'}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> Tempo limite
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {simulado.tempo_limite_min ? `${simulado.tempo_limite_min} min` : 'Sem limite'}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <KeyRound className="h-3.5 w-3.5" /> Identificação
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {metodoLabelMap[simulado.metodo_identificacao] ?? 'Somente e-mail'}
                  </div>
                </div>
              </div>

              {/* Link de acesso do aluno */}
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Link2 className="h-4 w-4" /> Link de acesso do aluno
                </div>
                {simulado.status !== 'publicado' ? (
                  <p className="text-sm text-muted-foreground">
                    Publique o simulado (botão acima) para liberar o link de acesso aos alunos.
                  </p>
                ) : simulado.embed_token ? (
                  <>
                    <CopyLink url={`${appUrl}/aluno/login?token=${simulado.embed_token}`} />
                    <p className="text-xs text-muted-foreground">
                      O aluno entra com {(metodoLabelMap[simulado.metodo_identificacao] ?? 'somente e-mail').toLowerCase()} e precisa ter matrícula ativa neste simulado.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Token de acesso indisponível.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Liberações para o aluno</CardTitle>
              <CardDescription>
                Controle o que cada aluno vê. Os modos vêm da configuração; aqui você libera ou bloqueia manualmente a qualquer momento.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SimuladoLiberacoes
                simuladoId={id}
                regras={simulado.regras as any}
                status={simulado.status}
                dataFim={simulado.data_fim}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Questões */}
        <TabsContent value="questoes" className="space-y-4">
          <SimuladoCadernoLink simuladoId={id} cadernos={cadernos} atual={cadernoVinculado} />
          <Card>
            <CardHeader>
              <CardTitle>Questões do Simulado</CardTitle>
              <CardDescription>
                Adicione questões do banco (do seu tenant) e gerencie as incluídas neste simulado
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SimuladoQuestoesManager
                simuladoId={id}
                questoesNoSimulado={questoesNoSimulado}
                questoesDisponiveis={questoesDisponiveis}
              />
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
        <TabsContent value="relatorio">
          <SimuladoRelatorio simuladoId={id} />
        </TabsContent>

        <TabsContent value="recorrecao">
          <SimuladoRecorrecao simuladoId={id} />
        </TabsContent>

        <TabsContent value="acessos">
          <SimuladoAcessos simuladoId={id} modoAplicacao={simulado.modo_aplicacao} />
        </TabsContent>

        <TabsContent value="configuracoes">
          <SimuladoForm
            initialData={initialFormData as any}
            onSubmit={updateSimuladoAction.bind(null, id)}
          />
        </TabsContent>
      </div>
    </Tabs>
  )
}
