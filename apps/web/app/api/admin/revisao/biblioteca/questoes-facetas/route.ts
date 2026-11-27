import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { estadoQDeParams } from '@/lib/admin-revisao/biblioteca-questoes-tipos'
import { facetasQuestoesAdmin } from '@/lib/admin-revisao/facetas-questoes-admin'

export const dynamic = 'force-dynamic'

// GET /api/admin/revisao/biblioteca/questoes-facetas?<mesmos params da lista> → { ok, total, contagens } (por dimensão, com os OUTROS filtros).
// questoes:view + tenant da sessão (nunca do cliente). Sem SQL direto (DATABASE_URL ausente) devolve ok:false e o card some só os números.
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'questoes:view') || !access.tenantId) return NextResponse.json({ ok: false, error: 'sem_permissao' }, { status: 403 })
  try {
    const e = estadoQDeParams(new URL(req.url).searchParams)
    const r = await facetasQuestoesAdmin(createAdminClient(), access.tenantId, e)
    if (!r) return NextResponse.json({ ok: false }, { status: 200 })
    return NextResponse.json({ ok: true, ...r }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
