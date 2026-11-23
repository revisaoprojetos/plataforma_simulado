import { NextRequest, NextResponse } from 'next/server'
import { autenticarBeta, lerJson, limiteEscrita, ordemEntre, resp400, resp404, resp429, respErroDb, respJson } from '@/lib/aluno/notebook-api'
import { calcularOrdem, colunaAusente, extrairQuestaoIds, extrairTexto, extrairTextoFolha, normalizarNiveisSecao, ordemAoFinal, sanitizarDoc, sanitizarTinta } from '@/lib/aluno/notebook-server'
import { clampNivel } from '@/lib/aluno/notebook-arvore'
import { paginaEditarSchema, uuidSchema } from '@/lib/aluno/notebook-tipos'
import { extrairArquivosNotebook } from '@/lib/aluno/notebook-texto'
import { removerArquivosOrfaos } from '@/lib/aluno/notebook-arquivos-server'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }
const COLS_FULL = 'id, secao_id, titulo, tipo_pagina, doc, tinta, versao, ordem, atualizado_em, ultimo_op_id'
// Fase 2 (colunas da migração 20261129000000): lidas com fallback para o legado enquanto a migração não foi aplicada.
const COLS_FULL_F2 = `${COLS_FULL}, nivel, fundo, regua, criado_em`

const escopo = (a: { tenantId: string; estudanteId: string }, q: any) => q.eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId)
const publica = ({ ultimo_op_id: _u, ...p }: any) => ({ nivel: 0, fundo: null, regua: null, ...p })

/** select da página (com colunas fase 2; se ausentes, refaz com o legado). */
async function lerPagina(a: { svc: any; tenantId: string; estudanteId: string }, id: string) {
  const ler = (cols: string) => escopo(a, a.svc.from('simulado_aluno_notebook_paginas').select(cols).eq('id', id)).is('deletado_em', null).maybeSingle()
  const r = await ler(COLS_FULL_F2)
  return r.error && colunaAusente(r.error) ? ler(COLS_FULL) : r
}

