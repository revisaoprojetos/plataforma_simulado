import { NextRequest } from 'next/server'
import { autenticarBeta, excedeTetoPaginas, limiteEscrita, resp404, resp429, respErroDb, respJson, respTetoPaginas } from '@/lib/aluno/notebook-api'
import { limiteLixeiraISO, normalizarNiveisSecao, ordemAoFinal } from '@/lib/aluno/notebook-server'
import { uuidSchema } from '@/lib/aluno/notebook-tipos'

export const dynamic = 'force-dynamic'

// POST /api/aluno/notebook/paginas/:id/restaurar — tira da lixeira (se a seção ainda existe E a exclusão tem <= 60 dias).
// Renormaliza: se a ordem original colidir com uma página viva vai para o fim da seção; os níveis da seção são corrigidos (nivel[i] <= nivel[i-1]+1).
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return resp404()
  if (!limiteEscrita(a.estudanteId)) return resp429()
  const cur = await a.svc.from('simulado_aluno_notebook_paginas').select('id, secao_id, notebook_id, ordem').eq('id', id).eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).not('deletado_em', 'is', null).gte('deletado_em', limiteLixeiraISO()).maybeSingle()
  if (cur.error) return respErroDb(cur.error, 'restaurar.get')
  if (!cur.data) return resp404()
  const sec = await a.svc.from('simulado_aluno_notebook_secoes').select('id').eq('id', cur.data.secao_id).eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).is('deletado_em', null).maybeSingle()
  if (sec.error) return respErroDb(sec.error, 'restaurar.secao')
  if (!sec.data) return resp404()
  const teto = await excedeTetoPaginas(a.svc, a.tenantId, a.estudanteId, cur.data.notebook_id)
  if ('error' in teto) return respErroDb(teto.error, 'restaurar.teto')
  if (teto.excede) return respTetoPaginas()
  const base = () => a.svc.from('simulado_aluno_notebook_paginas').select('ordem').eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).eq('secao_id', cur.data.secao_id).is('deletado_em', null)
  const colide = await base().eq('ordem', cur.data.ordem).limit(1)
  if (colide.error) return respErroDb(colide.error, 'restaurar.colisao')
  const upd: Record<string, unknown> = { deletado_em: null }
  if (colide.data?.length) {
    const mx = await base().order('ordem', { ascending: false }).limit(1)
    if (mx.error) return respErroDb(mx.error, 'restaurar.ordem')
    upd.ordem = ordemAoFinal(mx.data?.[0]?.ordem)
  }
  const u = await a.svc.from('simulado_aluno_notebook_paginas').update(upd).eq('id', id).eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).not('deletado_em', 'is', null)
  if (u.error) return respErroDb(u.error, 'restaurar')
  const n = await normalizarNiveisSecao(a.svc, a, cur.data.secao_id)
  if (n) console.error('[notebook] restaurar normalizar', (n.error as { code?: string } | null)?.code)
  return respJson({ id })
}
