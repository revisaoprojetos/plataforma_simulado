import { NextRequest } from 'next/server'
import { autenticarBeta, garantirEstrutura, garantirNotebook, lerNotebookSemCriar, respErroDb, respJson, resp400 } from '@/lib/aluno/notebook-api'
import { LIMITES } from '@/lib/aluno/notebook-tipos'
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

  // Visualização por admin (impersonation read_only): NUNCA grava. Sem notebook => estrutura vazia/virtual; com notebook => só lê.
  let notebook: { id: string; titulo: string }
  if (a.somenteLeitura) {
    const lido = await lerNotebookSemCriar(a.svc, a.tenantId, a.estudanteId)
    if ('error' in lido) return respErroDb(lido.error, 'arvore.notebook.ro')
    if (!lido.notebook) return respJson({ notebook: { id: null, titulo: 'Meu Caderno' }, secoes: [], paginas: [], pagina_limite: LIMITES.paginasPorSecaoArvore, somente_leitura: true })
    notebook = lido.notebook
  } else {
    const nb = await garantirNotebook(a.svc, a.tenantId, a.estudanteId)
    if ('error' in nb) return respErroDb(nb.error, 'arvore.notebook')
    const est = await garantirEstrutura(a.svc, a.tenantId, a.estudanteId, nb.notebook.id)
    if (est) return respErroDb(est.error, 'arvore.estrutura')
    notebook = nb.notebook
  }
  const t = await montarArvore(a.svc, { tenantId: a.tenantId, estudanteId: a.estudanteId, notebookId: notebook.id, secaoId: secaoId ?? undefined, offset, limit })
  if ('error' in t) return respErroDb(t.error, 'arvore.montar')
  return respJson({ notebook, secoes: t.secoes, paginas: t.paginas, pagina_limite: t.pagina_limite, ...(a.somenteLeitura ? { somente_leitura: true } : {}) })
}
