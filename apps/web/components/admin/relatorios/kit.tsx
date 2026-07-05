'use client'

import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area,
} from 'recharts'
import { cn } from '@/lib/utils'

// Paleta: 1ª cor = primária do tema; demais = tons distintos (bons no claro e no escuro).
export const PALETA = ['hsl(var(--primary))', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6', '#eab308', '#3b82f6']

/** Baixa uma planilha CSV (abre no Excel; BOM p/ acentos; separador ;). */
export function baixarCsv(nomeArq: string, linhas: (string | number | null)[][]) {
  const esc = (v: string | number | null) => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = `${nomeArq.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_')}.csv`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(a.href)
}

const eixo = { fontSize: 11 }
const tooltipStyle = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12, color: 'hsl(var(--foreground))' } as const

/** Cartão de KPI (número em destaque + rótulo + subtexto opcional). */
export function Kpi({ label, valor, sub, icon, tom = 'primary', className }: {
  label: string; valor: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode
  tom?: 'primary' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet'; className?: string
}) {
  const tons: Record<string, string> = {
    primary: 'text-primary bg-primary/10', emerald: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400',
    amber: 'text-amber-600 bg-amber-500/10 dark:text-amber-400', rose: 'text-rose-600 bg-rose-500/10 dark:text-rose-400',
    sky: 'text-sky-600 bg-sky-500/10 dark:text-sky-400', violet: 'text-violet-600 bg-violet-500/10 dark:text-violet-400',
  }
  return (
    <div className={cn('rounded-xl border bg-card p-4', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {icon && <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', tons[tom])}>{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums leading-none">{valor}</div>
      {sub != null && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

/** Moldura de gráfico com título. */
export function Grafico({ titulo, acao, altura = 260, children }: { titulo: string; acao?: React.ReactNode; altura?: number; children: React.ReactElement }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {acao}
      </div>
      <ResponsiveContainer width="100%" height={altura}>{children}</ResponsiveContainer>
    </div>
  )
}

type Serie = { key: string; nome: string; cor?: string }

export function Barras({ data, x, series, empilhado }: { data: any[]; x: string; series: Serie[]; empilhado?: boolean }) {
  return (
    <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
      <XAxis dataKey={x} tick={eixo} className="text-muted-foreground" interval="preserveStartEnd" />
      <YAxis tick={eixo} className="text-muted-foreground" allowDecimals={false} />
      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
      {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
      {series.map((s, i) => (
        <Bar key={s.key} dataKey={s.key} name={s.nome} stackId={empilhado ? 'a' : undefined} fill={s.cor ?? PALETA[i % PALETA.length]} radius={empilhado ? 0 : [4, 4, 0, 0]} />
      ))}
    </BarChart>
  )
}

export function Linha({ data, x, series, area }: { data: any[]; x: string; series: Serie[]; area?: boolean }) {
  if (area) {
    return (
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
        <XAxis dataKey={x} tick={eixo} className="text-muted-foreground" interval="preserveStartEnd" />
        <YAxis tick={eixo} className="text-muted-foreground" allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => {
          const cor = s.cor ?? PALETA[i % PALETA.length]
          return <Area key={s.key} type="monotone" dataKey={s.key} name={s.nome} stroke={cor} fill={cor} fillOpacity={0.15} strokeWidth={2} />
        })}
      </AreaChart>
    )
  }
  return (
    <LineChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
      <XAxis dataKey={x} tick={eixo} className="text-muted-foreground" interval="preserveStartEnd" />
      <YAxis tick={eixo} className="text-muted-foreground" allowDecimals={false} />
      <Tooltip contentStyle={tooltipStyle} />
      {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
      {series.map((s, i) => (
        <Line key={s.key} type="monotone" dataKey={s.key} name={s.nome} stroke={s.cor ?? PALETA[i % PALETA.length]} strokeWidth={2} dot={false} />
      ))}
    </LineChart>
  )
}

export function Rosca({ data, nameKey, valueKey }: { data: any[]; nameKey: string; valueKey: string }) {
  return (
    <PieChart>
      <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius={55} outerRadius={90} paddingAngle={2}>
        {data.map((_, i) => <Cell key={i} fill={PALETA[i % PALETA.length]} />)}
      </Pie>
      <Tooltip contentStyle={tooltipStyle} />
      <Legend wrapperStyle={{ fontSize: 12 }} />
    </PieChart>
  )
}
