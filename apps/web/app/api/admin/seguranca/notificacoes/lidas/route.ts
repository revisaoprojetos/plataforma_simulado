import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'

export const dynamic = 'force-dynamic'

/** POST /api/admin/seguranca/notificacoes/lidas — marca as notificações de segurança como lidas no servidor. */
export async function POST() {
  const access = await getCurrentAccess()
  if (!access.userId || !accessCan(access, 'seguranca:view')) return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  const { error } = await createAdminClient().from('seguranca_notificacoes').update({ lida: true }).eq('lida', false)
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
