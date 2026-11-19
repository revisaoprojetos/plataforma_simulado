import { NextRequest, NextResponse } from 'next/server'
import { autenticarBeta, lerJson, limiteEscrita, resp400, resp404, resp429, respErroDb, respJson } from '@/lib/aluno/notebook-api'
import { tagEditarSchema } from '@/lib/aluno/notebook-tags'
import { uuidSchema } from '@/lib/aluno/notebook-tipos'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

// PATCH /api/aluno/notebook/tags/:id {nome?, cor?} -> {ok, tag} | 404 | 409 tag_duplicada
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return resp404()
  if (!limiteEscrita(a.estudanteId)) return resp429()
  const j = await lerJson(request)
  if (!j.ok) return j.resposta
  const p = tagEditarSchema.safeParse(j.corpo)
  if (!p.success) return resp400('Dados inválidos.', { erros: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })
  const { data, error } = await a.svc.from('simulado_aluno_notebook_tags').update(p.data)
    .eq('id', id).eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).select('id, nome, cor').maybeSingle()
  if (error) {
    if ((error as { code?: string }).code === '23505') return NextResponse.json({ ok: false, code: 'tag_duplicada', message: 'Já existe uma tag com esse nome.' }, { status: 409 })
    return respErroDb(error, 'tags.patch')
  }
  if (!data) return resp404()
  return respJson({ tag: data })
}

// DELETE /api/aluno/notebook/tags/:id -> {ok, id}  (vínculos removidos por cascade; as páginas permanecem)
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return resp404()
  if (!limiteEscrita(a.estudanteId)) return resp429()
  const { data, error } = await a.svc.from('simulado_aluno_notebook_tags').delete()
    .eq('id', id).eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).select('id')
  if (error) return respErroDb(error, 'tags.del')
  if (!data || data.length === 0) return resp404()
  return respJson({ id })
}
