'use client'

import { useState, useTransition } from 'react'
import type React from 'react'
import Link from 'next/link'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts'
import { Activity, Users, Clock, CalendarDays, Target, Trophy, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { getDashboardSerie } from '@/app/admin/dashboard-actions'
import type { DashboardSerie } from '@/lib/admin/dashboard-serie'

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const CORES_SEMANA = ['#22c55e', '#f59e0b', '#38bdf8', '#34d399', '#a78bfa', '#94a3b8', '#f87171']

const tooltipProps = {
  contentStyle: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--foreground)', boxShadow: '0 4px 16px rgb(0 0 0 / 0.12)' },
  labelStyle: { color: 'var(--foreground)', fontWeight: 600, marginBottom: 4 },
  cursor: { stroke: 'var(--border)', strokeWidth: 1 },
}

/** Card de um gráfico com cabeçalho (ícone + título + total à direita). */
function GraficoCard({ titulo, subtitulo, icon: Icon, total, children }: { titulo: string; subtitulo: string; icon: React.ComponentType<{ className?: string }>; total?: string; children: React.ReactNode }) {
  return (
    <Card className="h-full overflow-hidden" style={{ ['--card-spacing' as string]: '0px' }}>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
          <div><p className="text-sm font-semibold leading-tight">{titulo}</p><p className="text-[11px] text-muted-foreground">{subtitulo}</p></div>
        </div>
        {total && <span className="shrink-0 text-xs font-semibold text-foreground">{total}</span>}
      </div>
      <CardContent className="px-2 pb-2 pt-3">{children}</CardContent>
    </Card>
  )
}

