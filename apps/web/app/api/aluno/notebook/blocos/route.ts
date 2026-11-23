import { NextRequest, NextResponse } from 'next/server'
import { autenticarBeta, excedeTetoPaginas, garantirNotebook, lerJson, limiteEscrita, resp400, resp404, resp429, respErroDb, respJson, respTetoPaginas } from '@/lib/aluno/notebook-api'
import {
  NOME_SECAO_PADRAO, TENTATIVAS_CONFLITO, TITULO_PAGINA_LEITOR, anexarEValidar, blocoCriarSchema, validarBloco,
} from '@/lib/aluno/notebook-blocos'
import { extrairTexto, ordemAoFinal } from '@/lib/aluno/notebook-server'

export const dynamic = 'force-dynamic'

const COLS = 'id, secao_id, doc, versao, tipo_pagina, ultimo_op_id'
const doc422 = (m: string) => NextResponse.json({ ok: false, code: 'doc_invalido', message: m }, { status: 422 })

// POST /api/aluno/notebook/blocos
//   {client_op_id, bloco:{tipo:'grifoSnapshot'|'questaoRef'|'anotacaoRef', attrs:{...}}, pagina_id? | secao_id?}
//  -> 200 {ok, pagina_id, secao_id, versao, criada, replay?} | 404 destino | 409 conflito (após 3 tentativas) | 422 bloco/doc inválido
// Anexa o bloco ao FIM do doc. Sem pagina_id: usa (ou cria) a página 'Do leitor' da seção (secao_id ou 'Geral').
// Idempotente por client_op_id (criação = client_op_id da página; append = ultimo_op_id).
export async function POST(request: NextRequest) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  if (!limiteEscrita(a.estudanteId)) return resp429()
  const j = await lerJson(request)
  if (!j.ok) return j.resposta
  const p = blocoCriarSchema.safeParse(j.corpo)
  if (!p.success) return resp400('Dados inválidos.', { erros: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })
  const b = p.data
  const v = validarBloco(b.bloco)
  if (!v.ok) return doc422(v.erro)

  const nb = await garantirNotebook(a.svc, a.tenantId, a.estudanteId)
  if ('error' in nb) return respErroDb(nb.error, 'blocos.nb')
  const esc = (q: any) => q.eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId)

  // replay (POST repetido)
  const rep = await esc(a.svc.from('simulado_aluno_notebook_paginas').select('id, secao_id, versao').eq('notebook_id', nb.notebook.id))
    .or(`client_op_id.eq.${b.client_op_id},ultimo_op_id.eq.${b.client_op_id}`).limit(1)
  if (rep.error) return respErroDb(rep.error, 'blocos.replay')
  if (rep.data?.length) return respJson({ pagina_id: rep.data[0].id, secao_id: rep.data[0].secao_id, versao: rep.data[0].versao, criada: false, replay: true })

  // ---- resolve a página alvo
  let alvo: any = null
  let criada = false
  if (b.pagina_id) {
    const r = await esc(a.svc.from('simulado_aluno_notebook_paginas').select(COLS).eq('id', b.pagina_id)).is('deletado_em', null).maybeSingle()
    if (r.error) return respErroDb(r.error, 'blocos.pagina')
    if (!r.data) return resp404()
    if (r.data.tipo_pagina !== 'texto') return resp400('Esta página não aceita blocos (folha livre).')
    alvo = r.data
  } else {
    // seção destino (manual)
    let secaoId: string | undefined
    if (b.secao_id) {
      const s = await esc(a.svc.from('simulado_aluno_notebook_secoes').select('id, tipo').eq('id', b.secao_id)).is('deletado_em', null).maybeSingle()
      if (s.error) return respErroDb(s.error, 'blocos.secao')
      if (!s.data) return resp404()
      if (s.data.tipo.startsWith('auto_')) return resp400('Seção automática não aceita páginas.')
      secaoId = s.data.id
    } else {
      const s = await esc(a.svc.from('simulado_aluno_notebook_secoes').select('id, nome, ordem').eq('notebook_id', nb.notebook.id).eq('tipo', 'manual'))
        .is('deletado_em', null).order('ordem', { ascending: true }).order('id', { ascending: true }).limit(100)
      if (s.error) return respErroDb(s.error, 'blocos.secoes')
      const lista: { id: string; nome: string }[] = s.data ?? []
      secaoId = (lista.find((x) => x.nome === NOME_SECAO_PADRAO) ?? lista[0])?.id
      if (!secaoId) {
        const ordem = 1024
        const c = await a.svc.from('simulado_aluno_notebook_secoes')
          .insert({ tenant_id: a.tenantId, estudante_id: a.estudanteId, notebook_id: nb.notebook.id, nome: NOME_SECAO_PADRAO, ordem, tipo: 'manual' }).select('id').single()
        if (c.error) return respErroDb(c.error, 'blocos.secao.criar')
        secaoId = c.data.id
      }
    }
    // página 'Do leitor' existente na seção?
    const ex = await esc(a.svc.from('simulado_aluno_notebook_paginas').select(COLS).eq('secao_id', secaoId).eq('titulo', TITULO_PAGINA_LEITOR).eq('tipo_pagina', 'texto'))
      .is('deletado_em', null).order('criado_em', { ascending: true }).limit(1)
    if (ex.error) return respErroDb(ex.error, 'blocos.ex')
    if (ex.data?.length) alvo = ex.data[0]
    else {
      const novo = anexarEValidar(null, v.no)
      if (!novo.ok) return doc422(novo.erro)
      const teto = await excedeTetoPaginas(a.svc, a.tenantId, a.estudanteId, nb.notebook.id)
      if ('error' in teto) return respErroDb(teto.error, 'blocos.teto')
      if (teto.excede) return respTetoPaginas()
      const mx = await esc(a.svc.from('simulado_aluno_notebook_paginas').select('ordem').eq('secao_id', secaoId)).is('deletado_em', null).order('ordem', { ascending: false }).limit(1)
      if (mx.error) return respErroDb(mx.error, 'blocos.ordem')
      const ins = await a.svc.from('simulado_aluno_notebook_paginas').insert({
        tenant_id: a.tenantId, estudante_id: a.estudanteId, notebook_id: nb.notebook.id, secao_id: secaoId,
        titulo: TITULO_PAGINA_LEITOR, doc: novo.doc, texto_busca: extrairTexto(novo.doc), ordem: ordemAoFinal(mx.data?.[0]?.ordem), client_op_id: b.client_op_id,
      }).select('id, secao_id, versao').single()
      if (!ins.error) return respJson({ pagina_id: ins.data.id, secao_id: ins.data.secao_id, versao: ins.data.versao, criada: true }, 201)
      if ((ins.error as { code?: string }).code !== '23505') return respErroDb(ins.error, 'blocos.criar')
      // corrida: outro POST criou a página (mesmo client_op_id => replay; senão anexa na existente)
      const r2 = await esc(a.svc.from('simulado_aluno_notebook_paginas').select(COLS).eq('secao_id', secaoId).eq('titulo', TITULO_PAGINA_LEITOR)).is('deletado_em', null).limit(1)
      if (r2.error) return respErroDb(r2.error, 'blocos.corrida')
      if (!r2.data?.length) return respErroDb(ins.error, 'blocos.criar')
      alvo = r2.data[0]
    }
  }

  // ---- append com versão otimista (retry curto)
  for (let i = 0; i < TENTATIVAS_CONFLITO; i++) {
    const novo = anexarEValidar(alvo.doc, v.no)
    if (!novo.ok) return doc422(novo.erro)
    const u = await esc(a.svc.from('simulado_aluno_notebook_paginas')
      .update({ doc: novo.doc, texto_busca: extrairTexto(novo.doc), versao: alvo.versao + 1, ultimo_op_id: b.client_op_id })
      .eq('id', alvo.id).eq('versao', alvo.versao)).is('deletado_em', null).select('versao')
    if (u.error) return respErroDb(u.error, 'blocos.append')
    if (u.data?.length) return respJson({ pagina_id: alvo.id, secao_id: alvo.secao_id, versao: u.data[0].versao, criada }, 200)
    const cur = await esc(a.svc.from('simulado_aluno_notebook_paginas').select(COLS).eq('id', alvo.id)).is('deletado_em', null).maybeSingle()
    if (cur.error) return respErroDb(cur.error, 'blocos.reler')
    if (!cur.data) return resp404()
    if (cur.data.ultimo_op_id === b.client_op_id) return respJson({ pagina_id: alvo.id, secao_id: alvo.secao_id, versao: cur.data.versao, criada, replay: true })
    alvo = cur.data
  }
  return NextResponse.json({ ok: false, code: 'conflito', message: 'Página muito disputada. Tente novamente.' }, { status: 409 })
}
