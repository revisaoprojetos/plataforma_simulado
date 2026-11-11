import { NextRequest, NextResponse } from 'next/server'
import { partesSchema } from '@/lib/video/catalogo-tipos'
import * as vc from '@/lib/video/client'
import { NO_STORE, contextoAdmin, idValido, lerJson, respostaErroAdmin } from '@/lib/video/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** POST /api/admin/video/[lessonId]/parts { partNumbers[] } -> { urls: string[] } alinhado a partNumbers (URLs S3 assinadas) (video:manage). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await contextoAdmin('manage')
  if (!g.ok) return g.res
  const id = (await params).id
  const bad = idValido(id); if (bad) return bad
  const b = await lerJson(req, partesSchema)
  if (!b.ok) return b.res
  try {
    const aula = await vc.obterAula(g.ctx.slug, id)
    if (!aula.videoId) return NextResponse.json({ message: 'Upload não iniciado para esta aula.' }, { status: 409 })
    const out = await vc.assinarPartes(g.ctx.slug, aula.videoId, b.data.partNumbers)
    const mapa = new Map(out.parts.map((p) => [p.partNumber, p.url]))
    return NextResponse.json({ urls: b.data.partNumbers.map((n) => mapa.get(n) ?? '') }, { headers: NO_STORE })
  } catch (e) { return respostaErroAdmin(e) }
}
