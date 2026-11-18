import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { registrarAtividade } from '@/lib/acessos/registro'

// Grifos do aluno sobre o PDF FIEL da Biblioteca. Scope SEMPRE por (estudante, tenant); gate: documento
// publicado do tenant. Âncora por (página + retângulos normalizados 0..1), independente de zoom.
export const dynamic = 'force-dynamic'

const T_G = 'simulado_conteudo_grifos_pdf'
const T_DOC = 'simulado_conteudo_documentos'

/** Documento publicado → devolve a versão ATUAL (versao_atual_id); null = sem acesso. O servidor NUNCA confia no versao_id do
 *  cliente: grifo novo grava sempre a versão atual (nunca rascunho/'pendente' nem uma versão velha de uma aba antiga). */
async function docPublicado(svc: ReturnType<typeof createAdminClient>, tenantId: string, documentoId: string): Promise<{ versaoAtualId: string | null } | null> {
  const { data } = await svc.from(T_DOC).select('id, status, deletado, versao_atual_id').eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle()
  if (!data || data.deletado || data.status !== 'publicado') return null
  return { versaoAtualId: (data as any).versao_atual_id ?? null }
}

/** Âncora de TEXTO (vínculo real do grifo; rects são cache). Campos opcionais, saneados; null se ausente/inválida. */
function lerAncora(a: any, versaoAtualId: string | null) {
  if (!a || typeof a !== 'object') return null
  const ci = Number(a.char_inicio), cf = Number(a.char_fim)
  if (!Number.isInteger(ci) || !Number.isInteger(cf) || ci < 0 || cf <= ci || cf > 5_000_000) return null
  const exact = typeof a.exact === 'string' && a.exact.trim() ? a.exact.slice(0, 4000) : null
  return {
    prefix: typeof a.prefix === 'string' ? a.prefix.slice(0, 200) : null, suffix: typeof a.suffix === 'string' ? a.suffix.slice(0, 200) : null,
    char_inicio: ci, char_fim: cf, ancora_texto: exact, ancora_versao: versaoAtualId,
    ancora_hash: typeof a.ancora_hash === 'string' && a.ancora_hash ? a.ancora_hash.slice(0, 40) : null,
    rotulo: typeof a.rotulo === 'string' && a.rotulo ? a.rotulo.slice(0, 120) : null,
    contexto: typeof a.contexto === 'string' && a.contexto ? a.contexto.slice(0, 400) : null,
    tipo_trecho: typeof a.tipo_trecho === 'string' && a.tipo_trecho ? a.tipo_trecho.slice(0, 20) : null,
  }
}
const ERRO_COLUNA_ANCORA = /prefix|suffix|char_inicio|char_fim|ancora_texto|ancora_versao|ancora_hash|rotulo|contexto|tipo_trecho|schema cache|column/i

export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  let b: any
  try { b = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  // Modelo geométrico: página + retângulos normalizados (0..1) na página.
  if (!b.documento_id || b.pagina == null || !Array.isArray(b.rects) || !b.rects.length)
    return NextResponse.json({ message: 'Dados obrigatórios ausentes.' }, { status: 400 })
  const svc = createAdminClient()
  const pub = await docPublicado(svc, sessao.tenantId, b.documento_id)
  if (!pub) return NextResponse.json({ message: 'Sem acesso a este documento.' }, { status: 403 })
  const rects = (b.rects as any[]).slice(0, 300).map((r) => ({
    x0: Math.max(0, Math.min(1, Number(r.x0) || 0)), y0: Math.max(0, Math.min(1, Number(r.y0) || 0)),
    x1: Math.max(0, Math.min(1, Number(r.x1) || 0)), y1: Math.max(0, Math.min(1, Number(r.y1) || 0)),
  }))
  const TOOLS = ['hl', 'ul', 'wv', 'st', 'bx', 'bd', 'tc']
  const base = {
    tenant_id: sessao.tenantId, aluno_id: sessao.estudanteId, documento_id: b.documento_id, versao_id: pub.versaoAtualId,
    pagina: Number(b.pagina) || 1, rects, cor: String(b.cor || 'y').slice(0, 12), tool: TOOLS.includes(b.tool) ? b.tool : 'hl',
    nota: b.nota ? String(b.nota).slice(0, 4000) : null, texto: b.texto ? String(b.texto).slice(0, 4000) : null,
  }
  const anc = lerAncora(b.ancora, pub.versaoAtualId)
  // IDENTIDADE: mesmo trecho (ancora_hash) + mesma ferramenta/cor do mesmo aluno no mesmo doc = o MESMO grifo → devolve o existente (idempotente).
  if (anc?.ancora_hash) {
    const ex = await svc.from(T_G).select('id').eq('tenant_id', sessao.tenantId).eq('aluno_id', sessao.estudanteId).eq('documento_id', b.documento_id)
      .eq('ancora_hash', anc.ancora_hash).eq('tool', base.tool).eq('cor', base.cor).limit(1).maybeSingle()
    if (!ex.error && ex.data) return NextResponse.json({ ok: true, id: (ex.data as any).id, duplicado: true })
  }
  // Com âncora de texto (migração 20261125030000); sem a migração (coluna inexistente) regrava sem ela — nunca perde o grifo.
  let r: any = await svc.from(T_G).insert(anc ? { ...base, ...anc } : base).select('id').single()
  if (r.error && anc && ERRO_COLUNA_ANCORA.test(String(r.error.message))) r = await svc.from(T_G).insert(base).select('id').single()
  if (r.error) return NextResponse.json({ message: r.error.message }, { status: 500 })
  void registrarAtividade(sessao, { tipo: 'grifo_criado', refTipo: 'conteudo_doc', refId: String(b.documento_id), meta: { origem: 'pdf' } })
  return NextResponse.json({ ok: true, id: (r.data as any).id })
}

