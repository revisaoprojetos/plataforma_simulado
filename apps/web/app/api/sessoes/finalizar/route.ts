import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { rankearSimulado } from '@/lib/ranking'
import { dispararWebhook } from '@/lib/webhooks/dispatch'
import { dadosProgressao } from '@/lib/webhooks/payload'

// POST /api/sessoes/finalizar — finaliza a sessão e calcula a nota.
export async function POST(request: NextRequest) {
  let body: { sessao_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })
  }

  const { sessao_id } = body
  if (!sessao_id) {
    return NextResponse.json({ message: 'Sessão ausente.' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: sessao } = await supabase
    .from('simulado_sessoes_prova')
    .select('id, simulado_id, status, tenant_id, estudante_id')
    .eq('id', sessao_id)
    .maybeSingle()

  if (!sessao) {
    return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })
  }

  // Total de questões válidas do simulado (denominador da nota).
  const { count: total } = await supabase
    .from('simulado_prova_questoes')
    .select('*', { count: 'exact', head: true })
    .eq('simulado_id', sessao.simulado_id)
    .eq('anulada', false)

  const { data: respostas } = await supabase
    .from('simulado_respostas_objetivas')
    .select('correta')
    .eq('sessao_id', sessao_id)

  const totalQ = total ?? 0
  const acertos = (respostas ?? []).filter((r) => r.correta).length
  const nota = totalQ > 0 ? (acertos / totalQ) * 10 : 0

  if (sessao.status !== 'finalizada') {
    await supabase
      .from('simulado_sessoes_prova')
      .update({ status: 'finalizada', finalizado_em: new Date().toISOString(), nota })
      .eq('id', sessao_id)

    await supabase.from('simulado_sessao_eventos').insert({
      tenant_id: sessao.tenant_id,
      sessao_id,
      tipo: 'finalizou',
    })

    await rankearSimulado(supabase, sessao.simulado_id)

    // Notifica sistemas externos (webhooks/n8n): estudante finalizou.
    await dispararWebhook(sessao.tenant_id, 'estudante.finalizou',
      await dadosProgressao(supabase, sessao, { nota: Math.round(nota * 100) / 100, acertos, total: totalQ }))
  }

  // Posição final do aluno (após o recálculo).
  const { data: ranked } = await supabase
    .from('simulado_sessoes_prova')
    .select('posicao_ranking')
    .eq('id', sessao_id)
    .maybeSingle()

  return NextResponse.json({ nota, acertos, total: totalQ, posicao: ranked?.posicao_ranking ?? null })
}
