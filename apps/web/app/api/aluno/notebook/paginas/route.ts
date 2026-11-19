import { NextRequest } from 'next/server'
import { autenticarBeta, garantirNotebook, lerJson, limiteEscrita, resp400, resp404, resp429, respErroDb, respJson } from '@/lib/aluno/notebook-api'
import { docVazio, extrairTexto, extrairTextoFolha, ordemAoFinal, sanitizarDoc, sanitizarTinta, tintaVazia } from '@/lib/aluno/notebook-server'
import { paginaCriarSchema } from '@/lib/aluno/notebook-tipos'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const COLS = 'id, secao_id, titulo, tipo_pagina, versao, ordem, atualizado_em'

// POST /api/aluno/notebook/paginas {secao_id, titulo?, doc?, ordem?, client_op_id} -> 201 {ok, pagina} | 200 se client_op_id repetido
export async function POST(request: NextRequest) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  if (!limiteEscrita(a.estudanteId)) return resp429()
  const j = await lerJson(request)
  if (!j.ok) return j.resposta
  const p = paginaCriarSchema.safeParse(j.corpo)
  if (!p.success) return resp400('Dados inválidos.', { erros: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })
  const b = p.data

  const tipo = b.tipo_pagina ?? 'texto'
  let doc = docVazio() as any
  let tinta: any = null
  let textoBusca = ''
  if (tipo === 'folha_livre') {
    const t = sanitizarTinta(b.tinta ?? tintaVazia())
    if (!t.ok) return NextResponse.json({ ok: false, code: 'tinta_invalida', message: t.erro }, { status: 422 })
    tinta = t.folha
    textoBusca = extrairTextoFolha(t.folha)
  } else if (b.doc) {
    const s = sanitizarDoc(b.doc)
    if (!s.ok) return NextResponse.json({ ok: false, code: 'doc_invalido', message: s.erro }, { status: 422 })
    doc = s.doc
    textoBusca = extrairTexto(doc)
  }
  const nb = await garantirNotebook(a.svc, a.tenantId, a.estudanteId)
  if ('error' in nb) return respErroDb(nb.error, 'paginas.notebook')

  const existente = () => a.svc.from('simulado_aluno_notebook_paginas').select(COLS)
    .eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).eq('notebook_id', nb.notebook.id).eq('client_op_id', b.client_op_id).maybeSingle()
  const ex = await existente()
  if (ex.error) return respErroDb(ex.error, 'paginas.idem')
  if (ex.data) return respJson({ pagina: ex.data })

  const sec = await a.svc.from('simulado_aluno_notebook_secoes').select('id, tipo')
    .eq('id', b.secao_id).eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).eq('notebook_id', nb.notebook.id).is('deletado_em', null).maybeSingle()
  if (sec.error) return respErroDb(sec.error, 'paginas.secao')
  if (!sec.data) return resp404()
  if (sec.data.tipo.startsWith('auto_')) return resp400('Seção automática não aceita páginas.')

  let ordem = b.ordem
  if (ordem === undefined) {
    const { data, error } = await a.svc.from('simulado_aluno_notebook_paginas').select('ordem')
      .eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId).eq('secao_id', b.secao_id).is('deletado_em', null)
      .order('ordem', { ascending: false }).limit(1)
    if (error) return respErroDb(error, 'paginas.ordem')
    ordem = ordemAoFinal(data?.[0]?.ordem)
  }
  const ins = await a.svc.from('simulado_aluno_notebook_paginas').insert({
    tenant_id: a.tenantId, estudante_id: a.estudanteId, notebook_id: nb.notebook.id, secao_id: b.secao_id,
    titulo: b.titulo || 'Sem título', tipo_pagina: tipo, doc, tinta, texto_busca: textoBusca, ordem, client_op_id: b.client_op_id,
  }).select(COLS).single()
  if (ins.error) {
    if ((ins.error as { code?: string }).code === '23505') { // corrida: mesmo client_op_id
      const r = await existente()
      if (r.data) return respJson({ pagina: r.data })
    }
    return respErroDb(ins.error, 'paginas.insert')
  }
  return respJson({ pagina: ins.data }, 201)
}
