import { NextRequest, NextResponse } from 'next/server'
import { registrarAudit } from '@/lib/audit'
import { iniciarUploadSchema } from '@/lib/video/catalogo-tipos'
import { esquecerVideo } from '@/lib/video/catalogo'
import * as vc from '@/lib/video/client'
import { NO_STORE, contextoAdmin, idValido, lerJson, respostaErroAdmin } from '@/lib/video/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/admin/video/[lessonId]/upload { filename, size, contentType } -> { id, videoId, uploadId, partSize, partCount }
 * Inicia o upload multipart da aula. Se a aula já tem um vídeo (ex.: com erro), ele é removido antes (video:manage).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await contextoAdmin('manage')
  if (!g.ok) return g.res
  const id = (await params).id
  const bad = idValido(id); if (bad) return bad
  const b = await lerJson(req, iniciarUploadSchema)
  if (!b.ok) return b.res
  try {
    const aula = await vc.obterAula(g.ctx.slug, id)
    if (aula.videoId) {
      try { await vc.removerVideo(g.ctx.slug, aula.videoId) } catch (e) { if (!(e instanceof vc.VideoApiError && e.status === 404)) throw e }
      esquecerVideo(g.ctx.slug, aula.videoId)
    }
    const up = await vc.criarUpload(g.ctx.slug, { lessonId: id, ...b.data })
    await registrarAudit({ operacao: 'UPDATE', entidade: 'video_aula', entidadeId: id, tenantId: g.ctx.tenantId, atorId: g.ctx.userId, depois: { acao: 'iniciar_upload', size: b.data.size } })
    return NextResponse.json({ id, videoId: up.videoId, uploadId: up.uploadId, partSize: up.partSize, partCount: up.partCount }, { headers: NO_STORE })
  } catch (e) { return respostaErroAdmin(e) }
}
