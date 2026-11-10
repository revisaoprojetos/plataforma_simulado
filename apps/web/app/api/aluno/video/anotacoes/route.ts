import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { anotacaoCriarSchema, anotacaoEditarSchema, anotacaoListarSchema } from '@/lib/video/tipos'
import { carregarAula } from '@/lib/video/dados'
import { criarNota, editarNota, listarNotas, removerNota, tokenDoAluno } from '@/lib/video/client'
import { contextoAluno, podeAssistir, respostaDeErro } from '@/lib/video/aluno'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Anotações com tempo do aluno (guardadas na video-api, escopo do próprio aluno).
 *   GET    ?aulaId=<uuid>                   -> { notas: [{id, atS, text}] }
 *   POST   { aulaId, atS, text }            -> { nota }
 *   PATCH  { id, atS?, text? }              -> { nota }
 *   DELETE ?id=<uuid>                       -> { ok: true }
 * Nosso gate (aula pronta + acesso) vale em GET/POST; PATCH/DELETE dependem do dono da nota (o serviço valida).
 */
const NO_STORE = { 'Cache-Control': 'no-store' }
const uuid = z.string().uuid()

async function aulaAutorizada(ctx: { sessao: any }, aulaId: string) {
  const aula = await carregarAula(ctx.sessao.tenantId, aulaId, createAdminClient())
  if (!aula) return { erro: NextResponse.json({ code: 'nao_encontrado', message: 'Aula não encontrada.' }, { status: 404 }) }
  if (!(await podeAssistir(ctx.sessao, aula))) return { erro: NextResponse.json({ code: 'sem_acesso', message: 'Sem acesso a esta aula.' }, { status: 403 }) }
  return { aula }
}

export async function GET(req: NextRequest) {
  const ctx = await contextoAluno()
  if (!ctx.ok) return ctx.res
  const q = anotacaoListarSchema.safeParse({ aulaId: req.nextUrl.searchParams.get('aulaId') })
  if (!q.success) return NextResponse.json({ code: 'requisicao_invalida', message: 'aulaId inválido.' }, { status: 400 })
  const a = await aulaAutorizada(ctx, q.data.aulaId)
  if (a.erro) return a.erro
  try {
    const token = await tokenDoAluno(ctx.slug, ctx.sessao.estudanteId)
    const notas = await listarNotas(token, a.aula!.lesson_id)
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
  const a = await aulaAutorizada(ctx, b.data.aulaId)
  if (a.erro) return a.erro
  try {
    const token = await tokenDoAluno(ctx.slug, ctx.sessao.estudanteId)
    const n = await criarNota(token, a.aula!.lesson_id, { atS: b.data.atS, text: b.data.text })
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
