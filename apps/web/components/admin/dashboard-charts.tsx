'use client'

import { useState, useTransition } from 'react'
import type React from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Activity, Users, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { getDashboardSerie } from '@/app/admin/dashboard-actions'
import type { DashboardSerie } from '@/lib/admin/dashboard-serie'

const tooltipProps = {
  contentStyle: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--foreground)', boxShadow: '0 4px 16px rgb(0 0 0 / 0.12)' },
  labelStyle: { color: 'var(--foreground)', fontWeight: 600, marginBottom: 4 },
  cursor: { stroke: 'var(--border)', strokeWidth: 1 },
}

/** Card de um gráfico com cabeçalho (ícone + título + total à direita). */
function GraficoCard({ titulo, subtitulo, icon: Icon, total, children }: { titulo: string; subtitulo: string; icon: React.ComponentType<{ className?: string }>; total?: string; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as string]: '0px' }}>
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

/** Seção de gráficos do dashboard: filtro Semana/Mês (com seletor de mês) + área de simulados e acessos. */
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
    </div>
  )
}
