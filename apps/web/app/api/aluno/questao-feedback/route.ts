import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { rateLimit } from '@/lib/rate-limit'

const TIPOS = ['erro_gabarito', 'alternativa_incorreta', 'enunciado_confuso', 'erro_portugues', 'imagem_problema', 'desatualizada', 'duplicada', 'comentario_incorreto', 'outro']

// POST /api/aluno/questao-feedback — feedback/erro de uma questão na PRÁTICA (sem sessão de prova).
// Autentica pelo cookie assinado do aluno; grava em simulado_feedbacks_questao com sessao_id nulo.
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  let body: { questao_id?: string; tipo?: string; mensagem?: string }
  try { body = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  const { questao_id, tipo, mensagem } = body
  if (!questao_id || !tipo) return NextResponse.json({ message: 'Dados ausentes.' }, { status: 400 })
  if (!TIPOS.includes(tipo)) return NextResponse.json({ message: 'Tipo inválido.' }, { status: 400 })

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`feedback:${ip}`, 20, 5 * 60 * 1000).ok) {
    return NextResponse.json({ message: 'Muitas solicitações. Tente novamente em instantes.' }, { status: 429 })
  }

  const svc = createAdminClient()
  try {
    // A questão precisa ser do tenant do aluno (evita reportar questão de outra plataforma).
    const { data: q } = await svc.from('simulado_questoes').select('tenant_id').eq('id', questao_id).maybeSingle()
    if (!q || q.tenant_id !== sessao.tenantId) return NextResponse.json({ message: 'Questão inválida.' }, { status: 400 })

    const { error } = await svc.from('simulado_feedbacks_questao').insert({
      tenant_id: sessao.tenantId,
      questao_id,
      estudante_id: sessao.estudanteId,
      sessao_id: null,
      tipo,
      mensagem: (mensagem ?? '').slice(0, 1000) || null,
      status: 'pendente',
      resolvido: false,
    })
    if (error) return NextResponse.json({ message: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ message: e?.message ?? 'Erro ao enviar.' }, { status: 500 })
  }
}
