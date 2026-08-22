import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'

// POST /api/leitura/ponto — salva o último ponto (dispositivo) lido, por lei.
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  let b: { documento_id?: string; disp_id?: string; versao?: number }
  try { b = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  if (!b.documento_id) return NextResponse.json({ message: 'documento_id ausente.' }, { status: 400 })
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_leitura_ultimo_ponto').upsert(
    { tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, documento_id: b.documento_id, disp_id: b.disp_id ?? null, versao: b.versao ?? null, atualizado_em: new Date().toISOString() },
    { onConflict: 'estudante_id,documento_id' },
  )
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
