import { NextRequest } from 'next/server'
import { autenticarBeta, resp400, respErroDb, respJson } from '@/lib/aluno/notebook-api'
import { trechoBusca } from '@/lib/aluno/notebook-server'
import { buscaTagsSchema } from '@/lib/aluno/notebook-tags'

export const dynamic = 'force-dynamic'
const VINCULO = 'simulado_aluno_notebook_pagina_tags'

// GET /api/aluno/notebook/busca-tags?tag_id=&q=&offset=&limit=  -> {ok, total, itens:[{id,secao_id,titulo,trecho}]}
// Páginas vivas com a tag; `q` (opcional, 2-100) restringe por texto (full-text, mesmo da /busca).
export async function GET(request: NextRequest) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const sp = request.nextUrl.searchParams
  const p = buscaTagsSchema.safeParse({
    tag_id: sp.get('tag_id') ?? '', q: sp.get('q') || undefined, offset: sp.get('offset') ?? undefined, limit: sp.get('limit') ?? undefined,
  })
  if (!p.success) return resp400('Busca inválida.')
  const { tag_id, q, offset, limit } = p.data

  let query = a.svc.from('simulado_aluno_notebook_paginas')
    .select(`id, secao_id, titulo, texto_busca, ${VINCULO}!inner(tag_id)`, { count: 'exact' })
    .eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).is('deletado_em', null).eq('arquivada', false)
    .eq(`${VINCULO}.tag_id`, tag_id)
  if (q) query = query.textSearch('busca', q, { type: 'websearch', config: 'portuguese' })
  const { data, count, error } = await query.order('atualizado_em', { ascending: false }).order('id', { ascending: true }).range(offset, offset + limit - 1)
  if (error) return respErroDb(error, 'busca-tags')
  const itens = (data ?? []).map((r: any) => ({ id: r.id, secao_id: r.secao_id, titulo: r.titulo, trecho: trechoBusca(r.texto_busca ?? '', q ?? '') }))
  return respJson({ total: count ?? 0, itens })
}
