import { NextRequest } from 'next/server'
import { autenticarBeta, garantirEstrutura, garantirNotebook, respErroDb, respJson, resp400 } from '@/lib/aluno/notebook-api'
import { montarArvore } from '@/lib/aluno/notebook-server'
import { uuidSchema } from '@/lib/aluno/notebook-tipos'

export const dynamic = 'force-dynamic'

// GET /api/aluno/notebook[/arvore]?secao_id=&offset=&limit=  — árvore LEVE (sem doc).
export async function GET(request: NextRequest) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const sp = request.nextUrl.searchParams
  const secaoId = sp.get('secao_id')
  if (secaoId && !uuidSchema.safeParse(secaoId).success) return resp400('secao_id inválido.')
  const offset = Number(sp.get('offset') ?? 0)
  const limit = Number(sp.get('limit') ?? 200)
  if (!Number.isFinite(offset) || !Number.isFinite(limit)) return resp400('offset/limit inválidos.')

  const nb = await garantirNotebook(a.svc, a.tenantId, a.estudanteId)
  if ('error' in nb) return respErroDb(nb.error, 'arvore.notebook')
  const est = await garantirEstrutura(a.svc, a.tenantId, a.estudanteId, nb.notebook.id)
  if (est) return respErroDb(est.error, 'arvore.estrutura')
  const t = await montarArvore(a.svc, { tenantId: a.tenantId, estudanteId: a.estudanteId, notebookId: nb.notebook.id, secaoId: secaoId ?? undefined, offset, limit })
  if ('error' in t) return respErroDb(t.error, 'arvore.montar')
  return respJson({ notebook: nb.notebook, secoes: t.secoes, paginas: t.paginas, pagina_limite: t.pagina_limite })
}
