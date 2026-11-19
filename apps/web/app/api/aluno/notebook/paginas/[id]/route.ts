import { NextRequest, NextResponse } from 'next/server'
import { autenticarBeta, lerJson, limiteEscrita, ordemEntre, resp400, resp404, resp429, respErroDb, respJson } from '@/lib/aluno/notebook-api'
import { calcularOrdem, extrairQuestaoIds, extrairTexto, extrairTextoFolha, ordemAoFinal, sanitizarDoc, sanitizarTinta } from '@/lib/aluno/notebook-server'
import { paginaEditarSchema, uuidSchema } from '@/lib/aluno/notebook-tipos'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }
const COLS_FULL = 'id, secao_id, titulo, tipo_pagina, doc, tinta, versao, ordem, atualizado_em, ultimo_op_id'

const escopo = (a: { tenantId: string; estudanteId: string }, q: any) => q.eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId)
const publica = ({ ultimo_op_id: _u, ...p }: any) => p

// GET /api/aluno/notebook/paginas/:id -> {ok, pagina:{id,secao_id,titulo,tipo_pagina,doc,versao,ordem,atualizado_em}, refs:{questoes:[QuestaoAluno]}}
export async function GET(_request: NextRequest, { params }: Ctx) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return resp404()
  const { data, error } = await escopo(a, a.svc.from('simulado_aluno_notebook_paginas').select(COLS_FULL).eq('id', id)).is('deletado_em', null).maybeSingle()
  if (error) return respErroDb(error, 'pagina.get')
  if (!data) return resp404()
  let questoes: unknown[] = []
  const ids = extrairQuestaoIds(data.doc)
  if (ids.length) {
    try {
      const { questoesParaAluno } = await import('@/lib/aluno/cadernos-aluno')
      questoes = await questoesParaAluno(a.svc, a.tenantId, a.estudanteId, ids)
    } catch (e) { console.error('[notebook] hidratar questoes', (e as Error)?.message) }
  }
  return respJson({ pagina: publica(data), refs: { questoes } })
}

