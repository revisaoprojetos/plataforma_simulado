import { NextRequest, NextResponse } from 'next/server'
import { registrarAudit } from '@/lib/audit'
import { criarItemSchema, listarCursosSchema } from '@/lib/video/catalogo-tipos'
import { arvoreCurso, aulasProntasDoCurso, listarCursosCatalogo } from '@/lib/video/catalogo'
import * as vc from '@/lib/video/client'
import { NO_STORE, contextoAdmin, idValido, lerJson, respostaErroAdmin } from '@/lib/video/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/admin/video                      -> { rows: Curso[], total }   (paginado no serviço; ?page&pageSize)
 * GET /api/admin/video?cursoId=X            -> { curso, modulos[aulas[]] } (estado do vídeo de cada aula)
 * GET /api/admin/video?cursoId=X&prontas=1  -> { aulas[] } só aulas com vídeo pronto (seletor)
 * (video:view). Dados lidos DIRETO do serviço de vídeo.
 */
export async function GET(req: NextRequest) {
  const g = await contextoAdmin('view')
  if (!g.ok) return g.res
  const sp = req.nextUrl.searchParams
  try {
    const cursoId = sp.get('cursoId')
    if (cursoId) {
      const bad = idValido(cursoId)
      if (bad) return bad
      if (sp.get('prontas') === '1') return NextResponse.json({ aulas: await aulasProntasDoCurso(g.ctx.slug, cursoId) }, { headers: NO_STORE })
      return NextResponse.json(await arvoreCurso(g.ctx.slug, cursoId), { headers: NO_STORE })
    }
    const q = listarCursosSchema.safeParse(Object.fromEntries(sp.entries()))
    if (!q.success) return NextResponse.json({ message: 'Parâmetros inválidos.' }, { status: 400 })
    return NextResponse.json(await listarCursosCatalogo(g.ctx.slug, q.data.page, q.data.pageSize), { headers: NO_STORE })
  } catch (e) { return respostaErroAdmin(e) }
}

/** POST /api/admin/video { tipo:'curso'|'modulo'|'aula', titulo, cursoId?|moduloId? } -> { id } (video:manage) */
export async function POST(req: NextRequest) {
  const g = await contextoAdmin('manage')
  if (!g.ok) return g.res
  const b = await lerJson(req, criarItemSchema)
  if (!b.ok) return b.res
  const d = b.data
  try {
    const r = d.tipo === 'curso' ? await vc.criarCurso(g.ctx.slug, d.titulo)
      : d.tipo === 'modulo' ? await vc.criarModulo(g.ctx.slug, d.cursoId, d.titulo)
      : await vc.criarAula(g.ctx.slug, d.moduloId, d.titulo)
    await registrarAudit({ operacao: 'INSERT', entidade: `video_${d.tipo}`, entidadeId: r.id, tenantId: g.ctx.tenantId, atorId: g.ctx.userId, depois: { titulo: d.titulo } })
    return NextResponse.json({ id: r.id }, { status: 201, headers: NO_STORE })
  } catch (e) { return respostaErroAdmin(e) }
}
