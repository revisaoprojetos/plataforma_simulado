import { NextRequest, NextResponse } from 'next/server'
import { cronAutorizado, guardAdminVideo } from '@/lib/video/permissoes'
import { estatisticasFila, processarFila, reconciliarTenant } from '@/lib/video/sync'
import { createAdminClient } from '@/lib/supabase/server'
import { NO_STORE } from '@/lib/video/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * Job de sincronização de acesso (liberação -> video-api).
 *   POST /api/admin/video/sync[?reconciliar=1&aplicar=1&tenant=<uuid>&limite=50]
 *     - worker/cron: header x-cron-secret (CRON_SECRET)  -> processa a fila de TODOS os tenants (ou ?tenant=)
 *     - admin logado com video:manage                    -> só o próprio tenant
 *   `reconciliar=1` roda a reconciliação (DRY-RUN por padrão; `aplicar=1` efetiva) ANTES de processar a fila.
 *   GET -> contagens da fila (video:view).
 */
async function alvo(req: NextRequest): Promise<{ ok: true; tenantIds: string[] | null } | { ok: false; res: NextResponse }> {
  if (cronAutorizado(req)) {
    const t = req.nextUrl.searchParams.get('tenant')
    return { ok: true, tenantIds: t ? [t] : null }
  }
  const g = await guardAdminVideo('manage')
  if (!g.ok) return g
  return { ok: true, tenantIds: [g.tenantId] }
}

export async function POST(req: NextRequest) {
  const a = await alvo(req)
  if (!a.ok) return a.res
  const sp = req.nextUrl.searchParams
  const limite = Math.min(Math.max(Number(sp.get('limite') ?? 50) || 50, 1), 200)
  const out: Record<string, unknown> = {}

  let tenantIds = a.tenantIds
  if (sp.get('reconciliar') === '1') {
    if (!tenantIds) {
      const { data } = await createAdminClient().from('video_empresas').select('tenant_id').eq('ativo', true).limit(500)
      tenantIds = (data ?? []).map((r: any) => r.tenant_id as string)
    }
    const rec: Record<string, unknown> = {}
    for (const t of tenantIds) {
      rec[t] = await reconciliarTenant(t, { dry: sp.get('aplicar') !== '1' }).catch((e) => ({ erro: String(e?.message ?? e) }))
    }
    out.reconciliacao = rec
  }
  // fila: cron processa todos; admin só o seu tenant.
  out.fila = await processarFila({ tenantId: a.tenantIds?.[0], limite })
  return NextResponse.json(out, { headers: NO_STORE })
}

export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    const g = await guardAdminVideo('view')
    if (!g.ok) return g.res
    return NextResponse.json({ fila: await estatisticasFila(g.tenantId) }, { headers: NO_STORE })
  }
  return NextResponse.json({ fila: await estatisticasFila(req.nextUrl.searchParams.get('tenant') ?? undefined) }, { headers: NO_STORE })
}
