import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'

// Report GERAL do simulado (não de uma questão específica) — grava em simulado_feedbacks_questao
// com questao_id NULL (coluna é nullable). Reaproveita a fila de feedbacks (moderação do admin).
const TIPOS = ['erro_questao', 'erro_gabarito', 'problema_tecnico', 'sugestao', 'outro']
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let body: { sessao_id?: string; tipo?: string; mensagem?: string }
  try { body = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }

  const { sessao_id, tipo, mensagem } = body
  if (!sessao_id || !tipo) return NextResponse.json({ message: 'Dados obrigatórios ausentes.' }, { status: 400 })
  if (!TIPOS.includes(tipo)) return NextResponse.json({ message: 'Tipo inválido.' }, { status: 400 })

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`reportar-sim:${ip}`, 20, 5 * 60 * 1000).ok) {
    return NextResponse.json({ message: 'Muitas solicitações. Tente novamente em instantes.' }, { status: 429 })
  }

  const supabase = createAdminClient()
  const { data: sessao } = await supabase
    .from('simulado_sessoes_prova')
    .select('id, tenant_id, estudante_id, simulado_id')
    .eq('id', sessao_id)
    .maybeSingle()
  if (!sessao) return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })

  const { error } = await supabase.from('simulado_feedbacks_questao').insert({
    tenant_id: sessao.tenant_id,
    questao_id: null,
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
