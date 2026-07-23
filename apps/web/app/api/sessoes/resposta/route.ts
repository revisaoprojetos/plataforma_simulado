import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sessaoExpirada } from '@/lib/simulado/sessao-expiry'

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
    .select('id, status, tenant_id, simulado_id, iniciado_em')
    .eq('id', sessao_id)
    .maybeSingle()

  if (!sessao) {
    return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })
  }
  if (sessao.status === 'finalizada') {
    return NextResponse.json({ message: 'Sessão já finalizada.' }, { status: 400 })
  }

  // Autoridade do servidor sobre tempo/janela: recusa a resposta se o limite individual
  // (início + tempo_limite) ou o data_fim do simulado já passou. O timer do cliente é só UX;
  // o auto-encerramento (cron) finaliza a sessão logo em seguida.
  const { data: sim } = await supabase
    .from('simulado_simulados')
    .select('tempo_limite_min, data_fim')
    .eq('id', sessao.simulado_id)
    .maybeSingle()
  if (sessaoExpirada(sessao.iniciado_em, sim?.tempo_limite_min, sim?.data_fim)) {
    return NextResponse.json({ message: 'Tempo esgotado — a prova não aceita mais respostas.', expirado: true }, { status: 409 })
  }

  // Valida a alternativa e já resolve a LETRA (por ordem) para armazenar — assim a
  // exibição (caderno, gabarito, mala direta) lê o valor pronto, sem recalcular.
  const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']
  const { data: qAlts } = await supabase
    .from('simulado_alternativas')
    .select('id, correta, ordem')
    .eq('questao_id', questao_id)
    .order('ordem')
  const idx = (qAlts ?? []).findIndex((a) => a.id === alternativa_id)
  if (idx < 0) {
    return NextResponse.json({ message: 'Alternativa inválida.' }, { status: 400 })
  }
  const alt = qAlts![idx]
  const letra = LETRA[idx] ?? '?'

  const { error } = await supabase.from('simulado_respostas_objetivas').upsert(
    {
      tenant_id: sessao.tenant_id,
      sessao_id,
      questao_id,
      alternativa_id,
      correta: alt.correta,
      pontuacao: alt.correta ? 1 : 0,
      // letra armazenada junto (valor pronto p/ exibição, sem recalcular depois).
      snapshot_gabarito: { alternativa_id: alt.id, correta: alt.correta, letra },
      respondido_em: new Date().toISOString(),
    },
    { onConflict: 'sessao_id,questao_id' },
  )

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 })
  }

  return NextResponse.json({ saved: true })
}
