import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { onAtividadeDiaria } from '@/lib/gamificacao'
import { resumoGamificacao } from '@/lib/gamificacao/leitura'

// POST /api/aluno/gamificacao/ping — atividade diária (streak). Chamado 1x pelo portal ao carregar.
export const dynamic = 'force-dynamic'

export async function POST() {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false }, { status: 401 })
  try {
    const svc = await createServiceClient()
    await onAtividadeDiaria(svc, { tenantId: sessao.tenantId, estudanteId: sessao.estudanteId })
    const resumo = await resumoGamificacao(svc, sessao.tenantId, sessao.estudanteId).catch(() => null)
    return NextResponse.json({ ok: true, resumo })
  } catch {
    return NextResponse.json({ ok: true, pendente: true })
  }
}
