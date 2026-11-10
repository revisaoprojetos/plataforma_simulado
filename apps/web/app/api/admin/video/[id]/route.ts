import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import * as vc from '@/lib/video/client'
import { statusAulaDoServico } from '@/lib/video/puro'
import { NO_STORE, aulaDoTenant, contextoAdmin, respostaErroAdmin } from '@/lib/video/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/admin/video/[id] -> { id, status, duracaoS, erro }. Consulta o serviço e persiste o status (video:view). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const g = await contextoAdmin('view')
  if (!g.ok) return g.res
  const r = await aulaDoTenant(g.ctx.tenantId, (await params).id)
  if ('res' in r) return r.res
  const aula = r.aula
  if (!aula.video_id || aula.status === 'pronta' || aula.status === 'rascunho') {
    return NextResponse.json({ id: aula.id, status: aula.status, duracaoS: aula.duracao_s, erro: aula.erro }, { headers: NO_STORE })
  }
  try {
    const v = await vc.statusVideo(g.ctx.slug, aula.video_id)
    const status = statusAulaDoServico(v.status)
    if (status !== aula.status || v.durationS !== aula.duracao_s || (v.error ?? null) !== aula.erro) {
      await createAdminClient().from('video_aulas').update({ status, duracao_s: v.durationS, erro: v.error ?? null, atualizado_em: new Date().toISOString() })
        .eq('id', aula.id).eq('tenant_id', g.ctx.tenantId)
    }
    return NextResponse.json({ id: aula.id, status, duracaoS: v.durationS, erro: v.error ?? null }, { headers: NO_STORE })
  } catch (e) { return respostaErroAdmin(e) }
}

/** DELETE /api/admin/video/[id] — remove vídeo+aula no serviço e marca a nossa aula como excluída (video:manage). */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const g = await contextoAdmin('manage')
  if (!g.ok) return g.res
  const r = await aulaDoTenant(g.ctx.tenantId, (await params).id)
  if ('res' in r) return r.res
  const aula = r.aula
  try {
    if (aula.video_id) {
      try { await vc.removerVideo(g.ctx.slug, aula.video_id) }
      catch (e) { if (!(e instanceof vc.VideoApiError && e.status === 404)) throw e }
    }
    try { await vc.removerAulaServico(g.ctx.slug, aula.lesson_id) }
    catch (e) { if (!(e instanceof vc.VideoApiError && e.status === 404)) throw e }
    await createAdminClient().from('video_aulas').update({ status: 'excluida', deletado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
      .eq('id', aula.id).eq('tenant_id', g.ctx.tenantId)
    await registrarAudit({ operacao: 'DELETE', entidade: 'video_aulas', entidadeId: aula.id, tenantId: g.ctx.tenantId, atorId: g.ctx.userId, antes: { titulo: aula.titulo, status: aula.status } })
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (e) { return respostaErroAdmin(e) }
}