/** Cor da célula do heatmap por intensidade (indigo com opacidade). */
function cellColor(v: number, max: number) {
  if (!v) return 'var(--muted)'
  return `rgba(99, 102, 241, ${0.18 + 0.82 * (v / max)})`
}
function Heatmap({ matriz, max }: { matriz: number[][]; max: number }) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="min-w-[600px]">
        <div className="mb-1 grid grid-cols-[36px_repeat(24,1fr)] gap-[3px] text-[9px] text-muted-foreground">
          <span />
          {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center">{h % 3 === 0 ? `${h}h` : ''}</span>)}
        </div>
        {DIAS.map((dia, di) => (
          <div key={di} className="mb-[3px] grid grid-cols-[36px_repeat(24,1fr)] items-center gap-[3px]">
            <span className="text-[10px] text-muted-foreground">{dia}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const v = matriz[di]?.[h] ?? 0
              return <div key={h} title={`${dia} ${h}h · ${v} sessão(ões)`} className="aspect-square rounded-[3px] ring-1 ring-black/5 dark:ring-white/5" style={{ backgroundColor: cellColor(v, max) }} />
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Donut (rosca) com legenda — para "por dia da semana" e "distribuição de notas". */
function Donut({ dados, cores }: { dados: { nome: string; valor: number }[]; cores: string[] }) {
  const total = dados.reduce((a, d) => a + d.valor, 0)
  if (!total) return <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">Sem dados no período.</div>
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius={52} outerRadius={82} paddingAngle={2} stroke="var(--card)" strokeWidth={2}>
          {dados.map((_, i) => <Cell key={i} fill={cores[i % cores.length]} />)}
        </Pie>
        <Tooltip {...tooltipProps} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

/** Ranking de simulados mais feitos (com mini-barra e nota média). */
function TopSimulados({ itens }: { itens: DashboardSerie['topSimulados'] }) {
  if (!itens.length) return <div className="flex h-[200px] items-center justify-center px-4 text-center text-sm text-muted-foreground">Nenhum simulado feito no período.</div>
  const max = Math.max(1, ...itens.map((i) => i.feitos))
  return (
    <div className="divide-y">
      {itens.map((s, i) => (
        <Link key={s.id} href={`/admin/simulados/${s.id}`} className="flex items-center gap-3 px-2 py-2 transition-colors hover:bg-muted/40">
          <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{s.titulo}</p>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(s.feitos / max) * 100}%` }} />
            </div>
          </div>
          <span className="shrink-0 text-right text-xs text-muted-foreground">{s.media != null ? `${s.media.toFixed(1).replace('.', ',')} méd.` : '—'}</span>
          <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">{s.feitos.toLocaleString('pt-BR')}</span>
        </Link>
      ))}
    </div>
  )
}

/** Seção de gráficos do dashboard: filtro Semana/Mês (com seletor de mês) + área, heatmap, donuts e ranking. */
export function DashboardCharts({ inicial }: { inicial: DashboardSerie }) {
  const [dados, setDados] = useState<DashboardSerie>(inicial)
  const [pending, start] = useTransition()
  const modo = dados.modo

  function trocar(m: 'semana' | 'mes', mes?: string) {
    start(async () => setDados(await getDashboardSerie(m, mes)))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Atividade da plataforma</h2>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {dados.titulo}{pending && <><Loader2 className="h-3 w-3 animate-spin" /> atualizando…</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {([['semana', 'Semana'], ['mes', 'Mês']] as const).map(([m, label]) => (
              <button key={m} type="button" onClick={() => trocar(m, m === 'mes' ? dados.mes : undefined)} aria-pressed={modo === m}
                className={cn('rounded-md px-3 py-1 text-sm font-medium transition-colors', modo === m ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                {label}
              </button>
            ))}
          </div>
          {modo === 'mes' && (
            <input type="month" value={dados.mes} max={new Date().toISOString().slice(0, 7)} onChange={(e) => e.target.value && trocar('mes', e.target.value)}
              className="h-9 rounded-lg border bg-[var(--input-bg,transparent)] px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
          )}
        </div>
      </div>

      {/* Linha 1: séries de área (simulados + acessos) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GraficoCard titulo="Simulados" subtitulo="Iniciados e feitos por dia" icon={Activity} total={`${dados.resumo.feitos.toLocaleString('pt-BR')} feitos`}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={dados.pontos} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}>
              <defs>
                <linearGradient id="gIni" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.32} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient>
                <linearGradient id="gFeitos" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.32} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} className="text-muted-foreground" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" tickLine={false} axisLine={false} allowDecimals={false} width={30} />
              <Tooltip {...tooltipProps} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
              <Area type="monotone" dataKey="iniciados" name="Iniciados" stroke="var(--primary)" strokeWidth={2} fill="url(#gIni)" dot={false} activeDot={{ r: 3 }} />
              <Area type="monotone" dataKey="feitos" name="Feitos" stroke="#10b981" strokeWidth={2} fill="url(#gFeitos)" dot={false} activeDot={{ r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </GraficoCard>

        <GraficoCard titulo="Acessos de estudantes" subtitulo="Alunos que acessaram por dia" icon={Users} total={`${dados.resumo.ativos.toLocaleString('pt-BR')} no período`}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={dados.pontos} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}>
              <defs><linearGradient id="gAtivos" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.32} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} className="text-muted-foreground" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" tickLine={false} axisLine={false} allowDecimals={false} width={30} />
              <Tooltip {...tooltipProps} />
              <Area type="monotone" dataKey="ativos" name="Estudantes ativos" stroke="#6366f1" strokeWidth={2} fill="url(#gAtivos)" dot={false} activeDot={{ r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </GraficoCard>
      </div>

      {/* Linha 2: heatmap (dia×hora) + donut por dia da semana */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <GraficoCard titulo="Atividade por hora" subtitulo="Quando os alunos fazem simulados (horário de Brasília)" icon={Clock}>
            <Heatmap matriz={dados.heatmap} max={dados.heatmapMax} />
          </GraficoCard>
        </div>
        <GraficoCard titulo="Por dia da semana" subtitulo="Sessões iniciadas" icon={CalendarDays}>
          <Donut dados={dados.porDiaSemana.map((d) => ({ nome: d.dia, valor: d.valor }))} cores={CORES_SEMANA} />
        </GraficoCard>
      </div>

      {/* Linha 3: distribuição de notas + ranking de simulados */}
      <div className="grid gap-4 lg:grid-cols-3">
        <GraficoCard titulo="Distribuição de notas" subtitulo="Sessões finalizadas com nota" icon={Target}>
          <Donut dados={dados.faixasNota.map((f) => ({ nome: f.faixa, valor: f.valor }))} cores={dados.faixasNota.map((f) => f.cor)} />
        </GraficoCard>
        <div className="lg:col-span-2">
          <GraficoCard titulo="Simulados mais feitos" subtitulo="No período · nota média por simulado" icon={Trophy}>
            <TopSimulados itens={dados.topSimulados} />
          </GraficoCard>
        </div>
      </div>
    </div>
  )
}
