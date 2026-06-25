import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  }

  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const newToken = Array.from(
    { length: 32 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('')

  const service = await createServiceClient()
  const { error } = await service
    .from('simulados')
    .update({ embed_token: newToken })
    .eq('id', id)

  if (error) {
    console.error('[regenerar-token]', error)
    return NextResponse.json({ message: 'Erro ao regenerar token.' }, { status: 500 })
  }

  return NextResponse.json({ embed_token: newToken })
}
