import { NextRequest } from 'next/server'
import { autenticarBeta, limiteEscrita, resp400, resp429, respErroDb, respJson } from '@/lib/aluno/notebook-api'
import { montarLixeira } from '@/lib/aluno/notebook-server'
import { lixeiraSchema } from '@/lib/aluno/notebook-tipos'

export const dynamic = 'force-dynamic'

// GET /api/aluno/notebook/lixeira?offset=&limit= -> {ok, dias:60, total_paginas, total_secoes, paginas:[...], secoes:[...]}
// Itens apagados nos últimos 60 dias (mais recentes primeiro). offset/limit valem para CADA lista (.range()+count).
export async function GET(request: NextRequest) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  if (!limiteEscrita(`lixeira:${a.estudanteId}`, 5, 1000)) return resp429()
  const sp = request.nextUrl.searchParams
  const p = lixeiraSchema.safeParse({ offset: sp.get('offset') ?? undefined, limit: sp.get('limit') ?? undefined })
  if (!p.success) return resp400('offset/limit inválidos.')
  const r = await montarLixeira(a.svc, { tenantId: a.tenantId, estudanteId: a.estudanteId, ...p.data })
  if ('error' in r) return respErroDb(r.error, 'lixeira')
  return respJson({ ...r.lixeira })
}
