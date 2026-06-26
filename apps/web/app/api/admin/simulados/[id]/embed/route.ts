import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

interface Params {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  }

  let body: { embed_ativo?: boolean; metodo_identificacao?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })
  }

  const service = await createServiceClient()

  const updateData: Record<string, unknown> = {}
  if (typeof body.embed_ativo === 'boolean') {
    updateData.embed_ativo = body.embed_ativo
  }
  if (body.metodo_identificacao) {
    const valid = ['email', 'email_cpf', 'email_telefone']
    if (!valid.includes(body.metodo_identificacao)) {
      return NextResponse.json({ message: 'Método de identificação inválido.' }, { status: 400 })
    }
    updateData.metodo_identificacao = body.metodo_identificacao
  }

  // If enabling embed and there's no token yet, generate one
  if (body.embed_ativo === true) {
    const { data: sim } = await service
      .from('simulado_simulados')
      .select('embed_token')
      .eq('id', id)
      .single()

    if (!sim?.embed_token) {
      updateData.embed_token = generateToken()
    }
  }

  const { error } = await service
    .from('simulado_simulados')
    .update(updateData)
    .eq('id', id)

  if (error) {
    console.error('[admin/simulados/embed PATCH]', error)
    return NextResponse.json({ message: 'Erro ao atualizar.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
