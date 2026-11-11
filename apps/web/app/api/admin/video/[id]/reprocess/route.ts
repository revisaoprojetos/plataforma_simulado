import { NextRequest, NextResponse } from 'next/server'
import { registrarAudit } from '@/lib/audit'
import { esquecerVideo } from '@/lib/video/catalogo'
import * as vc from '@/lib/video/client'
import { NO_STORE, contextoAdmin, idValido, respostaErroAdmin } from '@/lib/video/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** POST /api/admin/video/[lessonId]/reprocess — refaz o HLS do vídeo da aula (video:manage). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await contextoAdmin('manage')
  if (!g.ok) return g.res
  const id = (await params).id
  const bad = idValido(id); if (bad) return bad
  try {
    const aula = await vc.obterAula(g.ctx.slug, id)
    if (!aula.videoId) return NextResponse.json({ message: 'Esta aula ainda não tem vídeo.' }, { status: 409 })
    await vc.reprocessarVideo(g.ctx.slug, aula.videoId)
    esquecerVideo(g.ctx.slug, aula.videoId)
    await registrarAudit({ operacao: 'UPDATE', entidade: 'video_aula', entidadeId: id, tenantId: g.ctx.tenantId, atorId: g.ctx.userId, depois: { acao: 'reprocessar' } })
    return NextResponse.json({ status: 'na_fila' }, { status: 202, headers: NO_STORE })
  } catch (e) { return respostaErroAdmin(e) }
}
