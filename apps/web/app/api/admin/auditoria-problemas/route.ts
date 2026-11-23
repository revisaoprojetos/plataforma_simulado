import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess, accessCan, isSuperAdmin } from '@/lib/auth/permissions'
import { problemaSchema } from '@/lib/auditoria-problemas/tipos'
import { criarProblema } from '@/lib/auditoria-problemas/mutacoes'

export const dynamic = 'force-dynamic'

/** POST /api/admin/auditoria-problemas — cria um problema no tenant da sessão. Exige `problemas:create`. */
export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.userId || !(await isSuperAdmin()) || !access.tenantId || !accessCan(access, 'problemas:create')) {
    return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  }
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  const p = problemaSchema.safeParse(body)
  if (!p.success) return NextResponse.json({ message: p.error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 400 })
  const r = await criarProblema(access.tenantId, access.userId, p.data)
  return r.ok ? NextResponse.json({ ok: true, id: r.id }) : NextResponse.json({ message: r.message }, { status: r.status })
}