// GET /api/aluno/notebook/paginas/:id -> {ok, pagina:{id,secao_id,titulo,tipo_pagina,doc,versao,ordem,atualizado_em,nivel,fundo,regua}, refs:{questoes:[QuestaoAluno]}}
//  refs.questoes: só da prova DO TENANT; gabarito/comentário só das questões já respondidas (as demais vêm com gabarito_oculto=true e correta=false).
export async function GET(_request: NextRequest, { params }: Ctx) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return resp404()
  // ?campos=versao: só {id, versao, atualizado_em} (sem doc/tinta e SEM hidratar questões) — checagem barata de versão pelo cliente
  if (_request.nextUrl.searchParams.get('campos') === 'versao') {
    const leve = await escopo(a, a.svc.from('simulado_aluno_notebook_paginas').select('id, versao, atualizado_em').eq('id', id)).is('deletado_em', null).maybeSingle()
    if (leve.error) return respErroDb(leve.error, 'pagina.get.versao')
    if (!leve.data) return resp404()
    return respJson({ pagina: { id: leve.data.id, versao: leve.data.versao, atualizado_em: leve.data.atualizado_em } })
  }
  const { data, error } = await lerPagina(a, id)
  if (error) return respErroDb(error, 'pagina.get')
  if (!data) return resp404()
  let questoes: unknown[] = []
  const ids = extrairQuestaoIds(data.doc)
  if (ids.length) {
    try {
      const { questoesParaAluno } = await import('@/lib/aluno/cadernos-aluno')
      questoes = await questoesParaAluno(a.svc, a.tenantId, a.estudanteId, ids, { ocultarGabaritoNaoRespondidas: true })
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

  if (b.doc !== undefined && b.tinta !== undefined) {
    return NextResponse.json({ ok: false, code: 'doc_e_tinta', message: 'Envie doc (página de texto) OU tinta (folha livre), não os dois.' }, { status: 422 })
  }
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
  // Fase 2: aparência (listas brancas já validadas pelo zod). Sem a migração => 503 migracao_pendente (via respErroDb).
  if (b.fundo !== undefined) upd.fundo = b.fundo
  if (b.regua !== undefined) upd.regua = b.regua

  // mover de seção / reordenar / mudar nível (precisa da página atual p/ saber a seção e a ordem)
  const mexeNivel = b.nivel !== undefined
  let secaoParaNormalizar: string | null = null
  let secaoOrigem: string | null = null
  if (b.secao_id !== undefined || b.ordem !== undefined || b.entre !== undefined || mexeNivel) {
    const atual = await escopo(a, a.svc.from('simulado_aluno_notebook_paginas').select(mexeNivel ? 'secao_id, ordem' : 'secao_id').eq('id', id)).is('deletado_em', null).maybeSingle()
    if (atual.error) return respErroDb(atual.error, 'pagina.patch.atual')
    if (!atual.data) return resp404()
    const destino: string = b.secao_id ?? atual.data.secao_id
    secaoParaNormalizar = destino
    secaoOrigem = atual.data.secao_id
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
    if (mexeNivel) {
      // clamp: nível <= nível da página anterior (na ordem final, mesma seção destino) + 1; primeira da seção => 0
      const ordemFinal = (upd.ordem as number | undefined) ?? (atual.data.ordem as number)
      const prev = await escopo(a, a.svc.from('simulado_aluno_notebook_paginas').select('nivel').eq('secao_id', destino).neq('id', id).lt('ordem', ordemFinal))
        .is('deletado_em', null).order('ordem', { ascending: false }).order('id', { ascending: false }).limit(1)
      if (prev.error) return respErroDb(prev.error, 'pagina.patch.nivel')
      upd.nivel = clampNivel(b.nivel as number, prev.data?.length ? (prev.data[0].nivel ?? 0) : null)
    }
  }

  const u0 = escopo(a, a.svc.from('simulado_aluno_notebook_paginas')
    .update({ ...upd, versao: b.versao + 1, ultimo_op_id: b.client_op_id }).eq('id', id).eq('versao', b.versao))
    .is('deletado_em', null)
  // tipo da página (sem consulta extra no autosave): doc só em página de texto; tinta só em folha_livre. Divergência => 0 linhas => 422 abaixo.
  const uTipo = b.doc !== undefined ? u0.eq('tipo_pagina', 'texto') : b.tinta !== undefined ? u0.eq('tipo_pagina', 'folha_livre') : u0
  const u = await uTipo.select('versao, atualizado_em')
  if (u.error) return respErroDb(u.error, 'pagina.patch')
  if (u.data && u.data.length > 0) {
    // nível/seção/ordem mudaram: as páginas seguintes não podem ficar mais de 1 nível acima da anterior (cascata)
    if (secaoParaNormalizar && (upd.nivel !== undefined || upd.ordem !== undefined || upd.secao_id !== undefined)) {
      const n = await normalizarNiveisSecao(a.svc, a, secaoParaNormalizar)
      if (secaoOrigem && secaoOrigem !== secaoParaNormalizar) await normalizarNiveisSecao(a.svc, a, secaoOrigem)
      if (n) console.error('[notebook] normalizar niveis', (n.error as { code?: string } | null)?.code)
    }
    return respJson({ versao: u.data[0].versao, atualizado_em: u.data[0].atualizado_em, ...(upd.nivel !== undefined ? { nivel: upd.nivel } : {}) })
  }

  // 0 linhas: replay idempotente, conflito ou inexistente. Leitura LEVE primeiro (sem doc/tinta); só um conflito real relê a página inteira.
  const leve = await escopo(a, a.svc.from('simulado_aluno_notebook_paginas').select('versao, atualizado_em, ultimo_op_id, tipo_pagina').eq('id', id)).is('deletado_em', null).maybeSingle()
  if (leve.error) return respErroDb(leve.error, 'pagina.patch.reler')
  if (!leve.data) return resp404()
  if (b.doc !== undefined && leve.data.tipo_pagina === 'folha_livre') return NextResponse.json({ ok: false, code: 'doc_em_folha', message: 'Folha livre não aceita doc; use tinta.' }, { status: 422 })
  if (b.tinta !== undefined && leve.data.tipo_pagina !== 'folha_livre') return NextResponse.json({ ok: false, code: 'tinta_em_texto', message: 'Página de texto não aceita tinta; use doc.' }, { status: 422 })
  if (leve.data.ultimo_op_id === b.client_op_id) return respJson({ versao: leve.data.versao, atualizado_em: leve.data.atualizado_em, replay: true })
  const cur = await lerPagina(a, id)
  if (cur.error) return respErroDb(cur.error, 'pagina.patch.reler')
  if (!cur.data) return resp404()
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
    // arquivos referenciados (doc + caixas da folha) — lidos ANTES de apagar a linha; limpeza no storage é best-effort
    const conteudo = await escopo(a, a.svc.from('simulado_aluno_notebook_paginas').select('doc, tinta').eq('id', id)).not('deletado_em', 'is', null).maybeSingle()
    const d = await escopo(a, a.svc.from('simulado_aluno_notebook_paginas').delete().eq('id', id)).not('deletado_em', 'is', null)
    if (d.error) return respErroDb(d.error, 'pagina.del.def')
    if (conteudo.data) await removerArquivosOrfaos(a.svc, a, extrairArquivosNotebook([conteudo.data.doc, conteudo.data.tinta]), id)
    console.info('[notebook] pagina excluida definitivamente', id)
    return respJson({ id, definitivo: true })
  }
  if (cur.data.deletado_em) return respJson({ id })
  const u = await escopo(a, a.svc.from('simulado_aluno_notebook_paginas').update({ deletado_em: new Date().toISOString() }).eq('id', id)).is('deletado_em', null)
  if (u.error) return respErroDb(u.error, 'pagina.del')
  return respJson({ id })
}
