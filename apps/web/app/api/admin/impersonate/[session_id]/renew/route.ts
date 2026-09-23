import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { getImpersonationPermission } from '@/lib/impersonation/permissions'
import { criarSessaoImpersonation, lerSessaoImpersonation } from '@/lib/impersonation/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TTL = Number(process.env.IMPERSONATION_TOKEN_TTL_SECONDS ?? 1800)

// 3.2 — renova a sessão (novo `exp`). Revalida a permissão do admin: se mudou nesse meio-tempo,
// nega (permission_revoked). Mantém o MESMO session_id (mesma linha de log).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ session_id: string }> }) {
  const { session_id } = await params
  const access = await getCurrentAccess()
  if (!access.userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const perm = await getImpersonationPermission(access)
  if (!perm) return NextResponse.json({ error: 'permission_revoked' }, { status: 403 })

  const sess = await lerSessaoImpersonation()
  if (!sess || sess.sessionId !== session_id) return NextResponse.json({ error: 'session_mismatch' }, { status: 403 })

  const { expiresAt } = await criarSessaoImpersonation({
    sub: sess.estudanteId, tenantId: sess.tenantId, nome: sess.nome, impersonation: true,
    impersonated_by: access.userId, session_id: session_id, scope: perm.scope, action_level: perm.action_level,
  }, TTL)

  return NextResponse.json({ expires_at: expiresAt })
}
