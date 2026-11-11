import { NextRequest, NextResponse } from 'next/server'
import { registrarAudit } from '@/lib/audit'
import { esquecerVideo } from '@/lib/video/catalogo'
import * as vc from '@/lib/video/client'
import { NO_STORE, contextoAdmin, idValido, respostaErroAdmin } from '@/lib/video/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** DELETE /api/admin/video/[lessonId]/video — remove SÓ o vídeo (a aula permanece, sem vídeo) (video:manage). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await contextoAdmin('manage')
  if (!g.ok) return g.res
  const id = (await params).id
  const bad = idValido(id); if (bad) return bad
  try {
    const aula = await vc.obterAula(g.ctx.slug, id)
    if (aula.videoId) {
      try { await vc.removerVideo(g.ctx.slug, aula.videoId) } catch (e) { if (!(e instanceof vc.VideoApiError && e.status === 404)) throw e }
      esquecerVideo(g.ctx.slug, aula.videoId)
      await registrarAudit({ operacao: 'DELETE', entidade: 'video_arquivo', entidadeId: aula.videoId, tenantId: g.ctx.tenantId, atorId: g.ctx.userId, antes: { aulaId: id } })
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (e) { return respostaErroAdmin(e) }
}
