import { NextResponse, type NextRequest } from 'next/server'
import { lerSessaoImpersonation, limparSessaoImpersonation } from '@/lib/impersonation/session'
import { fecharLogImpersonation, type EndReason } from '@/lib/impersonation/logs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 3.3 — encerra a visualização: fecha o log (uma vez) e limpa o cookie. Lenient de propósito
// (também é chamado no auto-encerramento por expiração, quando o token pode já ter sumido).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ session_id: string }> }) {
  const { session_id } = await params
  const body = await req.json().catch(() => ({}))
  const reason: EndReason = (body as { reason?: string })?.reason === 'expired' ? 'expired' : 'closed_by_admin'

  const sess = await lerSessaoImpersonation()
  if (sess && sess.sessionId === session_id) {
    await fecharLogImpersonation(session_id, sess.tenantId, reason)
  }
  await limparSessaoImpersonation()
  return new NextResponse(null, { status: 204 })
}
