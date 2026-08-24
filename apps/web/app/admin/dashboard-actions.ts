'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { montarDashboardSerie, type DashboardSerie } from '@/lib/admin/dashboard-serie'

/** Série do dashboard por período (Semana ou Mês selecionado). Escopada ao tenant; só equipe. */
export async function getDashboardSerie(modo: 'semana' | 'mes', mes?: string): Promise<DashboardSerie> {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId || access.role === 'estudante') {
    return { modo, mes: mes ?? '', titulo: '', pontos: [], resumo: { iniciados: 0, feitos: 0, ativos: 0 }, heatmap: Array.from({ length: 7 }, () => Array(24).fill(0)), heatmapMax: 1, porDiaSemana: [], faixasNota: [], topSimulados: [] }
  }
  const svc = await createServiceClient()
  return montarDashboardSerie(svc, access.tenantId, modo, mes)
}
