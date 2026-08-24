import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { criarSessaoAluno } from '@/lib/aluno-session'
import { rateLimit } from '@/lib/rate-limit'
import { registrarAudit } from '@/lib/audit'
import { getManutencaoSistema, emManutencaoAgora } from '@/lib/sistema/manutencao'

// POST /api/aluno/login — login leve persistente do aluno (sem senha).
// Endpoint dinamico (sessao/dados/mutacao) — nunca cachear estaticamente.
export const dynamic = 'force-dynamic'

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

  // Manutenção da plataforma: bloqueia novos acessos ao portal (quem já está numa prova não passa por aqui).
  const manut = await getManutencaoSistema()
  if (emManutencaoAgora(manut)) {
    return NextResponse.json({ message: manut.mensagem, titulo: manut.titulo, manutencao: true }, { status: 503 })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`aluno-login:${ip}`, 8, 5 * 60 * 1000).ok || !rateLimit(`aluno-login:${email}`, 5, 5 * 60 * 1000).ok) {
    return NextResponse.json({ message: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 })
  }

  // IMPORTANTE: service role REAL (bypassa RLS). NÃO usar createServiceClient aqui —
  // ele herda o cookie de sessão: se houver um admin logado no mesmo navegador
  // (comum ao testar links, e cross-subdomínio com COOKIE_DOMAIN), a leitura de
  // simulado_tenants/estudantes roda sob RLS como aquele admin → 0 linhas →
  // "Plataforma indisponível" falso. Login é pré-auth do aluno: sempre service role.
  const supabase = createAdminClient()

  // Visibilidade da plataforma: só aluno entra em plataforma "Todos" (ativo=true).
  // "Só admin" (teste) e "Oculta" bloqueiam o acesso do aluno ao portal.
  const { data: tnt } = await supabase.from('simulado_tenants').select('ativo').eq('id', tenantId).maybeSingle()
  if (!tnt?.ativo) {
    return NextResponse.json({ message: 'Plataforma indisponível no momento.' }, { status: 403 })
  }

  // Método de identificação do tenant (email | email_cpf | email_telefone).
  const { data: cfg } = await supabase
    .from('simulado_embed_config')
    .select('metodo_identificacao')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  const metodo = (cfg?.metodo_identificacao as string) ?? 'email'

  // Identifica por e-mail PRINCIPAL ou por qualquer SECUNDÁRIO (mesmo perfil). deletado=false +
  // limit(1): ignora cadastro soft-deletado e tolera e-mail duplicado (senão 2 linhas quebrariam).
  const { data: estudantesMatch } = await supabase
    .from('simulado_estudantes')
    .select('id, nome, email, cpf, telefone')
    .eq('tenant_id', tenantId)
    .eq('deletado', false)
    .or(`email.ilike.${email},emails_secundarios.cs.{${email}}`)
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

  // Exibe o e-mail que a pessoa REALMENTE usou para entrar (pode ser um secundário) — o acesso
  // é o mesmo perfil de qualquer forma. Assim o portal mostra o e-mail digitado, não o principal.
  const emailLogin = email || (estudante.email as string | null) || undefined
  await criarSessaoAluno({ estudanteId: estudante.id, tenantId, nome: estudante.nome ?? 'Aluno', email: emailLogin })
  // Auditoria: acesso do aluno à plataforma (portal). ator_id fica no entidade_id p/ evitar FK.
  await registrarAudit({ operacao: 'LOGIN', entidade: 'aluno_portal', entidadeId: estudante.id, atorTipo: 'estudante', tenantId, depois: { nome: estudante.nome ?? 'Aluno', email: emailLogin, email_conta: (estudante.email as string | null) ?? null } })
  return NextResponse.json({ ok: true })
}
