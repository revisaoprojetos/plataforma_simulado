'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { montarDashboardSerie, type DashboardSerie } from '@/lib/admin/dashboard-serie'

/** Série do dashboard por período (Semana ou Mês selecionado). Escopada ao tenant; só equipe. */
export async function getDashboardSerie(modo: 'semana' | 'mes', mes?: string): Promise<DashboardSerie> {
  const access = await getCurrentAccess()
  if (!access.tenantId || access.role === 'estudante') {
    return { modo, mes: mes ?? '', titulo: '', pontos: [], resumo: { iniciados: 0, feitos: 0, ativos: 0 } }
  }
  const svc = await createServiceClient()
  return montarDashboardSerie(svc, access.tenantId, modo, mes)
}
