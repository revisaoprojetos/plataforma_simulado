import { NextRequest, NextResponse } from 'next/server'
import { analyticsSchema } from '@/lib/video/tipos'
import * as vc from '@/lib/video/client'
import { NO_STORE, aulaDoTenant, contextoAdmin, respostaErroAdmin } from '@/lib/video/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET /api/admin/video/[id]/analytics?from&to — métricas da aula (cálculo no serviço; repassado sem recomputar). video:view */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await contextoAdmin('view')
  if (!g.ok) return g.res
  const r = await aulaDoTenant(g.ctx.tenantId, (await params).id)
  if ('res' in r) return r.res
  const q = analyticsSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()))
  if (!q.success) return NextResponse.json({ message: 'Parâmetros inválidos.' }, { status: 400 })
  try {
    const dados = await vc.analyticsAula(g.ctx.slug, r.aula.lesson_id, q.data.from, q.data.to)
    return NextResponse.json({ aulaId: r.aula.id, titulo: r.aula.titulo, analytics: dados }, { headers: NO_STORE })
  } catch (e) { return respostaErroAdmin(e) }
}
