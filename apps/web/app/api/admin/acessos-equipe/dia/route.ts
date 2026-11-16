import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { detalheDiaMembro } from '@/lib/admin-rastreio/dias'
import { MSG_NAO_ATIVADO_ADMIN } from '@/lib/admin-rastreio/leitura'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/acessos-equipe/dia?user=<id>&dia=YYYY-MM-DD — relatório resumido de UM dia (BRT) de um membro da equipe.
 * Sob demanda. Exige `acessos:view`; sempre filtrado pelo tenant da sessão.
 */
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId || !accessCan(access, 'acessos:view')) {
    return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  }
  const user = req.nextUrl.searchParams.get('user') ?? ''
  const dia = req.nextUrl.searchParams.get('dia') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(user) || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return NextResponse.json({ message: 'Parâmetros inválidos.' }, { status: 400 })

  const r = await detalheDiaMembro(access.tenantId, user, dia)
  if (r === 'indisponivel') return NextResponse.json({ message: MSG_NAO_ATIVADO_ADMIN }, { status: 409 })
  if (!r) return NextResponse.json({ message: 'Dia inválido.' }, { status: 400 })
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
}
