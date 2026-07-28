import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params

  // Isolamento de tenant: só admin do tenant DONO do simulado regenera o token.
  const access = await getCurrentAccess()
  if (!access.userId) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  if (!access.tenantId) return NextResponse.json({ message: 'Tenant não resolvido.' }, { status: 400 })
  if (!(access.isAdmin || access.permissions.includes('simulados:update'))) {
    return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  }

  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const newToken = Array.from(
    { length: 32 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('')

  const service = createAdminClient()
  const { data: upd, error } = await service
    .from('simulado_simulados')
    .update({ embed_token: newToken })
    .eq('id', id)
    .eq('tenant_id', access.tenantId)
    .select('id')

  if (error) {
    console.error('[regenerar-token]', error)
    return NextResponse.json({ message: 'Erro ao regenerar token.' }, { status: 500 })
  }
  if (!upd || upd.length === 0) {
    return NextResponse.json({ message: 'Simulado não encontrado.' }, { status: 404 })
  }

  return NextResponse.json({ embed_token: newToken })
}
