'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { subDays, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Mock data — in production, fetch from API
function generateMockData() {
  return Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i)
    return {
      day: format(date, 'EEE', { locale: ptBR }),
      sessoes: Math.floor(Math.random() * 150) + 10,
    }
  })
}

export function SessionsChart() {
  const data = generateMockData()

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
        />
        <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: 'hsl(var(--foreground))' }}
        />
        <Bar
          dataKey="sessoes"
          name="Sessões"
          fill="hsl(var(--primary))"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
