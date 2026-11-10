import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import * as vc from '@/lib/video/client'
import { NO_STORE, aulaDoTenant, contextoAdmin, respostaErroAdmin } from '@/lib/video/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** POST /api/admin/video/[id]/reprocess — refaz o HLS do zero (video:manage). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await contextoAdmin('manage')
  if (!g.ok) return g.res
  const r = await aulaDoTenant(g.ctx.tenantId, (await params).id)
  if ('res' in r) return r.res
  if (!r.aula.video_id) return NextResponse.json({ message: 'Este vídeo ainda não tem arquivo enviado.' }, { status: 409 })
  try {
    await vc.reprocessarVideo(g.ctx.slug, r.aula.video_id)
    await createAdminClient().from('video_aulas').update({ status: 'processando', erro: null, atualizado_em: new Date().toISOString() }).eq('id', r.aula.id).eq('tenant_id', g.ctx.tenantId)
    await registrarAudit({ operacao: 'UPDATE', entidade: 'video_aulas', entidadeId: r.aula.id, tenantId: g.ctx.tenantId, atorId: g.ctx.userId, antes: { status: r.aula.status }, depois: { status: 'processando', acao: 'reprocessar' } })
    return NextResponse.json({ status: 'processando' }, { status: 202, headers: NO_STORE })
  } catch (e) { return respostaErroAdmin(e) }
}
