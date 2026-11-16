import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { detalheDiaAluno } from '@/lib/acessos/dias'
import { MSG_NAO_ATIVADO } from '@/lib/acessos/leitura'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/acessos/dia?estudante=<id>&dia=YYYY-MM-DD — relatório resumido de UM dia (BRT) do aluno.
 * Sob demanda (clique na linha do dia). Exige `acessos:view`; sempre filtrado pelo tenant da sessão.
 */
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId || !accessCan(access, 'acessos:view')) {
    return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  }
  const estudanteId = req.nextUrl.searchParams.get('estudante') ?? ''
  const dia = req.nextUrl.searchParams.get('dia') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(estudanteId) || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return NextResponse.json({ message: 'Parâmetros inválidos.' }, { status: 400 })
  const { data: est } = await createAdminClient().from('simulado_estudantes').select('id').eq('id', estudanteId).eq('tenant_id', access.tenantId).maybeSingle()
  if (!est) return NextResponse.json({ message: 'Aluno não encontrado.' }, { status: 404 })

  const r = await detalheDiaAluno(access.tenantId, estudanteId, dia)
  if (r === 'indisponivel') return NextResponse.json({ message: MSG_NAO_ATIVADO }, { status: 409 })
  if (!r) return NextResponse.json({ message: 'Dia inválido.' }, { status: 400 })
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
}
