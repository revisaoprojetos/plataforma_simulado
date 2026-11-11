import { NextRequest, NextResponse } from 'next/server'
import { analyticsQuerySchema } from '@/lib/video/catalogo-tipos'
import * as vc from '@/lib/video/client'
import { NO_STORE, contextoAdmin, idValido, respostaErroAdmin } from '@/lib/video/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET /api/admin/video/[lessonId]/analytics?from&to — métricas da aula (cálculo no serviço; repassado sem recomputar) (video:view). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await contextoAdmin('view')
  if (!g.ok) return g.res
  const id = (await params).id
  const bad = idValido(id); if (bad) return bad
  const q = analyticsQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()))
  if (!q.success) return NextResponse.json({ message: 'Parâmetros inválidos.' }, { status: 400 })
  try {
    const dados = await vc.analyticsAula(g.ctx.slug, id, q.data.from, q.data.to)
    return NextResponse.json({ aulaId: id, analytics: dados }, { headers: NO_STORE })
  } catch (e) { return respostaErroAdmin(e) }
}