// PATCH /api/aluno/notebook/paginas/:id {versao, client_op_id, doc?, titulo?, secao_id?, ordem?, entre?, arquivada?}
//  -> 200 {ok, versao, atualizado_em[, replay]} | 409 {code:'conflito', versao_atual, pagina} | 422 doc inválido
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return resp404()
  if (!limiteEscrita(a.estudanteId)) return resp429()
  const j = await lerJson(request)
  if (!j.ok) return j.resposta
  const p = paginaEditarSchema.safeParse(j.corpo)
  if (!p.success) return resp400('Dados inválidos.', { erros: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })
  const b = p.data

  const upd: Record<string, unknown> = {}
  if (b.doc !== undefined) {
    const s = sanitizarDoc(b.doc)
    if (!s.ok) return NextResponse.json({ ok: false, code: 'doc_invalido', message: s.erro }, { status: 422 })
    upd.doc = s.doc
    upd.texto_busca = extrairTexto(s.doc)
  }
  if (b.tinta !== undefined) {
    const t = sanitizarTinta(b.tinta)
    if (!t.ok) return NextResponse.json({ ok: false, code: 'tinta_invalida', message: t.erro }, { status: 422 })
    upd.tinta = t.folha
    upd.texto_busca = extrairTextoFolha(t.folha)
  }
  if (b.titulo !== undefined) upd.titulo = b.titulo || 'Sem título'
  if (b.arquivada !== undefined) upd.arquivada = b.arquivada

  // mover de seção / reordenar (precisa da página atual p/ saber a seção)
  if (b.secao_id !== undefined || b.ordem !== undefined || b.entre !== undefined) {
    const atual = await escopo(a, a.svc.from('simulado_aluno_notebook_paginas').select('secao_id').eq('id', id)).is('deletado_em', null).maybeSingle()
    if (atual.error) return respErroDb(atual.error, 'pagina.patch.atual')
    if (!atual.data) return resp404()
    const destino: string = b.secao_id ?? atual.data.secao_id
    if (b.secao_id !== undefined && b.secao_id !== atual.data.secao_id) {
      const sec = await escopo(a, a.svc.from('simulado_aluno_notebook_secoes').select('id, tipo').eq('id', b.secao_id)).is('deletado_em', null).maybeSingle()
      if (sec.error) return respErroDb(sec.error, 'pagina.patch.secao')
      if (!sec.data) return resp404()
      if (sec.data.tipo.startsWith('auto_')) return resp400('Seção automática não aceita páginas.')
      upd.secao_id = b.secao_id
    }
    if (b.ordem !== undefined) upd.ordem = b.ordem
    else if (b.entre) {
      const r = await ordemEntre(a.svc, 'simulado_aluno_notebook_paginas', a, { secao_id: destino }, b.entre, id, calcularOrdem)
      if ('error' in r) return respErroDb(r.error, 'pagina.patch.ordem')
      upd.ordem = r.ordem
    } else if (upd.secao_id) {
      const { data, error } = await escopo(a, a.svc.from('simulado_aluno_notebook_paginas').select('ordem').eq('secao_id', destino)).is('deletado_em', null).order('ordem', { ascending: false }).limit(1)
      if (error) return respErroDb(error, 'pagina.patch.fim')
      upd.ordem = ordemAoFinal(data?.[0]?.ordem)
    }
  }

  const u = await escopo(a, a.svc.from('simulado_aluno_notebook_paginas')
    .update({ ...upd, versao: b.versao + 1, ultimo_op_id: b.client_op_id }).eq('id', id).eq('versao', b.versao))
    .is('deletado_em', null).select('versao, atualizado_em')
  if (u.error) return respErroDb(u.error, 'pagina.patch')
  if (u.data && u.data.length > 0) return respJson({ versao: u.data[0].versao, atualizado_em: u.data[0].atualizado_em })

  // 0 linhas: replay idempotente, conflito ou inexistente
  const cur = await escopo(a, a.svc.from('simulado_aluno_notebook_paginas').select(COLS_FULL).eq('id', id)).is('deletado_em', null).maybeSingle()
  if (cur.error) return respErroDb(cur.error, 'pagina.patch.reler')
  if (!cur.data) return resp404()
  if (cur.data.ultimo_op_id === b.client_op_id) return respJson({ versao: cur.data.versao, atualizado_em: cur.data.atualizado_em, replay: true })
  return NextResponse.json({ ok: false, code: 'conflito', message: 'Página editada em outro dispositivo.', versao_atual: cur.data.versao, pagina: publica(cur.data) }, { status: 409 })
}

// DELETE /api/aluno/notebook/paginas/:id[?definitivo=1] — lixeira (soft). definitivo só se já estiver na lixeira.
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return resp404()
  if (!limiteEscrita(a.estudanteId)) return resp429()
  const definitivo = request.nextUrl.searchParams.get('definitivo') === '1'
  const cur = await escopo(a, a.svc.from('simulado_aluno_notebook_paginas').select('id, deletado_em').eq('id', id)).maybeSingle()
  if (cur.error) return respErroDb(cur.error, 'pagina.del.get')
  if (!cur.data) return resp404()
  if (definitivo) {
    if (!cur.data.deletado_em) return resp400('Mova a página para a lixeira antes de excluir definitivamente.')
    const d = await escopo(a, a.svc.from('simulado_aluno_notebook_paginas').delete().eq('id', id)).not('deletado_em', 'is', null)
    if (d.error) return respErroDb(d.error, 'pagina.del.def')
    console.info('[notebook] pagina excluida definitivamente', id)
    return respJson({ id, definitivo: true })
  }
  if (cur.data.deletado_em) return respJson({ id })
  const u = await escopo(a, a.svc.from('simulado_aluno_notebook_paginas').update({ deletado_em: new Date().toISOString() }).eq('id', id)).is('deletado_em', null)
  if (u.error) return respErroDb(u.error, 'pagina.del')
  return respJson({ id })
}
