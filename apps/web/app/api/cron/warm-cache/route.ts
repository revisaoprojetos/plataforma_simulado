import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resumosSimulados } from '@/app/admin/relatorios/_resumos'

export const dynamic = 'force-dynamic'

/**
 * Warm-up de cache (Fase 4). Pré-computa os relatórios pesados (resumos por tenant) e popula
 * o cache Redis — assim a 1ª abertura (ex.: manhã da janela fixa com 1000+ alunos) já vem do
 * cache. Protegido por CRON_SECRET; chamado periodicamente pelo worker. Idempotente e best-effort.
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

  // Tenants com simulado publicado (onde relatórios são consultados de fato).
  const { data: sims } = await svc.from('simulado_simulados').select('tenant_id').eq('status', 'publicado').eq('deletado', false)
  const tenants = [...new Set((sims ?? []).map((s: any) => s.tenant_id).filter(Boolean))] as string[]

  let aquecidos = 0
  for (const t of tenants) {
    try { await resumosSimulados(svc, t); aquecidos++ } catch { /* best-effort */ }
  }
  return NextResponse.json({ ok: true, tenants: tenants.length, aquecidos })
}
