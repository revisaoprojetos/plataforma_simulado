import { NextRequest, NextResponse } from 'next/server'
import { autenticarBeta, lerJson, limiteEscrita, resp400, resp404, resp429, respErroDb, respJson } from '@/lib/aluno/notebook-api'
import { agruparPorPagina, diffTags, emChunks, paginaTagsSchema, parsePaginaIds } from '@/lib/aluno/notebook-tags'

export const dynamic = 'force-dynamic'

// GET /api/aluno/notebook/paginas-tags?pagina_ids=a,b,c (até 80) -> {ok, por_pagina:{[pagina_id]: tag_id[]}}
export async function GET(request: NextRequest) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const ids = parsePaginaIds(request.nextUrl.searchParams.get('pagina_ids'))
  if (!ids) return resp400('pagina_ids inválido (1 a 80 UUIDs separados por vírgula).')
  const linhas: { pagina_id: string; tag_id: string }[] = []
  for (const ch of emChunks(ids, 80)) {
    const { data, error } = await a.svc.from('simulado_aluno_notebook_pagina_tags').select('pagina_id, tag_id')
      .eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).in('pagina_id', ch)
      .order('pagina_id', { ascending: true }).order('tag_id', { ascending: true }).limit(80 * 20)
    if (error) return respErroDb(error, 'paginas-tags.get')
    linhas.push(...(data ?? []))
  }
  return respJson({ por_pagina: agruparPorPagina(ids, linhas) })
}

// PUT /api/aluno/notebook/paginas-tags {pagina_id, tag_ids[]} (substitui o conjunto; até 20) -> {ok, pagina_id, tag_ids}
export async function PUT(request: NextRequest) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  if (!limiteEscrita(a.estudanteId)) return resp429()
  const j = await lerJson(request)
  if (!j.ok) return j.resposta
  const p = paginaTagsSchema.safeParse(j.corpo)
  if (!p.success) return resp400('Dados inválidos.', { erros: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })
  const { pagina_id, tag_ids } = p.data
  const esc = (q: any) => q.eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId)

  const pg = await esc(a.svc.from('simulado_aluno_notebook_paginas').select('id').eq('id', pagina_id)).is('deletado_em', null).maybeSingle()
  if (pg.error) return respErroDb(pg.error, 'paginas-tags.put.pagina')
  if (!pg.data) return resp404()

  if (tag_ids.length) {
    const { data, error } = await esc(a.svc.from('simulado_aluno_notebook_tags').select('id').in('id', tag_ids))
    if (error) return respErroDb(error, 'paginas-tags.put.tags')
    if ((data ?? []).length !== tag_ids.length) return NextResponse.json({ ok: false, code: 'tag_invalida', message: 'Tag inexistente.' }, { status: 422 })
  }
  const atual = await esc(a.svc.from('simulado_aluno_notebook_pagina_tags').select('tag_id').eq('pagina_id', pagina_id)).limit(100)
  if (atual.error) return respErroDb(atual.error, 'paginas-tags.put.atual')
  const { adicionar, remover } = diffTags((atual.data ?? []).map((r: any) => r.tag_id), tag_ids)

  for (const ch of emChunks(remover, 80)) {
    const d = await esc(a.svc.from('simulado_aluno_notebook_pagina_tags').delete().eq('pagina_id', pagina_id)).in('tag_id', ch)
    if (d.error) return respErroDb(d.error, 'paginas-tags.put.del')
  }
  if (adicionar.length) {
    const ins = await a.svc.from('simulado_aluno_notebook_pagina_tags')
      .upsert(adicionar.map((tag_id) => ({ pagina_id, tag_id, tenant_id: a.tenantId, estudante_id: a.estudanteId })), { onConflict: 'pagina_id,tag_id', ignoreDuplicates: true })
    if (ins.error) return respErroDb(ins.error, 'paginas-tags.put.ins')
  }
  return respJson({ pagina_id, tag_ids })
}
