import { NextRequest } from 'next/server'
import { autenticarBeta, limiteEscrita, resp400, resp404, resp429, respErroDb, respJson } from '@/lib/aluno/notebook-api'
import { ocorrenciasBusca, rpcAusente, trechoBusca } from '@/lib/aluno/notebook-server'
import { buscaSchema } from '@/lib/aluno/notebook-tipos'

export const dynamic = 'force-dynamic'

// GET /api/aluno/notebook/busca?q=&escopo=pagina|secao|caderno&pagina_id=&secao_id=&offset=&limit=
//  -> {ok, escopo, total, itens:[{id,secao_id,titulo,trecho[,ocorrencias:string[]]}]}
//  escopo 'caderno' (padrão) = todo o caderno; 'secao' exige secao_id; 'pagina' exige pagina_id e devolve TODAS as ocorrências
//  (trechos, até 30) dentro da página. Retrocompatível: sem `escopo`, `secao_id` continua restringindo à seção.
export async function GET(request: NextRequest) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  if (!limiteEscrita(`busca:${a.estudanteId}`, 5, 1000)) return resp429() // busca é cara (FTS + texto de até 200 KB por página)
  const sp = request.nextUrl.searchParams
  const p = buscaSchema.safeParse({
    q: sp.get('q') ?? '', secao_id: sp.get('secao_id') ?? undefined, pagina_id: sp.get('pagina_id') ?? undefined,
    escopo: sp.get('escopo') ?? undefined, offset: sp.get('offset') ?? undefined, limit: sp.get('limit') ?? undefined,
  })
  if (!p.success) return resp400('Busca inválida (2 a 100 caracteres; escopo pagina|secao|caderno).')
  const { q, secao_id, pagina_id, offset, limit } = p.data
  const escopo = p.data.escopo ?? (secao_id ? 'secao' : 'caderno')
  if (escopo === 'pagina' && !pagina_id) return resp400('escopo=pagina exige pagina_id.')
  if (escopo === 'secao' && !secao_id) return resp400('escopo=secao exige secao_id.')

  if (escopo === 'pagina') {
    const r = await a.svc.from('simulado_aluno_notebook_paginas').select('id, secao_id, titulo, texto_busca')
      .eq('id', pagina_id).eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).is('deletado_em', null).maybeSingle()
    if (r.error) return respErroDb(r.error, 'busca.pagina')
    if (!r.data) return resp404()
    const ocorrencias = ocorrenciasBusca(r.data.texto_busca ?? '', q)
    const noTitulo = q.toLowerCase().split(/\s+/).some((t: string) => t.length >= 2 && String(r.data.titulo ?? '').toLowerCase().includes(t))
    const itens = ocorrencias.length || noTitulo
      ? [{ id: r.data.id, secao_id: r.data.secao_id, titulo: r.data.titulo, trecho: ocorrencias[0] ?? '', ocorrencias }]
      : []
    return respJson({ escopo, total: ocorrencias.length, itens })
  }

  // Preferência: RPC (migração 20261129020000) — o trecho é calculado NO BANCO (nunca trafega o texto_busca inteiro: 200 KB × 30).
  const rpc = await a.svc.rpc('notebook_buscar', { p_tenant: a.tenantId, p_estudante: a.estudanteId, p_q: q, p_secao: escopo === 'secao' ? secao_id : null, p_offset: offset, p_limit: limit })
  if (!rpc.error) {
    const linhas: any[] = rpc.data ?? []
    return respJson({ escopo, total: linhas.length ? Number(linhas[0].total) : 0, itens: linhas.map((r) => ({ id: r.id, secao_id: r.secao_id, titulo: r.titulo, trecho: r.trecho ?? '' })) })
  }
  if (!rpcAusente(rpc.error)) return respErroDb(rpc.error, 'busca.rpc')

  // Fallback (RPC ainda não aplicada): select do texto limitado a 10 itens por requisição para conter o tráfego.
  const limiteFallback = Math.min(limit, 10)
  let query = a.svc.from('simulado_aluno_notebook_paginas').select('id, secao_id, titulo, texto_busca', { count: 'exact' })
    .eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).is('deletado_em', null).eq('arquivada', false)
    .textSearch('busca', q, { type: 'websearch', config: 'portuguese' })
  if (escopo === 'secao') query = query.eq('secao_id', secao_id)
  const { data, count, error } = await query.order('atualizado_em', { ascending: false }).order('id', { ascending: true }).range(offset, offset + limiteFallback - 1)
  if (error) return respErroDb(error, 'busca')
  const itens = (data ?? []).map((r: any) => ({ id: r.id, secao_id: r.secao_id, titulo: r.titulo, trecho: trechoBusca(r.texto_busca ?? '', q) }))
  return respJson({ escopo, total: count ?? 0, itens })
}
