import { NextResponse } from 'next/server'
import { getCurrentAccess } from '@/lib/auth/permissions'

// Endpoint dinamico (sessao/dados/mutacao) — nunca cachear estaticamente.
export const dynamic = 'force-dynamic'

/**
 * Permissões do usuário atual. Usa a MESMA fonte do RBAC real (getCurrentAccess: tenant_acessos → roles →
 * role_permissions, memoizada/cacheada) — antes consultava simulado_user_roles/relações inexistentes e devolvia [].
 * Hoje não há chamadores no app (o layout /admin injeta via CanProvider); mantido p/ o hook hooks/use-can.ts.
 */
export async function GET() {
  try {
    const acc = await getCurrentAccess()
    if (!acc.userId) return NextResponse.json({ permissions: [] }, { status: 401 })
    return NextResponse.json({
      permissions: acc.isAdmin ? ['*'] : acc.permissions,
      roles: acc.role ? [acc.role] : [],
    })
  } catch (err) {
    console.error('[api/auth/me]', err)
    return NextResponse.json({ permissions: [] })
  }
}