// Atualiza a nota e/ou a cor de um grifo existente (aba Notas / troca de cor).
export async function PATCH(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  let b: any
  try { b = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  if (!b.id) return NextResponse.json({ message: 'id ausente.' }, { status: 400 })
  const patch: any = {}
  const svc0 = createAdminClient()
  // Âncora de TEXTO (backfill preguiçoso / re-ancoragem após troca de versão). Idempotente e sem apagar nada:
  //  - 'ancora' sozinho: só grava se o grifo AINDA não tem âncora (char_inicio null) → nunca sobrescreve uma existente;
  //  - 'reancorar' (rects/página recalculados pelo TEXTO numa versão nova): atualiza o CACHE de desenho + versão.
  if (b.ancora || b.reancorar) {
    const { data: row } = await svc0.from(T_G).select('id, documento_id').eq('id', b.id).eq('aluno_id', sessao.estudanteId).eq('tenant_id', sessao.tenantId).maybeSingle()
    if (!row) return NextResponse.json({ message: 'Grifo não encontrado.' }, { status: 404 })
    const pub = await docPublicado(svc0, sessao.tenantId, (row as any).documento_id)
    if (!pub) return NextResponse.json({ message: 'Sem acesso a este documento.' }, { status: 403 })
    const anc = lerAncora(b.ancora, pub.versaoAtualId)
    if (!anc) return NextResponse.json({ message: 'Âncora inválida.' }, { status: 400 })
    let q = svc0.from(T_G).update(anc).eq('id', b.id).eq('aluno_id', sessao.estudanteId).eq('tenant_id', sessao.tenantId)
    if (b.reancorar) {
      const rr = b.reancorar
      const rects = Array.isArray(rr?.rects) ? (rr.rects as any[]).slice(0, 300).map((r) => ({
        x0: Math.max(0, Math.min(1, Number(r.x0) || 0)), y0: Math.max(0, Math.min(1, Number(r.y0) || 0)),
        x1: Math.max(0, Math.min(1, Number(r.x1) || 0)), y1: Math.max(0, Math.min(1, Number(r.y1) || 0)),
      })) : []
      if (!rects.length || !(Number(rr.pagina) >= 1)) return NextResponse.json({ message: 'Dados de reancoragem inválidos.' }, { status: 400 })
      q = svc0.from(T_G).update({ ...anc, rects, pagina: Math.trunc(Number(rr.pagina)), versao_id: pub.versaoAtualId }).eq('id', b.id).eq('aluno_id', sessao.estudanteId).eq('tenant_id', sessao.tenantId)
    } else {
      q = q.is('char_inicio', null)
    }
    const { error } = await q
    // coluna inexistente (migração pendente) → no-op silencioso: o cliente recalcula a cada abertura
    if (error) return NextResponse.json(ERRO_COLUNA_ANCORA.test(String(error.message)) ? { ok: true, aplicado: false } : { message: error.message }, { status: ERRO_COLUNA_ANCORA.test(String(error.message)) ? 200 : 500 })
    return NextResponse.json({ ok: true, aplicado: true })
  }
  if (b.nota !== undefined) patch.nota = b.nota ? String(b.nota).slice(0, 4000) : null
  if (b.cor !== undefined) patch.cor = String(b.cor || 'y').slice(0, 12)
  if (!Object.keys(patch).length) return NextResponse.json({ message: 'Nada a atualizar.' }, { status: 400 })
  const svc = createAdminClient()
  const { error } = await svc.from(T_G).update(patch).eq('id', b.id).eq('aluno_id', sessao.estudanteId).eq('tenant_id', sessao.tenantId)
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  if (patch.nota !== undefined) void registrarAtividade(sessao, { tipo: 'nota_editada', refTipo: 'conteudo_grifo', refId: String(b.id), meta: { origem: 'pdf' } })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ message: 'id ausente.' }, { status: 400 })
  const svc = createAdminClient()
  const { error } = await svc.from(T_G).delete().eq('id', id).eq('aluno_id', sessao.estudanteId).eq('tenant_id', sessao.tenantId)
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  void registrarAtividade(sessao, { tipo: 'grifo_removido', refTipo: 'conteudo_grifo', refId: String(id), meta: { origem: 'pdf' } })
  return NextResponse.json({ ok: true })
}
