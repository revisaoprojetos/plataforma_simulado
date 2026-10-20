import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'

// Grifos/anotações do aluno na Biblioteca (Fase 6). Mesmo padrão de /api/leitura/anotacao: sessão do
// aluno → scope SEMPRE por (estudante, tenant), gate anti-IDOR (documento publicado do tenant), nunca
// confia em RLS. Âncora por (trecho_uid + offsets no trecho).
export const dynamic = 'force-dynamic'

const T_AN = 'simulado_conteudo_anotacoes'
const T_DOC = 'simulado_conteudo_documentos'

async function docAcessivel(svc: ReturnType<typeof createAdminClient>, tenantId: string, documentoId: string): Promise<boolean> {
  const { data } = await svc.from(T_DOC).select('id, status, deletado').eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle()
  return !!data && !data.deletado && data.status === 'publicado'
}

export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  let b: any
  try { b = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  if (!b.documento_id || !b.trecho_uid || b.inicio_offset == null || b.fim_offset == null || !b.texto_ancora)
    return NextResponse.json({ message: 'Dados obrigatórios ausentes.' }, { status: 400 })
  const svc = createAdminClient()
  if (!(await docAcessivel(svc, sessao.tenantId, b.documento_id)))
    return NextResponse.json({ message: 'Sem acesso a este documento.' }, { status: 403 })

  // L4: o trecho (uid) tem que pertencer a ESTE documento e tenant (evita gravar âncora cross-tenant)
  const { data: id } = await svc.from('simulado_conteudo_trecho_identidade')
    .select('uid').eq('tenant_id', sessao.tenantId).eq('uid', b.trecho_uid).eq('documento_id', b.documento_id).maybeSingle()
  if (!id) return NextResponse.json({ message: 'Trecho inválido.' }, { status: 400 })

  const tipo = ['destaque', 'nota', 'riscado', 'insercao'].includes(b.tipo) ? b.tipo : 'destaque'
  const r = await svc.from(T_AN).insert({
    tenant_id: sessao.tenantId, aluno_id: sessao.estudanteId, documento_id: b.documento_id, trecho_uid: b.trecho_uid,
    tipo, inicio_offset: Number(b.inicio_offset) || 0, fim_offset: Number(b.fim_offset) || 0,
    texto_ancora: String(b.texto_ancora).slice(0, 4000), contexto_antes: b.contexto_antes ?? null, contexto_depois: b.contexto_depois ?? null,
    conteudo: b.conteudo ?? null, versao_criada_id: b.versao_id ?? null, versao_validada_id: b.versao_id ?? null, estado: 'ativa',
  }).select('id').single()
  if (r.error) return NextResponse.json({ message: r.error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: (r.data as any).id })
}

export async function DELETE(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ message: 'id ausente.' }, { status: 400 })
  const svc = createAdminClient()
  const { error } = await svc.from(T_AN).delete().eq('id', id).eq('aluno_id', sessao.estudanteId).eq('tenant_id', sessao.tenantId)
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
