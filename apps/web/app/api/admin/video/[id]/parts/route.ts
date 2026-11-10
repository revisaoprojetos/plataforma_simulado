import { NextRequest, NextResponse } from 'next/server'
import { partesSchema } from '@/lib/video/tipos'
import * as vc from '@/lib/video/client'
import { NO_STORE, aulaDoTenant, contextoAdmin, lerJson, respostaErroAdmin } from '@/lib/video/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** POST /api/admin/video/[id]/parts { partNumbers[] } -> { urls: [{partNumber, url}] }  (URLs S3 assinadas, 2 h) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await contextoAdmin('manage')
  if (!g.ok) return g.res
  const r = await aulaDoTenant(g.ctx.tenantId, (await params).id)
  if ('res' in r) return r.res
  if (!r.aula.video_id || r.aula.status !== 'enviando') return NextResponse.json({ message: 'Upload não iniciado para este vídeo.' }, { status: 409 })
  const b = await lerJson(req, partesSchema)
  if (!b.ok) return b.res
  try {
    const out = await vc.assinarPartes(g.ctx.slug, r.aula.video_id, b.data.partNumbers)
    return NextResponse.json({ urls: out.parts }, { headers: NO_STORE })
  } catch (e) { return respostaErroAdmin(e) }
}
