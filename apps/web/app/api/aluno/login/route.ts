import { NextRequest, NextResponse } from 'next/server'
import { registrarAcesso, ipDeHeaders, type MetodoAcesso } from '@/lib/acessos/registro'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { criarSessaoAluno } from '@/lib/aluno-session'
import { limitar } from '@/lib/rate-limit'
import { registrarAudit } from '@/lib/audit'
import { emailSeguro, filtroEmailOr } from '@/lib/seguranca/email-seguro'
import { getManutencaoSistema, emManutencaoAgora } from '@/lib/sistema/manutencao'

// POST /api/aluno/login — login leve persistente do aluno (sem senha).
// Endpoint dinamico (sessao/dados/mutacao) — nunca cachear estaticamente.
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let body: { email?: string; cpf?: string; telefone?: string; embed?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })
  }

  const emailRaw = typeof body.email === 'string' ? body.email.toLowerCase().trim() : ''
  if (!emailRaw) return NextResponse.json({ message: 'Informe seu e-mail.' }, { status: 400 })
  // E-mail com caracteres de filtro PostgREST/formato inválido: mesma resposta de "não encontrado" (sem vazar o motivo).
  const email = emailSeguro(emailRaw)
  if (!email) return NextResponse.json({ message: 'Não encontramos seu cadastro nesta plataforma.' }, { status: 403 })

  const tenantId = await getCurrentTenantId()
  if (!tenantId) return NextResponse.json({ message: 'Plataforma não encontrada.' }, { status: 404 })

  // Manutenção da plataforma: bloqueia novos acessos ao portal (quem já está numa prova não passa por aqui).
  const manut = await getManutencaoSistema()
  if (emManutencaoAgora(manut)) {
    return NextResponse.json({ message: manut.mensagem, titulo: manut.titulo, manutencao: true }, { status: 503 })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  // IP compartilhado (Curseduca/NAT): teto por IP folgado; a proteção fina é por IP+e-mail e por e-mail.
  const bloq = await limitar([
    [`aluno-login:ip:${ip}`, 40, 5 * 60 * 1000],
    [`aluno-login:${ip}:${email}`, 8, 5 * 60 * 1000],
    [`aluno-login:${email}`, 5, 5 * 60 * 1000],
  ], 'Muitas tentativas. Aguarde alguns minutos.')
  if (bloq) return bloq

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
    .or(filtroEmailOr(email))
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

  // CS › Membros: acesso bloqueado pelo admin (migração 20261112040000). Só depois de validar CPF/telefone (não revela o bloqueio a quem não prova a identidade). Consulta À PARTE e tolerante:
  // sem a coluna (migração pendente) o erro é ignorado e o login segue como sempre.
  try {
    const { data: bl, error: blErr } = await supabase.from('simulado_estudantes').select('acesso_bloqueado').eq('id', estudante.id).maybeSingle()
    if (!blErr && (bl as { acesso_bloqueado?: boolean } | null)?.acesso_bloqueado === true) {
      return NextResponse.json({ message: 'Seu acesso está bloqueado. Fale com o suporte.' }, { status: 403 })
    }
  } catch { /* coluna ausente → não bloqueia */ }

  // Exibe o e-mail que a pessoa REALMENTE usou para entrar (pode ser um secundário) — o acesso
  // é o mesmo perfil de qualquer forma. Assim o portal mostra o e-mail digitado, não o principal.
  const emailLogin = email || (estudante.email as string | null) || undefined
  // Registro de acessos (IP/aparelho/método): o id da linha é o jti do JWT. Fire-and-forget — nunca quebra o login.
  const acessoId = crypto.randomUUID()
  await criarSessaoAluno({ estudanteId: estudante.id, tenantId, nome: estudante.nome ?? 'Aluno', email: emailLogin, acessoId })
  try {
    registrarAcesso({
      id: acessoId, tenantId, estudanteId: estudante.id, metodo: metodo as MetodoAcesso,
      origem: body.embed === true ? 'curseduca-iframe' : 'portal',
      ctx: { ip: ipDeHeaders(request.headers), ua: request.headers.get('user-agent')?.slice(0, 400) ?? null },
    })
  } catch { /* registro é best-effort */ }
  // CS › Membros: carimba o último acesso (alimenta "Sem acesso há dias"). Best-effort; sem a coluna é no-op.
  try { await supabase.from('simulado_estudantes').update({ ultimo_acesso_em: new Date().toISOString() }).eq('id', estudante.id) } catch { /* coluna ausente */ }
  // Auditoria: acesso do aluno à plataforma (portal). ator_id fica no entidade_id p/ evitar FK.
  await registrarAudit({ operacao: 'LOGIN', entidade: 'aluno_portal', entidadeId: estudante.id, atorTipo: 'estudante', tenantId, depois: { nome: estudante.nome ?? 'Aluno', email: emailLogin, email_conta: (estudante.email as string | null) ?? null } })
  return NextResponse.json({ ok: true })
}
