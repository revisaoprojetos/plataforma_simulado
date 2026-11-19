import { NextRequest } from 'next/server'
import { autenticarBeta, garantirNotebook, lerJson, limiteEscrita, resp400, resp429, respErroDb, respJson } from '@/lib/aluno/notebook-api'
import { ordemAoFinal } from '@/lib/aluno/notebook-server'
import { LIMITES, secaoCriarSchema } from '@/lib/aluno/notebook-tipos'

export const dynamic = 'force-dynamic'
const COLS = 'id, nome, cor, ordem, tipo'

// POST /api/aluno/notebook/secoes {nome, cor?, ordem?, client_op_id?} -> 201 {ok, secao}
export async function POST(request: NextRequest) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  if (!limiteEscrita(a.estudanteId)) return resp429()
  const j = await lerJson(request)
  if (!j.ok) return j.resposta
  const p = secaoCriarSchema.safeParse(j.corpo)
  if (!p.success) return resp400('Dados inválidos.', { erros: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })
  const b = p.data

  const nb = await garantirNotebook(a.svc, a.tenantId, a.estudanteId)
  if ('error' in nb) return respErroDb(nb.error, 'secoes.notebook')

  // idempotência: client_op_id gravado em origem_id (origem_tipo='client_op')
  if (b.client_op_id) {
    const ex = await a.svc.from('simulado_aluno_notebook_secoes').select(COLS).eq('notebook_id', nb.notebook.id)
      .eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).eq('origem_tipo', 'client_op').eq('origem_id', b.client_op_id).maybeSingle()
    if (ex.error) return respErroDb(ex.error, 'secoes.idem')
    if (ex.data) return respJson({ secao: { ...ex.data, qtd_paginas: 0 } })
  }
  const { count, error: eC } = await a.svc.from('simulado_aluno_notebook_secoes').select('id', { count: 'exact', head: true })
    .eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).eq('notebook_id', nb.notebook.id).is('deletado_em', null).in('tipo', ['manual', 'importada'])
  if (eC) return respErroDb(eC, 'secoes.count')
  if ((count ?? 0) >= LIMITES.secoesManuaisMax) return resp400(`Limite de ${LIMITES.secoesManuaisMax} seções atingido.`)

  let ordem = b.ordem
  if (ordem === undefined) {
    const { data, error } = await a.svc.from('simulado_aluno_notebook_secoes').select('ordem')
      .eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).eq('notebook_id', nb.notebook.id).is('deletado_em', null).in('tipo', ['manual', 'importada'])
      .order('ordem', { ascending: false }).limit(1)
    if (error) return respErroDb(error, 'secoes.ordem')
    ordem = ordemAoFinal(data?.[0]?.ordem)
  }
  const ins = await a.svc.from('simulado_aluno_notebook_secoes').insert({
    tenant_id: a.tenantId, estudante_id: a.estudanteId, notebook_id: nb.notebook.id, nome: b.nome, cor: b.cor ?? null, ordem, tipo: 'manual',
    ...(b.client_op_id ? { origem_tipo: 'client_op', origem_id: b.client_op_id } : {}),
  }).select(COLS).single()
  if (ins.error) return respErroDb(ins.error, 'secoes.insert')
  return respJson({ secao: { ...ins.data, qtd_paginas: 0 } }, 201)
}
