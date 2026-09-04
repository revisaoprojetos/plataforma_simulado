import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'

// /api/leitura/anotacao — CRUD de anotações do aluno (grifos/notas).
export const dynamic = 'force-dynamic'

const COR_PADRAO = '#fde047'

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
    return NextResponse.json({ ok: true, id: b.id })
  }

  // Criar uma anotação nova (própria).
  if (!b.documento_id || !b.versao || b.inicio_char == null || b.fim_char == null || !b.exact) {
    return NextResponse.json({ message: 'Dados obrigatórios ausentes.' }, { status: 400 })
  }
  const { data, error } = await svc.from('simulado_leitura_anotacoes').insert({
    tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, documento_id: b.documento_id, documento_versao: b.versao,
    inicio_char: b.inicio_char, fim_char: b.fim_char, exact: String(b.exact).slice(0, 4000),
    prefix: b.prefix ?? null, suffix: b.suffix ?? null, cor: b.cor || COR_PADRAO, nota: b.nota || null, origem: 'propria',
  }).select('id').single()
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: (data as any).id })
}

export async function DELETE(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ message: 'id ausente.' }, { status: 400 })
  const svc = createAdminClient()
  // Soft-delete: some p/ o aluno; se for clone de base, o registro fica (não ressuscita no próximo open).
  const { error } = await svc.from('simulado_leitura_anotacoes')
    .update({ deletado: true, atualizado_em: new Date().toISOString() })
    .eq('id', id).eq('estudante_id', sessao.estudanteId).eq('tenant_id', sessao.tenantId)
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
