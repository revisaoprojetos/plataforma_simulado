import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { criarHandoff } from '@/lib/auth/handoff'

/**
 * POST /api/auth/handoff — chamado no domínio ATUAL (onde a sessão é válida) ao trocar para uma
 * plataforma de OUTRO domínio. Gera um código de uso único ligado à sessão atual; o domínio destino
 * troca esse código pela sessão em /auth/handoff. Só funciona autenticado (é a própria sessão).
 */
export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'nao_autenticado' }, { status: 401 })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token || !session?.refresh_token) return NextResponse.json({ error: 'sem_sessao' }, { status: 401 })
  const code = await criarHandoff({ access_token: session.access_token, refresh_token: session.refresh_token })
  if (!code) return NextResponse.json({ error: 'indisponivel' }, { status: 503 })
  return NextResponse.json({ code })
}
