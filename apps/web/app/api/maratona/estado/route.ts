import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { salvarEstadoMaratona, alunoTemAcessoMaratona } from '@/lib/maratona/participacao'

// POST /api/maratona/estado { iniciado?: boolean, recolhido?: boolean }
// Persiste a preferência do aluno (aceitou/iniciou → "Continuar"; recolheu o card). Só p/ quem tem acesso.
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  let b: { iniciado?: boolean; recolhido?: boolean }
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 }) }
  const svc = createAdminClient()
  if (!(await alunoTemAcessoMaratona(svc, sessao.tenantId, sessao.estudanteId))) {
    return NextResponse.json({ error: 'Sem acesso à maratona.' }, { status: 403 })
  }
  const patch: { iniciado?: boolean; recolhido?: boolean } = {}
  if (typeof b.iniciado === 'boolean') patch.iniciado = b.iniciado
  if (typeof b.recolhido === 'boolean') patch.recolhido = b.recolhido
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true })
  try { await salvarEstadoMaratona(svc, sessao.estudanteId, patch) } catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Falha ao salvar.' }, { status: 500 }) }
  return NextResponse.json({ ok: true })
}
