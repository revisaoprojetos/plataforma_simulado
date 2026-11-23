import { NextRequest } from 'next/server'
import { autenticarBeta, excedeTetoPaginas, garantirNotebook, lerJson, limiteEscrita, resp400, resp404, resp429, respErroDb, respJson, respTetoPaginas } from '@/lib/aluno/notebook-api'
import { colunaAusente, ordemAoFinal } from '@/lib/aluno/notebook-server'
import { clampNivel } from '@/lib/aluno/notebook-arvore'
import { copiarPaginaSchema, uuidSchema } from '@/lib/aluno/notebook-tipos'

export const dynamic = 'force-dynamic'
const COLS = 'id, secao_id, titulo, tipo_pagina, versao, ordem, atualizado_em'

// POST /api/aluno/notebook/paginas/:id/copiar {secao_id, client_op_id} -> 201 {ok, pagina} | 200 se client_op_id repetido (idempotente)
// Duplica SÓ a página (título, doc, tinta, texto de busca, fundo/régua) no FIM da seção destino (seção manual do mesmo aluno).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return resp404()
  if (!limiteEscrita(a.estudanteId)) return resp429()
  const j = await lerJson(request)
  if (!j.ok) return j.resposta
  const p = copiarPaginaSchema.safeParse(j.corpo)
  if (!p.success) return resp400('Dados inválidos.', { erros: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })
  const { secao_id: destinoId, client_op_id: opId } = p.data

  const nb = await garantirNotebook(a.svc, a.tenantId, a.estudanteId)
  if ('error' in nb) return respErroDb(nb.error, 'copiar.notebook')
  const escopo = (q: any) => q.eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).eq('notebook_id', nb.notebook.id)

  // idempotência: mesma operação já aplicada => devolve a cópia existente
  const ex = await escopo(a.svc.from('simulado_aluno_notebook_paginas').select(COLS).eq('client_op_id', opId)).maybeSingle()
  if (ex.error) return respErroDb(ex.error, 'copiar.idem')
  if (ex.data) return respJson({ pagina: ex.data })
  const teto = await excedeTetoPaginas(a.svc, a.tenantId, a.estudanteId, nb.notebook.id)
  if ('error' in teto) return respErroDb(teto.error, 'copiar.teto')
  if (teto.excede) return respTetoPaginas()

  const base = 'titulo, tipo_pagina, doc, tinta, texto_busca'
  const lerOrigem = (cols: string) => escopo(a.svc.from('simulado_aluno_notebook_paginas').select(cols).eq('id', id)).is('deletado_em', null).maybeSingle()
  let origem = await lerOrigem(`${base}, nivel, fundo, regua`)
  let fase2 = true
  if (origem.error && colunaAusente(origem.error)) { fase2 = false; origem = await lerOrigem(base) }
  if (origem.error) return respErroDb(origem.error, 'copiar.origem')
  if (!origem.data) return resp404()

  const sec = await escopo(a.svc.from('simulado_aluno_notebook_secoes').select('id, tipo').eq('id', destinoId)).is('deletado_em', null).maybeSingle()
  if (sec.error) return respErroDb(sec.error, 'copiar.secao')
  if (!sec.data) return resp404()
  if (String(sec.data.tipo).startsWith('auto_')) return resp400('Seção automática não aceita páginas.')

  const ult = await escopo(a.svc.from('simulado_aluno_notebook_paginas').select(fase2 ? 'ordem, nivel' : 'ordem').eq('secao_id', destinoId)).is('deletado_em', null)
    .order('ordem', { ascending: false }).order('id', { ascending: false }).limit(1)
  if (ult.error) return respErroDb(ult.error, 'copiar.ordem')
  const ultima = ult.data?.[0]

  const nova: Record<string, unknown> = {
    tenant_id: a.tenantId, estudante_id: a.estudanteId, notebook_id: nb.notebook.id, secao_id: destinoId,
    titulo: origem.data.titulo, tipo_pagina: origem.data.tipo_pagina, doc: origem.data.doc, tinta: origem.data.tinta ?? null,
    texto_busca: origem.data.texto_busca ?? '', ordem: ordemAoFinal(ultima?.ordem), client_op_id: opId,
  }
  if (fase2) {
    nova.nivel = clampNivel(origem.data.nivel ?? 0, ultima ? (ultima.nivel ?? 0) : null)
    nova.fundo = origem.data.fundo ?? null
    nova.regua = origem.data.regua ?? null
  }
  const ins = await a.svc.from('simulado_aluno_notebook_paginas').insert(nova).select(COLS).single()
  if (ins.error) {
    if ((ins.error as { code?: string }).code === '23505') { // corrida: mesmo client_op_id
      const r = await escopo(a.svc.from('simulado_aluno_notebook_paginas').select(COLS).eq('client_op_id', opId)).maybeSingle()
      if (r.data) return respJson({ pagina: r.data })
    }
    return respErroDb(ins.error, 'copiar.insert')
  }
  return respJson({ pagina: ins.data }, 201)
}
