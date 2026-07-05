import { createServiceClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { BookOpen, ClipboardList, Users, Activity } from 'lucide-react'
import { SessionsChart } from '@/components/admin/sessions-chart'
import { SecaoHeader } from '@/components/admin/secao-header'

async function getDashboardStats() {
  const supabase = await createServiceClient()

  const [
    { count: totalQuestoes },
    { count: totalSimulados },
    { count: totalEstudantes },
    { count: sessoesHoje },
  ] = await Promise.all([
    supabase.from('simulado_questoes').select('*', { count: 'exact', head: true }).eq('deletado', false),
    supabase.from('simulado_simulados').select('*', { count: 'exact', head: true }).eq('deletado', false).eq('status', 'publicado'),
    supabase.from('simulado_estudantes').select('*', { count: 'exact', head: true }).eq('deletado', false),
    supabase
      .from('simulado_sessoes_prova')
      .select('*', { count: 'exact', head: true })
      .eq('deletado', false)
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
    .eq('deletado', false)
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
      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((card) => (
          <div key={card.title} className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.08] to-transparent" />
            <card.icon className="pointer-events-none absolute -right-3 -top-3 h-20 w-20 text-primary opacity-[0.06]" />
            <div className="relative flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><card.icon className="h-6 w-6" /></span>
              <div className="min-w-0">
                <p className="text-3xl font-bold leading-none tracking-tight">{card.value.toLocaleString('pt-BR')}</p>
                <p className="mt-1 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.title}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={Activity} titulo="Sessões nos últimos 7 dias" subtitulo="Sessões de prova iniciadas por dia" />
        <CardContent className="px-4 py-4">
          <SessionsChart />
        </CardContent>
      </Card>

      {/* Recent Simulados */}
      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={ClipboardList} titulo="Últimos simulados" subtitulo="Os 5 mais recentes" />
        <CardContent className="px-4 py-4">
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
