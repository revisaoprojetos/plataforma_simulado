import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'

interface Params {
  params: Promise<{ id: string }>
}

// Endpoint dinamico (sessao/dados/mutacao) — nunca cachear estaticamente.
export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params

  // Isolamento de tenant: resolve o acesso (usuário + tenant do subdomínio) e exige
  // papel de admin. Toda query é filtrada por tenant_id — um admin de uma plataforma
  // NÃO pode tocar o embed de um simulado de outra plataforma.
  const access = await getCurrentAccess()
  if (!access.userId) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  if (!access.tenantId) return NextResponse.json({ message: 'Tenant não resolvido.' }, { status: 400 })
  if (!(access.isAdmin || access.permissions.includes('simulados:update'))) {
    return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  }

  let body: { embed_ativo?: boolean; metodo_identificacao?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })
  }

  const service = createAdminClient()

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

  // If enabling embed and there's no token yet, generate one (escopado ao tenant).
  if (body.embed_ativo === true) {
    const { data: sim } = await service
      .from('simulado_simulados')
      .select('embed_token')
      .eq('id', id)
      .eq('tenant_id', access.tenantId)
      .maybeSingle()

    if (!sim) return NextResponse.json({ message: 'Simulado não encontrado.' }, { status: 404 })
    if (!sim.embed_token) {
      updateData.embed_token = generateToken()
    }
  }

  const { data: upd, error } = await service
    .from('simulado_simulados')
    .update(updateData)
    .eq('id', id)
    .eq('tenant_id', access.tenantId)
    .select('id')

  if (error) {
    console.error('[admin/simulados/embed PATCH]', error)
    return NextResponse.json({ message: 'Erro ao atualizar.' }, { status: 500 })
  }
  if (!upd || upd.length === 0) {
    return NextResponse.json({ message: 'Simulado não encontrado.' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}

function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
