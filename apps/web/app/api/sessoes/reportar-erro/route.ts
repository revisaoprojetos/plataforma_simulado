import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'

const TIPOS = ['erro_gabarito', 'enunciado_confuso', 'desatualizada', 'outro']

// POST /api/sessoes/reportar-erro — aluno reporta problema numa questão.
export async function POST(request: NextRequest) {
  let body: { sessao_id?: string; questao_id?: string; tipo?: string; mensagem?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })
  }

  const { sessao_id, questao_id, tipo, mensagem } = body
  if (!sessao_id || !questao_id || !tipo) {
    return NextResponse.json({ message: 'Dados obrigatórios ausentes.' }, { status: 400 })
  }
  if (!TIPOS.includes(tipo)) {
    return NextResponse.json({ message: 'Tipo inválido.' }, { status: 400 })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`reportar:${ip}`, 20, 5 * 60 * 1000).ok) {
    return NextResponse.json({ message: 'Muitas solicitações. Tente novamente em instantes.' }, { status: 429 })
  }

  const supabase = await createServiceClient()

  // Resolve a sessão para obter tenant + estudante (e validar que a questão pertence ao simulado).
  const { data: sessao } = await supabase
    .from('simulado_sessoes_prova')
    .select('id, tenant_id, estudante_id, simulado_id')
    .eq('id', sessao_id)
    .maybeSingle()
  if (!sessao) return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })

  const { data: vinculo } = await supabase
    .from('simulado_prova_questoes')
    .select('id')
    .eq('simulado_id', sessao.simulado_id)
    .eq('questao_id', questao_id)
    .maybeSingle()
  if (!vinculo) return NextResponse.json({ message: 'Questão não pertence a este simulado.' }, { status: 400 })

  const { error } = await supabase.from('simulado_feedbacks_questao').insert({
    tenant_id: sessao.tenant_id,
    questao_id,
    estudante_id: sessao.estudante_id,
    sessao_id,
    tipo,
    mensagem: (mensagem ?? '').slice(0, 1000) || null,
    status: 'pendente',
    resolvido: false,
  })
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
