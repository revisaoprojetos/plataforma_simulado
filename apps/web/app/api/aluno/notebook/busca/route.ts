import { NextRequest } from 'next/server'
import { autenticarBeta, resp400, respErroDb, respJson } from '@/lib/aluno/notebook-api'
import { trechoBusca } from '@/lib/aluno/notebook-server'
import { buscaSchema } from '@/lib/aluno/notebook-tipos'

export const dynamic = 'force-dynamic'

// GET /api/aluno/notebook/busca?q=&secao_id=&offset=&limit=  -> {ok, total, itens:[{id,secao_id,titulo,trecho}]}
export async function GET(request: NextRequest) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const sp = request.nextUrl.searchParams
  const p = buscaSchema.safeParse({
    q: sp.get('q') ?? '', secao_id: sp.get('secao_id') ?? undefined, offset: sp.get('offset') ?? undefined, limit: sp.get('limit') ?? undefined,
  })
  if (!p.success) return resp400('Busca inválida (2 a 100 caracteres).')
  const { q, secao_id, offset, limit } = p.data

  let query = a.svc.from('simulado_aluno_notebook_paginas').select('id, secao_id, titulo, texto_busca', { count: 'exact' })
    .eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).is('deletado_em', null).eq('arquivada', false)
    .textSearch('busca', q, { type: 'websearch', config: 'portuguese' })
  if (secao_id) query = query.eq('secao_id', secao_id)
  const { data, count, error } = await query.order('atualizado_em', { ascending: false }).order('id', { ascending: true }).range(offset, offset + limit - 1)
  if (error) return respErroDb(error, 'busca')
  const itens = (data ?? []).map((r: any) => ({ id: r.id, secao_id: r.secao_id, titulo: r.titulo, trecho: trechoBusca(r.texto_busca ?? '', q) }))
  return respJson({ total: count ?? 0, itens })
}
