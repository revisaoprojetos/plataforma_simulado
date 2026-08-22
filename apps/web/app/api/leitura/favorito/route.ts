import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'

// POST /api/leitura/favorito — toggle idempotente do favorito de lei/dispositivo.
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  let b: { documento_id?: string; disp_id?: string }
  try { b = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  if (!b.documento_id) return NextResponse.json({ message: 'documento_id ausente.' }, { status: 400 })
  const disp = b.disp_id ?? ''
  const svc = createAdminClient()
  const { data: ja } = await svc.from('simulado_lei_favoritos').select('id').eq('estudante_id', sessao.estudanteId).eq('documento_id', b.documento_id).eq('disp_id', disp).maybeSingle()
  if (ja) {
    await svc.from('simulado_lei_favoritos').delete().eq('id', (ja as any).id)
    return NextResponse.json({ favorito: false })
  }
  const { error } = await svc.from('simulado_lei_favoritos').insert({ tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, documento_id: b.documento_id, disp_id: disp })
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json({ favorito: true })
}
