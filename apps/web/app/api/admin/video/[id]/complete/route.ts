import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { concluirSchema } from '@/lib/video/tipos'
import * as vc from '@/lib/video/client'
import { statusAulaDoServico } from '@/lib/video/puro'
import { NO_STORE, aulaDoTenant, contextoAdmin, lerJson, respostaErroAdmin } from '@/lib/video/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** POST /api/admin/video/[id]/complete { parts:[{partNumber, etag}] } -> { status } (idempotente) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await contextoAdmin('manage')
  if (!g.ok) return g.res
  const r = await aulaDoTenant(g.ctx.tenantId, (await params).id)
  if ('res' in r) return r.res
  if (!r.aula.video_id) return NextResponse.json({ message: 'Upload não iniciado para este vídeo.' }, { status: 409 })
  const b = await lerJson(req, concluirSchema)
  if (!b.ok) return b.res
  try {
    const out = await vc.concluirUpload(g.ctx.slug, r.aula.video_id, b.data.parts)
    const status = statusAulaDoServico(out?.status ?? 'queued')
    await createAdminClient().from('video_aulas').update({ status, erro: null, atualizado_em: new Date().toISOString() }).eq('id', r.aula.id).eq('tenant_id', g.ctx.tenantId)
    await registrarAudit({ operacao: 'UPDATE', entidade: 'video_aulas', entidadeId: r.aula.id, tenantId: g.ctx.tenantId, atorId: g.ctx.userId, antes: { status: r.aula.status }, depois: { status, upload: 'concluido' } })
    return NextResponse.json({ status }, { status: 202, headers: NO_STORE })
  } catch (e) {
    if (e instanceof vc.VideoApiError && e.status === 422) {
      await createAdminClient().from('video_aulas').update({ status: 'erro', erro: e.message.slice(0, 400), atualizado_em: new Date().toISOString() }).eq('id', r.aula.id).eq('tenant_id', g.ctx.tenantId)
    }
    return respostaErroAdmin(e)
  }
}
