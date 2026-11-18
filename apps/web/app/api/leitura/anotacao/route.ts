import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { docAcessivelAluno } from '@/lib/leitura/acesso'
import { registrarAtividade } from '@/lib/acessos/registro'

// /api/leitura/anotacao — CRUD de anotações do aluno (grifos/notas).
export const dynamic = 'force-dynamic'

const COR_PADRAO = '#fde047'
const EXACT_MAX = 4000
// client id gerado pelo leitor (g<rand>, s<uuid>, m<rand>; partes de trecho longo usam sufixo #k).
const CID_RE = /^[A-Za-z0-9_#-]{1,90}$/

export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  let b: any
  try { b = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  const svc = createAdminClient()

  // Editar (cor/nota) ou RESTAURAR (undelete — para o "voltar/avançar") uma anotação do aluno.
  if (b.id) {
    const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
    if (b.restaurar) patch.deletado = false // undo/redo: traz de volta o MESMO id (preserva base_id/origem)
    if ('cor' in b) patch.cor = b.cor || COR_PADRAO
    if ('nota' in b) patch.nota = b.nota || null
    const { error } = await svc.from('simulado_leitura_anotacoes').update(patch).eq('id', b.id).eq('estudante_id', sessao.estudanteId).eq('tenant_id', sessao.tenantId)
    if (error) return NextResponse.json({ message: error.message }, { status: 500 })
    // Registro de atividade: edição de nota/cor (restaurar = voltar a criar). Fire-and-forget.
    void registrarAtividade(sessao, { tipo: b.restaurar ? 'grifo_criado' : 'nota_editada', refTipo: 'leitura_anotacao', refId: String(b.id), meta: { origem: 'leitura', restaurar: b.restaurar ? true : undefined } })
    return NextResponse.json({ ok: true, id: b.id })
  }

  // Criar uma anotação nova (própria).
  if (!b.documento_id || !b.versao || b.inicio_char == null || b.fim_char == null || !b.exact) {
    return NextResponse.json({ message: 'Dados obrigatórios ausentes.' }, { status: 400 })
  }
  // Gate anti-IDOR: só grava em documento publicado/visível ao aluno.
  if (!(await docAcessivelAluno(svc, sessao.tenantId, b.documento_id, sessao.estudanteId))) {
    return NextResponse.json({ message: 'Sem acesso a este documento.' }, { status: 403 })
  }
  // `exact` não pode ser cortado em silêncio (a âncora inicio/fim cobriria mais que o texto guardado). O leitor
  // divide trechos longos em partes ≤ 4000; se chegar maior, recusa com mensagem clara.
  if (String(b.exact).length > EXACT_MAX) {
    return NextResponse.json({ message: `Trecho grifado muito longo (máx. ${EXACT_MAX} caracteres por anotação). Divida em partes menores.` }, { status: 413 })
  }
  const base = {
    tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, documento_id: b.documento_id, documento_versao: b.versao,
    inicio_char: b.inicio_char, fim_char: b.fim_char, exact: String(b.exact),
    prefix: b.prefix ?? null, suffix: b.suffix ?? null, cor: b.cor || COR_PADRAO, nota: b.nota || null, origem: 'propria',
  }
  const tipo = b.tipo === 'nota' ? 'nota' : 'grifo'
  // IDEMPOTÊNCIA: `cid` (client id) identifica a criação. Se a coluna client_id existir (migração 20261118100000),
  // um retry/reenvio com o mesmo cid devolve a MESMA linha (restaurando-a se foi apagada: caso undo/redo no leitor).
  // Sem a coluna → comportamento antigo (insere sempre).
  const cid = CID_RE.test(String(b.cid ?? '')) ? String(b.cid) : null
  const T = 'simulado_leitura_anotacoes'
  const achar = async () => {
    const q = await svc.from(T).select('id, deletado').eq('estudante_id', sessao.estudanteId).eq('tenant_id', sessao.tenantId).eq('client_id', cid!).maybeSingle()
    return q
  }
  const devolverExistente = async (ex: { id: string; deletado: boolean | null }) => {
    if (ex.deletado) {
      await svc.from(T).update({
        deletado: false, documento_id: b.documento_id, documento_versao: b.versao, inicio_char: b.inicio_char, fim_char: b.fim_char,
        exact: base.exact, prefix: base.prefix, suffix: base.suffix, cor: base.cor, nota: base.nota, atualizado_em: new Date().toISOString(),
      }).eq('id', ex.id).eq('estudante_id', sessao.estudanteId).eq('tenant_id', sessao.tenantId)
    }
    return NextResponse.json({ ok: true, id: ex.id, duplicado: true })
  }
  let usaCid = !!cid
  if (usaCid) {
    const ex = await achar()
    if (ex.error && /client_id/i.test(ex.error.message)) usaCid = false // coluna ainda não existe
    else if (ex.data) return devolverExistente(ex.data as any)
  }
  // Insere com `tipo`/`client_id` (colunas novas); se a migração ainda não rodou, refaz sem elas (não bloqueia grifar/anotar).
  const payload: Record<string, unknown> = { ...base, tipo }
  if (usaCid) payload.client_id = cid
  let r = await svc.from(T).insert(payload).select('id').single()
  for (let i = 0; i < 3 && r.error; i++) {
    const err = r.error
    if (err.code === '23505' && usaCid) { // corrida: outro request com o mesmo cid gravou primeiro
      const ex = await achar()
      if (ex.data) return devolverExistente(ex.data as any)
      break
    }
    if (/client_id/i.test(err.message) && 'client_id' in payload) delete payload.client_id
    else if (/tipo/i.test(err.message) && 'tipo' in payload) delete payload.tipo
    else break
    r = await svc.from(T).insert(payload).select('id').single()
  }
  if (r.error) return NextResponse.json({ message: r.error.message }, { status: 500 })
  void registrarAtividade(sessao, { tipo: tipo === 'nota' ? 'nota_editada' : 'grifo_criado', refTipo: 'leitura_doc', refId: String(b.documento_id), meta: { origem: 'leitura' } })
  return NextResponse.json({ ok: true, id: (r.data as any).id })
}

export async function DELETE(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const id = params.get('id')
  const cid = params.get('cid')
  const svc = createAdminClient()
  // Apagar pelo client id: o add falhou SEM resposta (pode ter gravado) e o aluno apagou o grifo → remove a(s) linha(s).
  if (!id && cid) {
    if (!CID_RE.test(cid)) return NextResponse.json({ message: 'cid inválido.' }, { status: 400 })
    const base = cid.split('#')[0]
    const { error } = await svc.from('simulado_leitura_anotacoes')
      .update({ deletado: true, atualizado_em: new Date().toISOString() })
      .eq('estudante_id', sessao.estudanteId).eq('tenant_id', sessao.tenantId)
      .or(`client_id.eq.${base},client_id.like.${base}#%`)
    if (error && /client_id/i.test(error.message)) return NextResponse.json({ ok: true, semColuna: true }) // sem migração: nada a fazer
    if (error) return NextResponse.json({ message: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  if (!id) return NextResponse.json({ message: 'id ausente.' }, { status: 400 })
  // Soft-delete: some p/ o aluno; se for clone de base, o registro fica (não ressuscita no próximo open).
  const { error } = await svc.from('simulado_leitura_anotacoes')
    .update({ deletado: true, atualizado_em: new Date().toISOString() })
    .eq('id', id).eq('estudante_id', sessao.estudanteId).eq('tenant_id', sessao.tenantId)
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  void registrarAtividade(sessao, { tipo: 'grifo_removido', refTipo: 'leitura_anotacao', refId: String(id), meta: { origem: 'leitura' } })
  return NextResponse.json({ ok: true })
}
