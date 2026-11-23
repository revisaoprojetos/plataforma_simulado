import { NextRequest } from 'next/server'
import { autenticarBeta, limiteEscrita, resp400, resp429, respErroDb, respJson } from '@/lib/aluno/notebook-api'
import { listarAutoErros } from '@/lib/aluno/notebook-server'
import { paginacaoSchema } from '@/lib/aluno/notebook-tipos'

export const dynamic = 'force-dynamic'

// GET /api/aluno/notebook/auto/erros?offset=&limit=  -> {ok, total, itens:[QuestaoAluno]} (somente leitura)
export async function GET(request: NextRequest) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  if (!limiteEscrita(`auto:${a.estudanteId}`, 5, 1000)) return resp429()
  const sp = request.nextUrl.searchParams
  const p = paginacaoSchema.safeParse({ offset: sp.get('offset') ?? undefined, limit: sp.get('limit') ?? undefined })
  if (!p.success) return resp400('Paginação inválida.')
  try {
    const r = await listarAutoErros(a.svc, a.tenantId, a.estudanteId, p.data.offset, p.data.limit)
    return respJson({ total: r.total, itens: r.itens })
  } catch (e) { return respErroDb(e, 'auto.erros') }
}
