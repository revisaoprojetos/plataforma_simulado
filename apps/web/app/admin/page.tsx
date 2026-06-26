import { createServiceClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BookOpen, ClipboardList, Users, Activity } from 'lucide-react'
import { SessionsChart } from '@/components/admin/sessions-chart'

async function getDashboardStats() {
  const supabase = await createServiceClient()

  const [
    { count: totalQuestoes },
    { count: totalSimulados },
    { count: totalEstudantes },
    { count: sessoesHoje },
  ] = await Promise.all([
    supabase.from('simulado_questoes').select('*', { count: 'exact', head: true }),
    supabase.from('simulado_simulados').select('*', { count: 'exact', head: true }).eq('status', 'publicado'),
    supabase.from('simulado_estudantes').select('*', { count: 'exact', head: true }),
    supabase
      .from('simulado_sessoes_prova')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', new Date().toISOString().split('T')[0]),
  ])

  return {
    totalQuestoes: totalQuestoes ?? 0,
    totalSimulados: totalSimulados ?? 0,
    totalEstudantes: totalEstudantes ?? 0,
    sessoesHoje: sessoesHoje ?? 0,
  }
}

async function getRecentSimulados() {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('simulado_simulados')
    .select('id, titulo, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  return data ?? []
}

const modeLabels: Record<string, string> = {
  janela_fixa: 'Janela Fixa',
  prazo_relativo: 'Prazo Relativo',
  aberto: 'Aberto',
}

const statusLabels: Record<string, { label: string; class: string }> = {
  rascunho: { label: 'Rascunho', class: 'bg-muted text-muted-foreground' },
  publicado: { label: 'Publicado', class: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  encerrado: { label: 'Encerrado', class: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
}

export default async function AdminDashboard() {
  const [stats, recentSimulados] = await Promise.all([
    getDashboardStats(),
    getRecentSimulados(),
  ])

  const statsCards = [
    {
      title: 'Total de Questões',
      value: stats.totalQuestoes,
      description: 'Questões cadastradas',
      icon: BookOpen,
    },
    {
      title: 'Simulados Ativos',
      value: stats.totalSimulados,
      description: 'Simulados publicados',
      icon: ClipboardList,
    },
    {
      title: 'Estudantes',
      value: stats.totalEstudantes,
      description: 'Estudantes cadastrados',
      icon: Users,
    },
    {
      title: 'Sessões Hoje',
      value: stats.sessoesHoje,
      description: 'Sessões de prova hoje',
      icon: Activity,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral da plataforma</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value.toLocaleString('pt-BR')}</div>
              <p className="text-xs text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Sessões nos últimos 7 dias</CardTitle>
          <CardDescription>Número de sessões de prova iniciadas por dia</CardDescription>
        </CardHeader>
        <CardContent>
          <SessionsChart />
        </CardContent>
      </Card>

      {/* Recent Simulados */}
      <Card>
        <CardHeader>
          <CardTitle>Últimos Simulados</CardTitle>
          <CardDescription>Os 5 simulados mais recentes</CardDescription>
        </CardHeader>
        <CardContent>
          {recentSimulados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum simulado criado ainda.</p>
          ) : (
            <div className="space-y-3">
              {recentSimulados.map((s) => {
                const statusInfo = statusLabels[s.status] ?? statusLabels.rascunho
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{s.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        Criado em {new Date(s.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.class}`}
                    >
                      {statusInfo.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
