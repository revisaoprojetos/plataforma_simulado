import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'

// Grifos do aluno sobre o PDF FIEL da Biblioteca. Scope SEMPRE por (estudante, tenant); gate: documento
// publicado do tenant. Âncora por (página + retângulos normalizados 0..1), independente de zoom.
export const dynamic = 'force-dynamic'

const T_G = 'simulado_conteudo_grifos_pdf'
const T_DOC = 'simulado_conteudo_documentos'

async function docPublicado(svc: ReturnType<typeof createAdminClient>, tenantId: string, documentoId: string): Promise<boolean> {
  const { data } = await svc.from(T_DOC).select('id, status, deletado').eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle()
  return !!data && !data.deletado && data.status === 'publicado'
}

export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  let b: any
  try { b = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  // Modelo geométrico: página + retângulos normalizados (0..1) na página.
  if (!b.documento_id || b.pagina == null || !Array.isArray(b.rects) || !b.rects.length)
    return NextResponse.json({ message: 'Dados obrigatórios ausentes.' }, { status: 400 })
  const svc = createAdminClient()
  if (!(await docPublicado(svc, sessao.tenantId, b.documento_id)))
    return NextResponse.json({ message: 'Sem acesso a este documento.' }, { status: 403 })
  const rects = (b.rects as any[]).slice(0, 300).map((r) => ({
    x0: Math.max(0, Math.min(1, Number(r.x0) || 0)), y0: Math.max(0, Math.min(1, Number(r.y0) || 0)),
    x1: Math.max(0, Math.min(1, Number(r.x1) || 0)), y1: Math.max(0, Math.min(1, Number(r.y1) || 0)),
  }))
  const TOOLS = ['hl', 'ul', 'wv', 'st', 'bx', 'bd', 'tc']
  const r = await svc.from(T_G).insert({
    tenant_id: sessao.tenantId, aluno_id: sessao.estudanteId, documento_id: b.documento_id, versao_id: b.versao_id ?? null,
    pagina: Number(b.pagina) || 1, rects, cor: String(b.cor || 'y').slice(0, 12), tool: TOOLS.includes(b.tool) ? b.tool : 'hl',
    nota: b.nota ? String(b.nota).slice(0, 4000) : null, texto: b.texto ? String(b.texto).slice(0, 4000) : null,
  }).select('id').single()
  if (r.error) return NextResponse.json({ message: r.error.message }, { status: 500 })
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
  if (b.nota !== undefined) patch.nota = b.nota ? String(b.nota).slice(0, 4000) : null
  if (b.cor !== undefined) patch.cor = String(b.cor || 'y').slice(0, 12)
  if (!Object.keys(patch).length) return NextResponse.json({ message: 'Nada a atualizar.' }, { status: 400 })
  const svc = createAdminClient()
  const { error } = await svc.from(T_G).update(patch).eq('id', b.id).eq('aluno_id', sessao.estudanteId).eq('tenant_id', sessao.tenantId)
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
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
  return NextResponse.json({ ok: true })
}
