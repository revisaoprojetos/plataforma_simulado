import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { TIPOS_VIDEO, criarVideoSchema, listarAdminSchema, type LinhaAulaAdmin } from '@/lib/video/tipos'
import { COLS_AULA, garantirCursoAcervo, type AulaRow } from '@/lib/video/dados'
import * as vc from '@/lib/video/client'
import { escaparBusca } from '@/lib/video/puro'
import { NO_STORE, contextoAdmin, lerJson, respostaErroAdmin } from '@/lib/video/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const paraLinha = (r: AulaRow): LinhaAulaAdmin => ({
  id: r.id, titulo: r.titulo, status: r.status as LinhaAulaAdmin['status'], duracaoS: r.duracao_s, pastaId: r.pasta_id,
  cursoId: r.curso_id, ordem: r.ordem, erro: r.erro, criadoEm: r.criado_em, atualizadoEm: r.atualizado_em,
})

/** GET /api/admin/video?search&status&page&pageSize&sort&dir -> { rows, total }  (video:view) */
export async function GET(req: NextRequest) {
  const g = await contextoAdmin('view')
  if (!g.ok) return g.res
  const q = listarAdminSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()))
  if (!q.success) return NextResponse.json({ message: 'Parâmetros inválidos.' }, { status: 400 })
  const { search, status, page, pageSize, sort, dir } = q.data

  const svc = createAdminClient()
  let qb = svc.from('video_aulas').select(COLS_AULA, { count: 'exact' }).eq('tenant_id', g.ctx.tenantId).is('deletado_em', null)
  qb = status ? qb.eq('status', status) : qb.neq('status', 'excluida')
  if (search) qb = qb.ilike('titulo', `%${escaparBusca(search)}%`)
  const from = (page - 1) * pageSize
  const { data, count, error } = await qb
    .order(sort, { ascending: dir === 'asc' })
    .order('id', { ascending: true }) // desempate por coluna ÚNICA (paginação estável)
    .range(from, from + pageSize - 1)
  if (error) return NextResponse.json({ message: 'Falha ao listar.' }, { status: 500 })
  return NextResponse.json({ rows: ((data ?? []) as AulaRow[]).map(paraLinha), total: count ?? 0 }, { headers: NO_STORE })
}

/** POST /api/admin/video { titulo, pastaId?, [filename,size,contentType] } -> { id, uploadId, partSize }  (video:manage) */
export async function POST(req: NextRequest) {
  const g = await contextoAdmin('manage')
  if (!g.ok) return g.res
  const b = await lerJson(req, criarVideoSchema)
  if (!b.ok) return b.res
  const { titulo, pastaId, filename, size, contentType } = b.data
  if ((filename || size || contentType) && !(filename && size && contentType)) {
    return NextResponse.json({ message: 'Informe filename, size e contentType juntos.' }, { status: 400 })
  }
  if (contentType && !(TIPOS_VIDEO as readonly string[]).includes(contentType)) {
    return NextResponse.json({ message: 'Tipo de arquivo não suportado.' }, { status: 400 })
  }

  const svc = createAdminClient()
  let lessonId: string | null = null
  try {
    const curso = await garantirCursoAcervo(g.ctx.tenantId, g.ctx.slug, svc)
    const lesson = await vc.criarAula(g.ctx.slug, curso.moduleId, titulo)
    lessonId = lesson.id

    const { data: nova, error } = await svc.from('video_aulas').insert({
      tenant_id: g.ctx.tenantId, curso_id: curso.id, titulo, pasta_id: pastaId ?? null, lesson_id: lesson.id,
      status: 'rascunho', criado_por: g.ctx.userId,
    }).select(COLS_AULA).single()
    if (error || !nova) throw new Error(error?.message ?? 'insert falhou')

    let upload: vc.UploadRes | null = null
    if (filename && size && contentType) {
      upload = await vc.criarUpload(g.ctx.slug, { lessonId: lesson.id, filename, size, contentType })
      await svc.from('video_aulas').update({ video_id: upload.videoId, status: 'enviando', atualizado_em: new Date().toISOString() }).eq('id', nova.id).eq('tenant_id', g.ctx.tenantId)
    }
    await registrarAudit({ operacao: 'INSERT', entidade: 'video_aulas', entidadeId: nova.id, tenantId: g.ctx.tenantId, atorId: g.ctx.userId, depois: { titulo, pastaId: pastaId ?? null, upload: !!upload } })
    return NextResponse.json({
      id: nova.id, uploadId: upload?.uploadId ?? null, partSize: upload?.partSize ?? null,
      // extras (opcionais p/ o front)
      partCount: upload?.partCount ?? null, urls: upload?.parts ?? [],
    }, { status: 201, headers: NO_STORE })
  } catch (e) {
    if (lessonId) await vc.removerAulaServico(g.ctx.slug, lessonId).catch(() => {}) // desfaz a aula órfã no serviço
    return respostaErroAdmin(e)
  }
}
