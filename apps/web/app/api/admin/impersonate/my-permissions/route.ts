import { NextResponse } from 'next/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { getImpersonationPermission } from '@/lib/impersonation/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 3.5 — a UI usa isto para decidir se mostra o botão "Ver como aluno".
export async function GET() {
  const access = await getCurrentAccess()
  if (!access.userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const perm = await getImpersonationPermission(access)
  if (!perm) return NextResponse.json({ scope: null, action_level: null })
  return NextResponse.json({ scope: perm.scope, action_level: perm.action_level })
}
