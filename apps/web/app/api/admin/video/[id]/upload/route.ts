import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { TIPOS_VIDEO, iniciarUploadSchema } from '@/lib/video/tipos'
import * as vc from '@/lib/video/client'
import { NO_STORE, aulaDoTenant, contextoAdmin, lerJson, respostaErroAdmin } from '@/lib/video/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** POST /api/admin/video/[id]/upload { filename, size, contentType } -> { id, uploadId, partSize, partCount, urls }
 *  (EXTRA do contrato) inicia/refaz o upload multipart de uma aula criada sem arquivo, ou em rascunho/enviando/erro. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await contextoAdmin('manage')
  if (!g.ok) return g.res
  const r = await aulaDoTenant(g.ctx.tenantId, (await params).id)
  if ('res' in r) return r.res
  if (!['rascunho', 'enviando', 'erro'].includes(r.aula.status)) {
    return NextResponse.json({ message: `Vídeo em estado "${r.aula.status}" não aceita novo upload (use reprocessar).` }, { status: 409 })
  }
  const b = await lerJson(req, iniciarUploadSchema)
  if (!b.ok) return b.res
  if (!(TIPOS_VIDEO as readonly string[]).includes(b.data.contentType)) return NextResponse.json({ message: 'Tipo de arquivo não suportado.' }, { status: 400 })
  try {
    const up = await vc.criarUpload(g.ctx.slug, { lessonId: r.aula.lesson_id, ...b.data })
    await createAdminClient().from('video_aulas').update({ video_id: up.videoId, status: 'enviando', erro: null, atualizado_em: new Date().toISOString() }).eq('id', r.aula.id).eq('tenant_id', g.ctx.tenantId)
    await registrarAudit({ operacao: 'UPDATE', entidade: 'video_aulas', entidadeId: r.aula.id, tenantId: g.ctx.tenantId, atorId: g.ctx.userId, depois: { acao: 'iniciar_upload', size: b.data.size } })
    return NextResponse.json({ id: r.aula.id, uploadId: up.uploadId, partSize: up.partSize, partCount: up.partCount, urls: up.parts }, { headers: NO_STORE })
  } catch (e) { return respostaErroAdmin(e) }
}
