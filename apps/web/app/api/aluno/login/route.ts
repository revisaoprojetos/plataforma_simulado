import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { criarSessaoAluno } from '@/lib/aluno-session'
import { rateLimit } from '@/lib/rate-limit'
import { registrarAudit } from '@/lib/audit'

// POST /api/aluno/login — login leve persistente do aluno (sem senha).
export async function POST(request: NextRequest) {
  let body: { email?: string; cpf?: string; telefone?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })
  }

  const email = body.email?.toLowerCase().trim()
  if (!email) return NextResponse.json({ message: 'Informe seu e-mail.' }, { status: 400 })

  const tenantId = await getCurrentTenantId()
  if (!tenantId) return NextResponse.json({ message: 'Plataforma não encontrada.' }, { status: 404 })

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`aluno-login:${ip}`, 8, 5 * 60 * 1000).ok || !rateLimit(`aluno-login:${email}`, 5, 5 * 60 * 1000).ok) {
    return NextResponse.json({ message: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 })
  }

  const supabase = await createServiceClient()

  // Método de identificação do tenant (email | email_cpf | email_telefone).
  const { data: cfg } = await supabase
    .from('simulado_embed_config')
    .select('metodo_identificacao')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  const metodo = (cfg?.metodo_identificacao as string) ?? 'email'

  // deletado=false + limit(1): ignora cadastro soft-deletado e tolera e-mail duplicado
  // (senão o .maybeSingle() falha com 2 linhas → "cadastro não encontrado" indevido).
  const { data: estudantesMatch } = await supabase
    .from('simulado_estudantes')
    .select('id, nome, email, cpf, telefone')
    .eq('tenant_id', tenantId)
    .eq('deletado', false)
    .ilike('email', email)
    .order('id')
    .limit(1)
  const estudante = estudantesMatch?.[0]

  if (!estudante) {
    return NextResponse.json({ message: 'Não encontramos seu cadastro nesta plataforma.' }, { status: 403 })
  }

  if (metodo === 'email_cpf') {
    const a = body.cpf?.replace(/\D/g, '') ?? ''
    const b = (estudante.cpf as string | null)?.replace(/\D/g, '') ?? ''
    if (!a || a !== b) return NextResponse.json({ message: 'CPF não confere com o cadastro.' }, { status: 403 })
  } else if (metodo === 'email_telefone') {
    const a = body.telefone?.replace(/\D/g, '') ?? ''
    const b = (estudante.telefone as string | null)?.replace(/\D/g, '') ?? ''
    if (!a || a !== b) return NextResponse.json({ message: 'Telefone não confere com o cadastro.' }, { status: 403 })
  }

  await criarSessaoAluno({ estudanteId: estudante.id, tenantId, nome: estudante.nome ?? 'Aluno', email: (estudante.email as string | null) ?? email })
  // Auditoria: acesso do aluno à plataforma (portal). ator_id fica no entidade_id p/ evitar FK.
  await registrarAudit({ operacao: 'LOGIN', entidade: 'aluno_portal', entidadeId: estudante.id, atorTipo: 'estudante', tenantId, depois: { nome: estudante.nome ?? 'Aluno', email: (estudante.email as string | null) ?? email } })
  return NextResponse.json({ ok: true })
}
