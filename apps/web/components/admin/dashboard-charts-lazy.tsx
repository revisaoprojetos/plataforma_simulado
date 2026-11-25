'use client'

import dynamic from 'next/dynamic'
import type { DashboardSerie } from '@/lib/admin/dashboard-serie'

// recharts (~100KB+) só carrega quando o dashboard monta, fora do bundle inicial da página.
const DashboardChartsImpl = dynamic(
  () => import('@/components/admin/dashboard-charts').then((m) => m.DashboardCharts),
  { loading: () => <div className="h-[340px] w-full animate-pulse rounded-xl bg-muted/40" aria-hidden /> },
)

export function DashboardCharts({ inicial }: { inicial: DashboardSerie }) {
  return <DashboardChartsImpl inicial={inicial} />
}
