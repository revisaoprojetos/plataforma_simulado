import { NextRequest, NextResponse } from 'next/server'
import { registrarAudit } from '@/lib/audit'
import { concluirSchema } from '@/lib/video/catalogo-tipos'
import * as vc from '@/lib/video/client'
import { NO_STORE, contextoAdmin, idValido, lerJson, respostaErroAdmin } from '@/lib/video/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** POST /api/admin/video/[lessonId]/complete { parts:[{partNumber, etag}] } -> { status } (idempotente) (video:manage). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await contextoAdmin('manage')
  if (!g.ok) return g.res
  const id = (await params).id
  const bad = idValido(id); if (bad) return bad
  const b = await lerJson(req, concluirSchema)
  if (!b.ok) return b.res
  try {
    const aula = await vc.obterAula(g.ctx.slug, id)
    if (!aula.videoId) return NextResponse.json({ message: 'Upload não iniciado para esta aula.' }, { status: 409 })
    const out = await vc.concluirUpload(g.ctx.slug, aula.videoId, b.data.parts)
    await registrarAudit({ operacao: 'UPDATE', entidade: 'video_aula', entidadeId: id, tenantId: g.ctx.tenantId, atorId: g.ctx.userId, depois: { upload: 'concluido' } })
    return NextResponse.json({ status: out?.status ?? 'queued' }, { status: 202, headers: NO_STORE })
  } catch (e) { return respostaErroAdmin(e) }
}
