import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface RequestBody {
  embed_token?: string
  token?: string
  email: string
  cpf?: string
  telefone?: string
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

  const supabase = await createServiceClient()

  // 1. Buscar simulado por embed_token
  const { data: simulado, error: simError } = await supabase
    .from('simulados')
    .select('id, titulo, status, metodo_identificacao, embed_ativo, tenant_id, data_inicio, data_fim, tempo_limite_min')
    .eq('embed_token', embed_token)
    .single()

  if (simError || !simulado) {
    return NextResponse.json({ message: 'Simulado não encontrado.' }, { status: 404 })
  }

  if (!simulado.embed_ativo) {
    return NextResponse.json({ message: 'Embed não habilitado para este simulado.' }, { status: 403 })
  }

  if (simulado.status !== 'publicado' && simulado.status !== 'ativo') {
    return NextResponse.json({ message: 'Este simulado não está disponível no momento.' }, { status: 403 })
  }

  // Verificar janela temporal se aplicável
  const agora = new Date()
  if (simulado.data_inicio && new Date(simulado.data_inicio) > agora) {
    return NextResponse.json({ message: 'Este simulado ainda não foi iniciado.' }, { status: 403 })
  }
  if (simulado.data_fim && new Date(simulado.data_fim) < agora) {
    return NextResponse.json({ message: 'O período de realização deste simulado encerrou.' }, { status: 403 })
  }

  // 2. Buscar estudante por email (+ cpf ou telefone conforme metodo)
  const metodo = (simulado.metodo_identificacao as string) ?? 'email_cpf'

  let estudanteQuery = supabase
    .from('estudantes')
    .select('id, nome, user_id, cpf, telefone')
    .eq('tenant_id', simulado.tenant_id)

  // Join via users table for email
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .limit(1)

  if (!users || users.length === 0) {
    return NextResponse.json({ message: 'Identidade não encontrada. Verifique seus dados.' }, { status: 403 })
  }

  const userId = users[0].id

  const { data: estudante } = await estudanteQuery
    .eq('user_id', userId)
    .single()

  if (!estudante) {
    return NextResponse.json({ message: 'Identidade não encontrada. Verifique seus dados.' }, { status: 403 })
  }

  // Validar segundo fator conforme metodo
  if (metodo === 'email_cpf') {
    if (!cpf) {
      return NextResponse.json({ message: 'CPF é obrigatório para este simulado.' }, { status: 400 })
    }
    const cpfNorm = cpf.replace(/\D/g, '')
    const estudanteCpfNorm = (estudante.cpf as string | null)?.replace(/\D/g, '') ?? ''
    if (cpfNorm !== estudanteCpfNorm) {
      return NextResponse.json({ message: 'Identidade não encontrada. Verifique seus dados.' }, { status: 403 })
    }
  } else if (metodo === 'email_telefone') {
    if (!telefone) {
      return NextResponse.json({ message: 'Telefone é obrigatório para este simulado.' }, { status: 400 })
    }
    const telNorm = telefone.replace(/\D/g, '')
    const estudanteTelNorm = (estudante.telefone as string | null)?.replace(/\D/g, '') ?? ''
    if (telNorm !== estudanteTelNorm) {
      return NextResponse.json({ message: 'Identidade não encontrada. Verifique seus dados.' }, { status: 403 })
    }
  }

  // 3. Verificar matrícula ativa OU acesso avulso
  const temAcesso = await verificarAcesso(supabase, estudante.id, simulado.id)
  if (!temAcesso) {
    return NextResponse.json({
      message: 'Você não tem matrícula ativa ou acesso a este simulado. Entre em contato com o suporte.',
    }, { status: 403 })
  }

  // 4. Abrir ou retomar sessao_prova
  const { data: sessaoExistente } = await supabase
    .from('sessoes_prova')
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
      .from('sessoes_prova')
      .insert({
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
  // Verificar matrícula ativa
  const { data: matricula } = await supabase
    .from('matriculas')
    .select('id')
    .eq('estudante_id', estudanteId)
    .eq('status', 'ativa')
    .limit(1)
    .single()

  if (matricula) return true

  // Verificar acesso avulso (simulado_acessos)
  const agora = new Date().toISOString()
  const { data: acesso } = await supabase
    .from('simulado_acessos')
    .select('id, tentativas_permitidas, tentativas_usadas')
    .eq('simulado_id', simuladoId)
    .eq('estudante_id', estudanteId)
    .or(`expira_em.is.null,expira_em.gt.${agora}`)
    .limit(1)
    .single()

  if (!acesso) return false

  const permitidas = acesso.tentativas_permitidas ?? null
  const usadas = acesso.tentativas_usadas ?? 0
  if (permitidas !== null && usadas >= permitidas) return false

  return true
}
