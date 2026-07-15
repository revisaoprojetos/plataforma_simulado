import Link from 'next/link'
import { subDays, format, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { Card, CardContent } from '@/components/ui/card'
import { BookOpen, ClipboardList, Users, Activity, Trophy, ArrowRight, Plus } from 'lucide-react'
import { Colunas } from '@/components/admin/relatorios/viz'
import { SecaoHeader } from '@/components/admin/secao-header'

async function getDados(tenantId: string) {
  const svc = await createServiceClient()
  const t = { tenant_id: tenantId }
  const hojeIso = startOfDay(new Date()).toISOString()
  const inicio7 = startOfDay(subDays(new Date(), 6)).toISOString()

  const [
    { count: totalQuestoes },
    { count: totalSimulados },
    { count: totalEstudantes },
    { count: sessoesHoje },
    { data: sess7 },
    { data: recentes },
    { data: notasData },
  ] = await Promise.all([
    svc.from('simulado_questoes').select('*', { count: 'exact', head: true }).match(t).eq('deletado', false),
    svc.from('simulado_simulados').select('*', { count: 'exact', head: true }).match(t).eq('deletado', false).eq('status', 'publicado'),
    svc.from('simulado_estudantes').select('*', { count: 'exact', head: true }).match(t).eq('deletado', false),
    svc.from('simulado_sessoes_prova').select('*', { count: 'exact', head: true }).match(t).eq('deletado', false).eq('is_teste', false).gte('created_at', hojeIso),
    svc.from('simulado_sessoes_prova').select('created_at').match(t).eq('deletado', false).eq('is_teste', false).gte('created_at', inicio7).limit(10000),
    svc.from('simulado_simulados').select('id, titulo, status, modo_aplicacao, created_at').match(t).eq('deletado', false).order('created_at', { ascending: false }).limit(5),
    svc.from('simulado_sessoes_prova').select('nota').match(t).eq('deletado', false).eq('is_teste', false).eq('status', 'finalizada').not('nota', 'is', null).limit(20000),
  ])

  // Série real de sessões por dia (últimos 7 dias, inclusive dias sem sessão).
  const buckets = new Map<string, number>()
  for (const s of (sess7 ?? []) as any[]) {
    const k = (s.created_at ?? '').slice(0, 10)
    if (k) buckets.set(k, (buckets.get(k) ?? 0) + 1)
  }
  const serie = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i)
    return { rotulo: format(d, 'EEE', { locale: ptBR }), valor: buckets.get(format(d, 'yyyy-MM-dd')) ?? 0 }
  })

  const notas = (notasData ?? []).map((n: any) => Number(n.nota)).filter((n) => !Number.isNaN(n))
  const notaMedia = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null

  return {
    totalQuestoes: totalQuestoes ?? 0,
    totalSimulados: totalSimulados ?? 0,
    totalEstudantes: totalEstudantes ?? 0,
    sessoesHoje: sessoesHoje ?? 0,
    serie,
    recentes: recentes ?? [],
    notaMedia,
    provas7: (sess7 ?? []).length,
  }
}

const modeLabels: Record<string, string> = { janela_fixa: 'Janela fixa', prazo_relativo: 'Prazo relativo', aberto: 'Aberto' }
const statusLabels: Record<string, { label: string; class: string }> = {
  rascunho: { label: 'Rascunho', class: 'bg-muted text-muted-foreground' },
  publicado: { label: 'Publicado', class: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  encerrado: { label: 'Encerrado', class: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
}

export default async function AdminDashboard() {
  const tenantId = await getCurrentTenantId()
  const d = await getDados(tenantId ?? '00000000-0000-0000-0000-000000000000')
  const fmtNota = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','))

  const cards = [
    { title: 'Questões', value: d.totalQuestoes, sub: 'no banco', icon: BookOpen, href: '/admin/questoes' },
    { title: 'Simulados ativos', value: d.totalSimulados, sub: 'publicados', icon: ClipboardList, href: '/admin/simulados' },
    { title: 'Estudantes', value: d.totalEstudantes, sub: 'cadastrados', icon: Users, href: '/admin/estudantes' },
    { title: 'Sessões hoje', value: d.sessoesHoje, sub: `${d.provas7} nos últimos 7 dias`, icon: Activity, href: '/admin/relatorios/graficos' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral da plataforma</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/questoes/nova" className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:bg-muted">
            <Plus className="h-4 w-4" /> Nova questão
          </Link>
          <Link href="/admin/simulados/novo" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90">
            <Plus className="h-4 w-4" /> Novo simulado
          </Link>
        </div>
      </div>

      {/* Stats Cards (clicáveis) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.title} href={card.href}
            className="group relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.08] to-transparent" />
            <card.icon className="pointer-events-none absolute -right-3 -top-3 h-20 w-20 text-primary opacity-[0.06] transition-transform duration-300 group-hover:scale-110" />
            <div className="relative flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform duration-200 group-hover:scale-105"><card.icon className="h-6 w-6" /></span>
              <div className="min-w-0">
                <p className="text-3xl font-bold leading-none tracking-tight">{card.value.toLocaleString('pt-BR')}</p>
                <p className="mt-1 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.title} · {card.sub}</p>
              </div>
            </div>
            <ArrowRight className="absolute bottom-3 right-3 h-4 w-4 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Chart (dados reais) */}
        <Card className="overflow-hidden lg:col-span-2" style={{ ['--card-spacing' as string]: '0px' }}>
          <SecaoHeader icon={Activity} titulo="Sessões nos últimos 7 dias" subtitulo="Sessões de prova iniciadas por dia" />
          <CardContent className="px-4 py-5">
            <Colunas itens={d.serie} tom="primary" altura={210} />
          </CardContent>
        </Card>

        {/* Destaque: nota média */}
        <Card className="overflow-hidden" style={{ ['--card-spacing' as string]: '0px' }}>
          <SecaoHeader icon={Trophy} titulo="Desempenho" subtitulo="Sessões finalizadas" />
          <CardContent className="flex flex-col items-center justify-center gap-1 px-4 py-8">
            <div className="text-5xl font-bold tabular-nums text-primary">{fmtNota(d.notaMedia)}</div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">nota média geral</div>
            <Link href="/admin/relatorios/graficos" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              Ver relatórios <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Simulados */}
      <Card className="overflow-hidden" style={{ ['--card-spacing' as string]: '0px' }}>
        <SecaoHeader icon={ClipboardList} titulo="Últimos simulados" subtitulo="Os 5 mais recentes" />
        <CardContent className="px-4 py-4">
          {d.recentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum simulado criado ainda.</p>
          ) : (
            <div className="space-y-2">
              {d.recentes.map((s: any) => {
                const st = statusLabels[s.status] ?? statusLabels.rascunho
                return (
                  <Link key={s.id} href={`/admin/simulados/${s.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border p-3 transition hover:border-primary/40 hover:bg-muted/40">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {modeLabels[s.modo_aplicacao] ?? '—'} · criado em {new Date(s.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.class}`}>{st.label}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
