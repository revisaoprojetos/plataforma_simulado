import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { anotacaoCriarSchema, anotacaoEditarSchema, anotacaoListarSchema } from '@/lib/video/tipos'
import { criarNota, editarNota, listarNotas, removerNota, tokenDoAluno } from '@/lib/video/client'
import { contextoAluno, garantirMatricula, podeAssistir, respostaDeErro } from '@/lib/video/aluno'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Anotações com tempo do aluno (guardadas na video-api, escopo do próprio aluno).
 *   GET    ?courseId=<uuid>&lessonId=<uuid>                   -> { notas: [{id, atS, text}] }
 *   POST   { courseId, lessonId, atS, text }            -> { nota }
 *   PATCH  { id, atS?, text? }              -> { nota }
 *   DELETE ?id=<uuid>                       -> { ok: true }
 * Nosso gate (acesso na plataforma + matrícula sob demanda) vale em GET/POST; PATCH/DELETE dependem do dono da nota (o serviço valida).
 */
const NO_STORE = { 'Cache-Control': 'no-store' }
const uuid = z.string().uuid()

async function aulaAutorizada(ctx: { sessao: any; slug: string }, courseId: string, lessonId: string) {
  if (!(await podeAssistir(ctx.sessao, courseId, lessonId))) return { erro: NextResponse.json({ code: 'sem_acesso', message: 'Sem acesso a esta aula.' }, { status: 403 }) }
  return {}
}

export async function GET(req: NextRequest) {
  const ctx = await contextoAluno()
  if (!ctx.ok) return ctx.res
  const q = anotacaoListarSchema.safeParse({ courseId: req.nextUrl.searchParams.get('courseId'), lessonId: req.nextUrl.searchParams.get('lessonId') })
  if (!q.success) return NextResponse.json({ code: 'requisicao_invalida', message: 'courseId/lessonId inválidos.' }, { status: 400 })
  const a = await aulaAutorizada(ctx, q.data.courseId, q.data.lessonId)
  if (a.erro) return a.erro
  try {
    await garantirMatricula(ctx.slug, ctx.sessao, q.data.courseId)
    const token = await tokenDoAluno(ctx.slug, ctx.sessao.estudanteId)
    const notas = await listarNotas(token, q.data.lessonId)
    return NextResponse.json({ notas: (notas ?? []).map((n) => ({ id: n.id, atS: n.atS, text: n.text })) }, { headers: NO_STORE })
  } catch (e) { return respostaDeErro(e) }
}

export async function POST(req: NextRequest) {
  const ctx = await contextoAluno()
  if (!ctx.ok) return ctx.res
  if (ctx.sessao.impersonation && ctx.sessao.impersonation.actionLevel !== 'read_and_act') {
    return NextResponse.json({ code: 'visualizacao_somente_leitura', message: 'Indisponível na visualização somente leitura.' }, { status: 403 })
  }
  const b = anotacaoCriarSchema.safeParse(await req.json().catch(() => null))
  if (!b.success) return NextResponse.json({ code: 'requisicao_invalida', message: 'Dados inválidos.' }, { status: 400 })
  const a = await aulaAutorizada(ctx, b.data.courseId, b.data.lessonId)
  if (a.erro) return a.erro
  try {
    await garantirMatricula(ctx.slug, ctx.sessao, b.data.courseId)
    const token = await tokenDoAluno(ctx.slug, ctx.sessao.estudanteId)
    const n = await criarNota(token, b.data.lessonId, { atS: b.data.atS, text: b.data.text })
    return NextResponse.json({ nota: { id: n.id, atS: n.atS, text: n.text } }, { status: 201, headers: NO_STORE })
  } catch (e) { return respostaDeErro(e) }
}

export async function PATCH(req: NextRequest) {
  const ctx = await contextoAluno()
  if (!ctx.ok) return ctx.res
  if (ctx.sessao.impersonation && ctx.sessao.impersonation.actionLevel !== 'read_and_act') {
    return NextResponse.json({ code: 'visualizacao_somente_leitura', message: 'Indisponível na visualização somente leitura.' }, { status: 403 })
  }
  const b = anotacaoEditarSchema.safeParse(await req.json().catch(() => null))
  if (!b.success) return NextResponse.json({ code: 'requisicao_invalida', message: 'Dados inválidos.' }, { status: 400 })
  try {
    const token = await tokenDoAluno(ctx.slug, ctx.sessao.estudanteId)
    const n = await editarNota(token, b.data.id, { atS: b.data.atS, text: b.data.text })
    return NextResponse.json({ nota: { id: n.id, atS: n.atS, text: n.text } }, { headers: NO_STORE })
  } catch (e) { return respostaDeErro(e) }
}

export async function DELETE(req: NextRequest) {
  const ctx = await contextoAluno()
  if (!ctx.ok) return ctx.res
  if (ctx.sessao.impersonation && ctx.sessao.impersonation.actionLevel !== 'read_and_act') {
    return NextResponse.json({ code: 'visualizacao_somente_leitura', message: 'Indisponível na visualização somente leitura.' }, { status: 403 })
  }
  const id = uuid.safeParse(req.nextUrl.searchParams.get('id'))
  if (!id.success) return NextResponse.json({ code: 'requisicao_invalida', message: 'id inválido.' }, { status: 400 })
  try {
    const token = await tokenDoAluno(ctx.slug, ctx.sessao.estudanteId)
    await removerNota(token, id.data)
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (e) { return respostaDeErro(e) }
}
