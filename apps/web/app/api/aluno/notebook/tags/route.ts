import { NextRequest, NextResponse } from 'next/server'
import { autenticarBeta, garantirNotebook, lerJson, limiteEscrita, resp400, resp429, respErroDb, respJson } from '@/lib/aluno/notebook-api'
import { LIMITES_TAGS, tagCriarSchema } from '@/lib/aluno/notebook-tags'

export const dynamic = 'force-dynamic'

// GET /api/aluno/notebook/tags -> {ok, tags:[{id,nome,cor}]}  (até 100 por notebook; ordem alfabética)
export async function GET() {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const { data, error } = await a.svc.from('simulado_aluno_notebook_tags').select('id, nome, cor')
    .eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId)
    .order('nome', { ascending: true }).order('id', { ascending: true }).limit(LIMITES_TAGS.tagsPorNotebook)
  if (error) return respErroDb(error, 'tags.get')
  return respJson({ tags: data ?? [] })
}

// POST /api/aluno/notebook/tags {nome, cor?} -> 201 {ok, tag} | 409 tag_duplicada | 422 limite_tags
export async function POST(request: NextRequest) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  if (!limiteEscrita(a.estudanteId)) return resp429()
  const j = await lerJson(request)
  if (!j.ok) return j.resposta
  const p = tagCriarSchema.safeParse(j.corpo)
  if (!p.success) return resp400('Dados inválidos.', { erros: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })

  const nb = await garantirNotebook(a.svc, a.tenantId, a.estudanteId)
  if ('error' in nb) return respErroDb(nb.error, 'tags.post.nb')
  const { count, error: eC } = await a.svc.from('simulado_aluno_notebook_tags').select('id', { count: 'exact', head: true })
    .eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).eq('notebook_id', nb.notebook.id)
  if (eC) return respErroDb(eC, 'tags.post.count')
  if ((count ?? 0) >= LIMITES_TAGS.tagsPorNotebook) {
    return NextResponse.json({ ok: false, code: 'limite_tags', message: `Limite de ${LIMITES_TAGS.tagsPorNotebook} tags atingido.` }, { status: 422 })
  }
  const { data, error } = await a.svc.from('simulado_aluno_notebook_tags')
    .insert({ tenant_id: a.tenantId, estudante_id: a.estudanteId, notebook_id: nb.notebook.id, nome: p.data.nome, cor: p.data.cor ?? 'primaria' })
    .select('id, nome, cor').single()
  if (error) {
    if ((error as { code?: string }).code === '23505') return NextResponse.json({ ok: false, code: 'tag_duplicada', message: 'Já existe uma tag com esse nome.' }, { status: 409 })
    return respErroDb(error, 'tags.post')
  }
  return respJson({ tag: data }, 201)
}
