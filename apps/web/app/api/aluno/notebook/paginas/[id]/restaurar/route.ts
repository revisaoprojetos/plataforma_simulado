import { NextRequest } from 'next/server'
import { autenticarBeta, limiteEscrita, resp404, resp429, respErroDb, respJson } from '@/lib/aluno/notebook-api'
import { uuidSchema } from '@/lib/aluno/notebook-tipos'

export const dynamic = 'force-dynamic'

// POST /api/aluno/notebook/paginas/:id/restaurar — tira da lixeira (se a seção ainda existe).
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return resp404()
  if (!limiteEscrita(a.estudanteId)) return resp429()
  const cur = await a.svc.from('simulado_aluno_notebook_paginas').select('id, secao_id').eq('id', id).eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).not('deletado_em', 'is', null).maybeSingle()
  if (cur.error) return respErroDb(cur.error, 'restaurar.get')
  if (!cur.data) return resp404()
  const sec = await a.svc.from('simulado_aluno_notebook_secoes').select('id').eq('id', cur.data.secao_id).eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).is('deletado_em', null).maybeSingle()
  if (sec.error) return respErroDb(sec.error, 'restaurar.secao')
  if (!sec.data) return resp404()
  const u = await a.svc.from('simulado_aluno_notebook_paginas').update({ deletado_em: null }).eq('id', id).eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId)
  if (u.error) return respErroDb(u.error, 'restaurar')
  return respJson({ id })
}
