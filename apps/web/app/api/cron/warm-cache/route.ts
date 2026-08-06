import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resumosSimulados } from '@/app/admin/relatorios/_resumos'
import { montarRelatorioGrafico } from '@/app/admin/relatorios/graficos/_dados'
import { montarRelatorioSimulado } from '@/app/admin/relatorios/simulados/_dados'
import { montarRankingSimulado } from '@/app/admin/relatorios/ranking/_dados'

export const dynamic = 'force-dynamic'

// Quantos simulados (mais recentes) por tenant têm relatório + ranking pré-computados.
// Teto de segurança para não estourar o tempo do cron mesmo com muitos tenants.
const SIMULADOS_POR_TENANT = 10

/**
 * Warm-up de cache (Fase 4). Pré-computa os relatórios pesados e popula o cache Redis — assim a
 * 1ª abertura (ex.: manhã da janela fixa com 1000+ alunos, ou a demo) já vem do cache. Aquece:
 *  - por tenant: os resumos da listagem e os gráficos do dashboard;
 *  - para os N simulados publicados mais recentes de cada tenant: o relatório e o ranking.
 * Reutiliza os MESMOS loaders das páginas (que já passam por `remember`), então preenche exatamente
 * as chaves que a UI lê. Protegido por CRON_SECRET; chamado periodicamente pelo worker.
 * Idempotente e best-effort (um tenant/simulado que falha não derruba o cron).
 */
function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return h === segredo
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  const svc = createAdminClient()
  const agoraIso = new Date().toISOString()

  // Tenants com simulado publicado (onde relatórios são consultados de fato) + os simulados
  // publicados mais recentes de cada um (para pré-computar relatório/ranking dos que a demo abre).
  const { data: sims } = await svc
    .from('simulado_simulados')
    .select('id, tenant_id, created_at')
    .eq('status', 'publicado')
    .eq('deletado', false)
    .order('created_at', { ascending: false })
  const tenants = [...new Set((sims ?? []).map((s: any) => s.tenant_id).filter(Boolean))] as string[]

  // Já vêm ordenados por created_at desc; pega só os N primeiros por tenant.
  const simsPorTenant = new Map<string, string[]>()
  for (const s of (sims ?? []) as any[]) {
    if (!s.id || !s.tenant_id) continue
    const arr = simsPorTenant.get(s.tenant_id) ?? []
    if (arr.length < SIMULADOS_POR_TENANT) { arr.push(s.id); simsPorTenant.set(s.tenant_id, arr) }
  }

  let aquecidos = 0        // tenants com resumos aquecidos (métrica preservada)
  let graficos = 0
  let simuladosAquecidos = 0
  for (const t of tenants) {
    try { await resumosSimulados(svc, t); aquecidos++ } catch { /* best-effort */ }
    try { await montarRelatorioGrafico(svc, t); graficos++ } catch { /* best-effort */ }
    for (const simId of simsPorTenant.get(t) ?? []) {
      try { await montarRelatorioSimulado(svc, simId, t) } catch { /* best-effort */ }
      try { await montarRankingSimulado(svc, simId, t, agoraIso) } catch { /* best-effort */ }
      simuladosAquecidos++
    }
  }
  return NextResponse.json({ ok: true, tenants: tenants.length, aquecidos, graficos, simuladosAquecidos })
}
