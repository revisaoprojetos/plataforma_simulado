import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// POST /api/sessoes/resposta-discursiva — auto-save da resposta discursiva na prova.
export async function POST(request: NextRequest) {
  let body: { sessao_id?: string; questao_id?: string; texto?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Inválido.' }, { status: 400 })
  }
  const { sessao_id, questao_id } = body
  if (!sessao_id || !questao_id) return NextResponse.json({ message: 'Dados ausentes.' }, { status: 400 })

  const supabase = await createServiceClient()

  const { data: sessao } = await supabase
    .from('simulado_sessoes_prova')
    .select('id, tenant_id, estudante_id, status')
    .eq('id', sessao_id)
    .maybeSingle()
  if (!sessao) return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })
  if (sessao.status === 'finalizada') return NextResponse.json({ message: 'Sessão finalizada.' }, { status: 409 })

  const { error } = await supabase
    .from('simulado_respostas_discursivas')
    .upsert(
      {
        tenant_id: sessao.tenant_id,
        sessao_id,
        questao_id,
        estudante_id: sessao.estudante_id,
        texto: (body.texto ?? '').slice(0, 20000),
        status: 'pendente',
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'sessao_id,questao_id' },
    )
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  return NextResponse.json({ saved: true })
}
