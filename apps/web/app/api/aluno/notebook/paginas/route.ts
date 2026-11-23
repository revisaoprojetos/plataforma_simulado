import { NextRequest } from 'next/server'
import { autenticarBeta, lerJson, limiteEscrita, ordemEntre, resp400, resp404, resp429, respErroDb, respJson, respTetoPaginas, passaTetoPaginas } from '@/lib/aluno/notebook-api'
import { calcularOrdem, colunaAusente, docVazio, extrairTexto, extrairTextoFolha, normalizarNiveisSecao, ordemAoFinal, sanitizarDoc, sanitizarTinta, tintaVazia } from '@/lib/aluno/notebook-server'
import { clampNivel } from '@/lib/aluno/notebook-arvore'
import { paginaCriarSchema } from '@/lib/aluno/notebook-tipos'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const COLS = 'id, secao_id, titulo, tipo_pagina, versao, ordem, atualizado_em'
const COLS_F2 = `${COLS}, nivel, criado_em`
/** resposta mínima (nivel/criado_em com default quando a migração fase 2 não foi aplicada) */
const paginaPublica = (p: any) => ({ id: p.id, secao_id: p.secao_id, titulo: p.titulo, tipo_pagina: p.tipo_pagina, ordem: p.ordem, nivel: p.nivel ?? 0, versao: p.versao, criado_em: p.criado_em ?? null, atualizado_em: p.atualizado_em })

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
  const esc = (q: any) => q.eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId)
  const T = 'simulado_aluno_notebook_paginas'
  // fase 2 (nivel/criado_em) com fallback ao legado enquanto a migração 20261129000000 não foi aplicada
  const comFallback = async (fn: (cols: string) => PromiseLike<any>) => {
    const r = await fn(COLS_F2)
    return r.error && colunaAusente(r.error) ? fn(COLS) : r
  }
  const lerExistente = () => comFallback((cols) => esc(a.svc.from(T).select(cols)).eq('client_op_id', b.client_op_id).maybeSingle())
  const comAntes = b.ordem === undefined && !!b.antes_de_id
  const lerAntes = async () => {
    const q = (cols: string) => esc(a.svc.from(T).select(cols)).eq('id', b.antes_de_id!).eq('secao_id', b.secao_id).is('deletado_em', null).maybeSingle()
    const r = await q('ordem, nivel')
    return r.error && colunaAusente(r.error) ? q('ordem') : r
  }
  const lerUltima = async () => {
    const q = (cols: string) => esc(a.svc.from(T).select(cols)).eq('secao_id', b.secao_id).is('deletado_em', null).order('ordem', { ascending: false }).limit(1)
    const r = await q('ordem, nivel')
    return r.error && colunaAusente(r.error) ? q('ordem') : r
  }
  // UMA rodada paralela: idempotência, seção destino, teto (head count) e ordem/vizinho. Nada em série.
  const [ex, sec, tetoR, ult, antes] = await Promise.all([
    lerExistente(),
    esc(a.svc.from('simulado_aluno_notebook_secoes').select('id, tipo, notebook_id')).eq('id', b.secao_id).is('deletado_em', null).maybeSingle(),
    esc(a.svc.from(T).select('id', { count: 'exact', head: true })).is('deletado_em', null),
    b.ordem === undefined && !comAntes ? lerUltima() : Promise.resolve(null),
    comAntes ? lerAntes() : Promise.resolve(null),
  ])
  if (ex.error) return respErroDb(ex.error, 'paginas.idem')
  if (ex.data) return respJson({ pagina: paginaPublica(ex.data) })
  if (sec.error) return respErroDb(sec.error, 'paginas.secao')
  if (!sec.data) return resp404()
  if (sec.data.tipo.startsWith('auto_')) return resp400('Seção automática não aceita páginas.')
  if (tetoR.error) return respErroDb(tetoR.error, 'paginas.teto')
  if (passaTetoPaginas(tetoR.count ?? 0)) return respTetoPaginas()

  let ordem = b.ordem
  let nivelAnterior: number | null = null
  let antesNivel = 0
  if (ordem === undefined) {
    if (comAntes) {
      if (antes?.error) return respErroDb(antes.error, 'paginas.antes')
      if (!antes?.data) return resp400('antes_de_id não pertence à seção.')
      antesNivel = antes.data.nivel ?? 0
      // vizinho de cima (único ponto serial, só no caminho antes_de_id)
      const pq = async (cols: string) => esc(a.svc.from(T).select(cols)).eq('secao_id', b.secao_id).is('deletado_em', null).lt('ordem', antes.data.ordem)
        .order('ordem', { ascending: false }).order('id', { ascending: false }).limit(1)
      let prev = await pq('id, ordem, nivel')
      if (prev.error && colunaAusente(prev.error)) prev = await pq('id, ordem')
      if (prev.error) return respErroDb(prev.error, 'paginas.prev')
      const pv = prev.data?.[0]
      const calc = calcularOrdem(pv ? pv.ordem : null, antes.data.ordem)
      if (calc.renumerar && pv) {
        const r = await ordemEntre(a.svc, T, a, { secao_id: b.secao_id }, { antes_id: pv.id, depois_id: b.antes_de_id }, b.id ?? '00000000-0000-0000-0000-000000000000', calcularOrdem)
        if ('error' in r) return respErroDb(r.error, 'paginas.ordem')
        ordem = r.ordem
      } else ordem = calc.ordem
      nivelAnterior = pv ? (pv.nivel ?? 0) : null
    } else {
      if (ult?.error) return respErroDb(ult.error, 'paginas.ordem')
      ordem = ordemAoFinal(ult?.data?.[0]?.ordem)
      nivelAnterior = ult?.data?.length ? (ult.data[0].nivel ?? 0) : null
    }
  } else if (b.nivel !== undefined) {
    // ordem explícita: nível pelo vizinho de cima real
    const pr = await esc(a.svc.from(T).select('nivel')).eq('secao_id', b.secao_id).is('deletado_em', null).lt('ordem', ordem).order('ordem', { ascending: false }).order('id', { ascending: false }).limit(1)
    if (pr.error) return respErroDb(pr.error, 'paginas.prev')
    nivelAnterior = pr.data?.length ? (pr.data[0].nivel ?? 0) : null
  }
  const nivel = b.nivel !== undefined ? clampNivel(b.nivel, nivelAnterior) : undefined

  const linha = {
    ...(b.id ? { id: b.id } : {}),
    tenant_id: a.tenantId, estudante_id: a.estudanteId, notebook_id: sec.data.notebook_id, secao_id: b.secao_id,
    titulo: b.titulo || 'Sem título', tipo_pagina: tipo, doc, tinta, texto_busca: textoBusca, ordem, client_op_id: b.client_op_id,
    ...(nivel !== undefined ? { nivel } : {}),
  }
  const ins = await comFallback((cols) => a.svc.from(T).insert(linha).select(cols).single())
  if (ins.error) {
    if ((ins.error as { code?: string }).code === '23505') { // corrida: mesmo client_op_id; senão, `id` já em uso (409 sem detalhes)
      const r = await lerExistente()
      if (r.data) return respJson({ pagina: paginaPublica(r.data) })
      return NextResponse.json({ ok: false, code: 'id_em_uso', message: 'Identificador já utilizado.' }, { status: 409 })
    }
    return respErroDb(ins.error, 'paginas.insert')
  }
  // inserida ANTES de uma página mais recuada: as seguintes não podem ficar >1 nível acima da nova (cascata)
  if (comAntes && (nivel ?? 0) + 1 < antesNivel) {
    const n = await normalizarNiveisSecao(a.svc, a, b.secao_id)
    if (n) console.error('[notebook] normalizar niveis (criar)', (n.error as { code?: string } | null)?.code)
  }
  return respJson({ pagina: paginaPublica(ins.data) }, 201)
}
