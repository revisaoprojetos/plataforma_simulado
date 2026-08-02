import Link from 'next/link'
import { startOfDay } from 'date-fns'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { remember, chaveRelatorio, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'
import { getCurrentTenantId } from '@/lib/tenant'
import { Card, CardContent } from '@/components/ui/card'
import { BookOpen, ClipboardList, Users, Activity, Trophy, ArrowRight, Plus } from 'lucide-react'
import { SecaoHeader } from '@/components/admin/secao-header'
import { montarDashboardSerie } from '@/lib/admin/dashboard-serie'
import { DashboardCharts } from '@/components/admin/dashboard-charts'

async function getDados(tenantId: string) {
  const svc = await createServiceClient()
  const t = { tenant_id: tenantId }
  const hojeIso = startOfDay(new Date()).toISOString()

  const [
    { count: totalQuestoes },
    { count: totalSimulados },
    { count: totalEstudantes },
    { count: sessoesHoje },
    serieInicial,
    { data: recentes },
    notaMedia,
  ] = await Promise.all([
    svc.from('simulado_questoes').select('*', { count: 'exact', head: true }).match(t).eq('deletado', false),
    svc.from('simulado_simulados').select('*', { count: 'exact', head: true }).match(t).eq('deletado', false).eq('status', 'publicado'),
    svc.from('simulado_estudantes').select('*', { count: 'exact', head: true }).match(t).eq('deletado', false),
    svc.from('simulado_sessoes_prova').select('*', { count: 'exact', head: true }).match(t).eq('deletado', false).eq('is_teste', false).gte('iniciado_em', hojeIso),
    montarDashboardSerie(svc, tenantId, 'semana'),
    svc.from('simulado_simulados').select('id, titulo, status, modo_aplicacao, created_at').match(t).eq('deletado', false).order('created_at', { ascending: false }).limit(5),
    // Nota média = agregação sobre TODAS as notas finalizadas. Como a agregação do
    // PostgREST está desabilitada e não temos RPC, o cálculo ainda percorre as notas
    // (fetchAll), mas fica MEMOIZADO no Redis (TTL) — no cache-hit o dashboard não
    // toca no banco. Degrada sozinho sem Redis (computa direto). Ver relatorio-cache.
    remember<number | null>(chaveRelatorio(tenantId, 'dashboard', 'nota-media'), TTL_RELATORIO, async () => {
      // Agregação NO BANCO (RPC avg) — não transfere linhas. Fallback p/ o cálculo em JS
      // enquanto a função não estiver migrada (scripts/sql/nota-media-rpc.sql).
      const rpc = await svc.rpc('simulado_nota_media', { p_tenant: tenantId })
      if (!rpc.error) return rpc.data == null ? null : Number(rpc.data)
      const notasData = await fetchAll<{ nota: number | null }>(() =>
        svc.from('simulado_sessoes_prova').select('nota').match(t).eq('deletado', false).eq('is_teste', false).eq('status', 'finalizada').not('nota', 'is', null).order('id', { ascending: true }))
      const notas = (notasData ?? []).map((n: any) => Number(n.nota)).filter((n) => !Number.isNaN(n))
      return notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null
    }),
  ])

  return {
    totalQuestoes: totalQuestoes ?? 0,
    totalSimulados: totalSimulados ?? 0,
    totalEstudantes: totalEstudantes ?? 0,
    sessoesHoje: sessoesHoje ?? 0,
    serieInicial,
    recentes: recentes ?? [],
    notaMedia,
    provas7: serieInicial.resumo.iniciados,
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
            className="group relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.06] via-card to-card p-5 shadow-sm ring-1 ring-border/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5 hover:ring-primary/25">
            {/* fio de acento no topo, aparece no hover */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            {/* brilho no canto (mais presente) */}
            <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-primary/10 blur-2xl transition-all duration-300 group-hover:bg-primary/20" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.title}</p>
                <p className="mt-2 text-[2.1rem] font-bold leading-none tracking-tight tabular-nums">{card.value.toLocaleString('pt-BR')}</p>
                <p className="mt-2 truncate text-xs text-muted-foreground">{card.sub}</p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-md shadow-primary/25 ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-110">
                <card.icon className="h-5 w-5" />
              </span>
            </div>
            <ArrowRight className="absolute bottom-4 right-4 h-4 w-4 text-primary opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100" />
          </Link>
        ))}
      </div>

      {/* Gráficos interativos: filtro Semana/Mês + simulados (iniciados/feitos) e acessos de estudantes */}
      <DashboardCharts inicial={d.serieInicial} />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Destaque: nota média */}
        <Card className="relative overflow-hidden" style={{ ['--card-spacing' as string]: '0px' }}>
          <SecaoHeader icon={Trophy} titulo="Desempenho" subtitulo="Sessões finalizadas" />
          <CardContent className="relative flex flex-col items-center justify-center gap-1 px-4 py-10">
            {/* brilho radial suave atrás do número */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-[60%] rounded-full bg-primary/10 blur-3xl" />
            <div className="relative text-6xl font-bold tabular-nums tracking-tight text-primary drop-shadow-sm">{fmtNota(d.notaMedia)}</div>
            <div className="relative text-[11px] font-medium uppercase tracking-wide text-muted-foreground">nota média geral</div>
            <Link href="/admin/relatorios/graficos" className="relative mt-5 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/5 hover:border-primary/30">
              Ver relatórios <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>

        {/* Últimos simulados */}
        <Card className="overflow-hidden lg:col-span-2" style={{ ['--card-spacing' as string]: '0px' }}>
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
                          {modeLabels[s.modo_aplicacao] ?? '—'}{s.created_at ? ` · criado em ${new Date(s.created_at).toLocaleDateString('pt-BR')}` : ''}
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
    </div>
  )
}
