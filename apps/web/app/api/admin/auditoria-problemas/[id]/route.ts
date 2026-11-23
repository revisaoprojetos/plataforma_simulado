import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess, accessCan, isSuperAdmin } from '@/lib/auth/permissions'
import { problemaPatchSchema } from '@/lib/auditoria-problemas/tipos'
import { atualizarProblema, excluirProblema } from '@/lib/auditoria-problemas/mutacoes'
import { listarHistorico } from '@/lib/auditoria-problemas/dados'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Ctx = { params: Promise<{ id: string }> }

/** GET — histórico de alterações do problema (carregado ao abrir o painel). Exige `problemas:view`. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const access = await getCurrentAccess()
  if (!access.userId || !(await isSuperAdmin()) || !access.tenantId || !accessCan(access, 'problemas:view')) return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ message: 'Identificador inválido.' }, { status: 400 })
  const h = await listarHistorico(access.tenantId, { page: 1, pp: 50, problemaId: id })
  return NextResponse.json({ linhas: h.linhas }, { headers: { 'Cache-Control': 'no-store' } })
}

/** PATCH — edita campos (ou só o status, em 1 clique). Exige `problemas:update`. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const access = await getCurrentAccess()
  if (!access.userId || !(await isSuperAdmin()) || !access.tenantId || !accessCan(access, 'problemas:update')) return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ message: 'Identificador inválido.' }, { status: 400 })
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  const p = problemaPatchSchema.safeParse(body)
  if (!p.success) return NextResponse.json({ message: p.error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 400 })
  const r = await atualizarProblema(access.tenantId, access.userId, id, p.data)
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ message: r.message }, { status: r.status })
}

/** DELETE — exclusão lógica. Exige `problemas:delete`. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const access = await getCurrentAccess()
  if (!access.userId || !(await isSuperAdmin()) || !access.tenantId || !accessCan(access, 'problemas:delete')) return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ message: 'Identificador inválido.' }, { status: 400 })
  const r = await excluirProblema(access.tenantId, access.userId, id)
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ message: r.message }, { status: r.status })
}
