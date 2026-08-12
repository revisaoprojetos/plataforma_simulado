import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { resumoGamificacao, missoesHoje } from '@/lib/gamificacao/leitura'

// GET /api/aluno/gamificacao/resumo — stats do header (XP, nível, liga, streak) + missões do dia.
export const dynamic = 'force-dynamic'

export async function GET() {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false }, { status: 401 })
  try {
    const svc = await createServiceClient()
    const [resumo, missoes] = await Promise.all([
      resumoGamificacao(svc, sessao.tenantId, sessao.estudanteId),
      missoesHoje(svc, sessao.tenantId, sessao.estudanteId),
    ])
    return NextResponse.json({ ok: true, resumo, missoes })
  } catch {
    return NextResponse.json({ ok: true, resumo: null, missoes: [] })
  }
}
