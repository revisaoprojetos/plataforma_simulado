import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getTenantMensagem, getTenantContato, type TenantContato } from '@/lib/tenant-messages'
import { rateLimit } from '@/lib/rate-limit'

interface RequestBody {
  embed_token?: string
  token?: string
  email: string
  cpf?: string
  telefone?: string
}

/** Monta um texto curto de contato a partir dos canais do tenant. */
function formatarContato(c: TenantContato): string {
  if (c.whatsapp) return `WhatsApp ${c.whatsapp}`
  if (c.email_suporte) return c.email_suporte
  if (c.telefone) return c.telefone
  if (c.link_ajuda) return c.link_ajuda
  return 'o suporte'
}

/**
 * Resposta de bloqueio personalizada pelo tenant (mensagem + variáveis + contato).
 * Retorna { titulo, message, contato } com status 403.
 */
async function bloqueio(
  tenantId: string,
  chave: string,
  vars: Record<string, string>,
) {
  const contato = await getTenantContato(tenantId)
  const msg = await getTenantMensagem(chave, { contato: formatarContato(contato), ...vars }, tenantId)
  return NextResponse.json(
    { titulo: msg.titulo, message: msg.corpo, contato },
    { status: 403 },
  )
}

export async function POST(request: NextRequest) {
  let body: RequestBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })
  }

  // Accept both embed_token (embed flow) and token (aluno/login flow)
  const embed_token = body.embed_token ?? body.token
  const { email, cpf, telefone } = body

  if (!embed_token || !email) {
    return NextResponse.json({ message: 'Dados obrigatórios ausentes.' }, { status: 400 })
  }

  // Rate-limit: protege o 2º fator (CPF/telefone) contra brute-force.
  // Por IP+simulado (8 tentativas / 5 min) e por e-mail+simulado (5 / 5 min).
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip') || 'unknown'
  const janela = 5 * 60 * 1000
  const rlIp = rateLimit(`identify:ip:${ip}:${embed_token}`, 8, janela)
  const rlEmail = rateLimit(`identify:email:${email.toLowerCase().trim()}:${embed_token}`, 5, janela)
  if (!rlIp.ok || !rlEmail.ok) {
    const retry = Math.max(rlIp.retryAfter, rlEmail.retryAfter)
    return NextResponse.json(
      { titulo: 'Muitas tentativas', message: `Você excedeu o limite de tentativas. Aguarde ${retry}s e tente novamente.` },
      { status: 429, headers: { 'Retry-After': String(retry) } },
    )
  }

  const supabase = await createServiceClient()

  // 1. Buscar simulado por embed_token
  const { data: simulado, error: simError } = await supabase
    .from('simulado_simulados')
    .select('id, titulo, status, metodo_identificacao, embed_ativo, tenant_id, data_inicio, data_fim, tempo_limite_min')
    .eq('embed_token', embed_token)
    .single()

  if (simError || !simulado) {
    return NextResponse.json({ message: 'Simulado não encontrado.' }, { status: 404 })
  }

  const tenantId = simulado.tenant_id as string
  const tituloSimulado = (simulado.titulo as string) ?? ''

  if (simulado.status !== 'publicado' && simulado.status !== 'ativo') {
    return bloqueio(tenantId, 'bloqueio_fora_janela', { simulado: tituloSimulado })
  }

  // Verificar janela temporal se aplicável
  const agora = new Date()
  if (simulado.data_inicio && new Date(simulado.data_inicio) > agora) {
    return bloqueio(tenantId, 'bloqueio_fora_janela', { simulado: tituloSimulado })
  }
  if (simulado.data_fim && new Date(simulado.data_fim) < agora) {
    return bloqueio(tenantId, 'bloqueio_prazo_expirado', { simulado: tituloSimulado })
  }

  // 2. Buscar estudante por email no tenant do simulado
  const metodo = (simulado.metodo_identificacao as string) ?? 'email'

  const { data: estudante } = await supabase
    .from('simulado_estudantes')
    .select('id, nome, user_id, cpf, telefone')
    .eq('tenant_id', simulado.tenant_id)
    .ilike('email', email.toLowerCase().trim())
    .maybeSingle()

  if (!estudante) {
    return bloqueio(tenantId, 'bloqueio_identidade', { simulado: tituloSimulado })
  }

  // Validar segundo fator conforme metodo
  if (metodo === 'email_cpf') {
    if (!cpf) {
      return NextResponse.json({ message: 'CPF é obrigatório para este simulado.' }, { status: 400 })
    }
    const cpfNorm = cpf.replace(/\D/g, '')
    const estudanteCpfNorm = (estudante.cpf as string | null)?.replace(/\D/g, '') ?? ''
    if (cpfNorm !== estudanteCpfNorm) {
      return bloqueio(tenantId, 'bloqueio_identidade', { nome: estudante.nome ?? '', simulado: tituloSimulado })
    }
  } else if (metodo === 'email_telefone') {
    if (!telefone) {
      return NextResponse.json({ message: 'Telefone é obrigatório para este simulado.' }, { status: 400 })
    }
    const telNorm = telefone.replace(/\D/g, '')
    const estudanteTelNorm = (estudante.telefone as string | null)?.replace(/\D/g, '') ?? ''
    if (telNorm !== estudanteTelNorm) {
      return bloqueio(tenantId, 'bloqueio_identidade', { nome: estudante.nome ?? '', simulado: tituloSimulado })
    }
  }

  // 3. Verificar matrícula ativa para este simulado
  const temAcesso = await verificarAcesso(supabase, estudante.id, simulado.id)
  if (!temAcesso) {
    return bloqueio(tenantId, 'bloqueio_sem_matricula', { nome: estudante.nome ?? '', simulado: tituloSimulado })
  }

  // 4. Abrir ou retomar sessao_prova
  const { data: sessaoExistente } = await supabase
    .from('simulado_sessoes_prova')
    .select('id, status')
    .eq('simulado_id', simulado.id)
    .eq('estudante_id', estudante.id)
    .eq('is_teste', false)
    .neq('status', 'finalizada')
    .order('iniciado_em', { ascending: false })
    .limit(1)
    .single()

  let sessaoId: string

  if (sessaoExistente) {
    sessaoId = sessaoExistente.id
  } else {
    const { data: novaSessao, error: sessaoError } = await supabase
      .from('simulado_sessoes_prova')
      .insert({
        tenant_id: simulado.tenant_id,
        simulado_id: simulado.id,
        estudante_id: estudante.id,
        is_teste: false,
        status: 'em_andamento',
        iniciado_em: new Date().toISOString(),
        tentativa_num: 1,
      })
      .select('id')
      .single()

    if (sessaoError || !novaSessao) {
      console.error('[embed/identify] Erro ao criar sessão:', sessaoError)
      return NextResponse.json({ message: 'Erro ao iniciar sessão. Tente novamente.' }, { status: 500 })
    }

    sessaoId = novaSessao.id
  }

  return NextResponse.json({
    sessao_id: sessaoId,
    sessionToken: sessaoId,
    estudante_nome: estudante.nome,
  })
}

async function verificarAcesso(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  estudanteId: string,
  simuladoId: string
): Promise<boolean> {
  // Matrícula ativa e liberada para este simulado.
  const { data: matricula } = await supabase
    .from('simulado_matriculas')
    .select('id, liberado, status')
    .eq('estudante_id', estudanteId)
    .eq('simulado_id', simuladoId)
    .maybeSingle()

  if (!matricula) return false
  if (matricula.status && matricula.status !== 'ativa') return false
  if (matricula.liberado === false) return false
  return true
}
