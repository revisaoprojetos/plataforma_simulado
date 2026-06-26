import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// POST /api/sessoes/resposta — auto-save idempotente de uma resposta.
export async function POST(request: NextRequest) {
  let body: { sessao_id?: string; questao_id?: string; alternativa_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })
  }

  const { sessao_id, questao_id, alternativa_id } = body
  if (!sessao_id || !questao_id || !alternativa_id) {
    return NextResponse.json({ message: 'Dados obrigatórios ausentes.' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: sessao } = await supabase
    .from('simulado_sessoes_prova')
    .select('id, status, tenant_id')
    .eq('id', sessao_id)
    .maybeSingle()

  if (!sessao) {
    return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })
  }
  if (sessao.status === 'finalizada') {
    return NextResponse.json({ message: 'Sessão já finalizada.' }, { status: 400 })
  }

  // Valida a alternativa e captura o gabarito vigente (snapshot).
  const { data: alt } = await supabase
    .from('simulado_alternativas')
    .select('id, correta')
    .eq('id', alternativa_id)
    .eq('questao_id', questao_id)
    .maybeSingle()

  if (!alt) {
    return NextResponse.json({ message: 'Alternativa inválida.' }, { status: 400 })
  }

  const { error } = await supabase.from('simulado_respostas_objetivas').upsert(
    {
      tenant_id: sessao.tenant_id,
      sessao_id,
      questao_id,
      alternativa_id,
      correta: alt.correta,
      pontuacao: alt.correta ? 1 : 0,
      snapshot_gabarito: { alternativa_id: alt.id, correta: alt.correta },
      respondido_em: new Date().toISOString(),
    },
    { onConflict: 'sessao_id,questao_id' },
  )

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 })
  }

  return NextResponse.json({ saved: true })
}
