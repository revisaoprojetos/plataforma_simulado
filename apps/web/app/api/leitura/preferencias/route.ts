import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'

// POST /api/leitura/preferencias — salva as preferências de leitura do aluno (upsert).
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  let b: any
  try { b = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  const svc = createAdminClient()
  const row: Record<string, unknown> = { tenant_id: sessao.tenantId, estudante_id: sessao.estudanteId, atualizado_em: new Date().toISOString() }
  for (const k of ['tema', 'fonte', 'espacamento', 'espacamento_texto', 'largura', 'sem_grifos', 'painel', 'modo', 'grifo_rotulos'] as const) if (k in b) row[k] = b[k]
  let { error } = await svc.from('simulado_leitura_preferencias').upsert(row, { onConflict: 'estudante_id' })
  // `espacamento_texto` é coluna nova (migração 20260920000000): se ainda não rodou, salva o resto.
  if (error && /espacamento_texto|column|schema cache/i.test(error.message)) {
    const { espacamento_texto: _drop, ...resto } = row as any
    ;({ error } = await svc.from('simulado_leitura_preferencias').upsert(resto, { onConflict: 'estudante_id' }))
  }
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
