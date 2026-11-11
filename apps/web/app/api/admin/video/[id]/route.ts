import { NextRequest, NextResponse } from 'next/server'
import { registrarAudit } from '@/lib/audit'
import { renomearSchema, tipoItemSchema } from '@/lib/video/catalogo-tipos'
import { esquecerVideo, estadoAula } from '@/lib/video/catalogo'
import * as vc from '@/lib/video/client'
import { NO_STORE, contextoAdmin, idValido, lerJson, respostaErroAdmin } from '@/lib/video/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/admin/video/[lessonId] -> estado da aula/vídeo (polling leve) (video:view). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const g = await contextoAdmin('view')
  if (!g.ok) return g.res
  const id = (await params).id
  const bad = idValido(id); if (bad) return bad
  try { return NextResponse.json(await estadoAula(g.ctx.slug, id), { headers: NO_STORE }) } catch (e) { return respostaErroAdmin(e) }
}

/** PATCH /api/admin/video/[id] { tipo, titulo } — renomeia curso/módulo/aula (video:manage). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const g = await contextoAdmin('manage')
  if (!g.ok) return g.res
  const id = (await params).id
  const bad = idValido(id); if (bad) return bad
  const b = await lerJson(req, renomearSchema)
  if (!b.ok) return b.res
  const { tipo, titulo } = b.data
  try {
    if (tipo === 'curso') await vc.renomearCurso(g.ctx.slug, id, titulo)
    else if (tipo === 'modulo') await vc.renomearModulo(g.ctx.slug, id, titulo)
    else await vc.renomearAula(g.ctx.slug, id, titulo)
    await registrarAudit({ operacao: 'UPDATE', entidade: `video_${tipo}`, entidadeId: id, tenantId: g.ctx.tenantId, atorId: g.ctx.userId, depois: { titulo } })
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (e) { return respostaErroAdmin(e) }
}

/**
 * DELETE /api/admin/video/[id]?tipo=curso|modulo|aula (default aula) — remove no serviço (o serviço apaga os vídeos
 * dos filhos). Para aula, remove o vídeo antes (404 ignorado) (video:manage).
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const g = await contextoAdmin('manage')
  if (!g.ok) return g.res
  const id = (await params).id
  const bad = idValido(id); if (bad) return bad
  const t = tipoItemSchema.safeParse(req.nextUrl.searchParams.get('tipo') ?? 'aula')
  if (!t.success) return NextResponse.json({ message: 'tipo inválido.' }, { status: 400 })
  const tipo = t.data
  try {
    if (tipo === 'curso') await vc.removerCurso(g.ctx.slug, id)
    else if (tipo === 'modulo') await vc.removerModulo(g.ctx.slug, id)
    else {
      const aula = await vc.obterAula(g.ctx.slug, id).catch((e) => { if (e instanceof vc.VideoApiError && e.status === 404) return null; throw e })
      if (aula?.videoId) {
        try { await vc.removerVideo(g.ctx.slug, aula.videoId) } catch (e) { if (!(e instanceof vc.VideoApiError && e.status === 404)) throw e }
        esquecerVideo(g.ctx.slug, aula.videoId)
      }
      try { await vc.removerAulaServico(g.ctx.slug, id) } catch (e) { if (!(e instanceof vc.VideoApiError && e.status === 404)) throw e }
    }
    await registrarAudit({ operacao: 'DELETE', entidade: `video_${tipo}`, entidadeId: id, tenantId: g.ctx.tenantId, atorId: g.ctx.userId })
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (e) { return respostaErroAdmin(e) }
}
