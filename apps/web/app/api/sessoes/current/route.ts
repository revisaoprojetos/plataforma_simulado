import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/sessoes/current?token={embed_token}&st={sessao_id}
// Carrega o estado da sessão para o runner do aluno.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const st = searchParams.get('st') // sessao_id (UUID)
  if (!st) {
    return NextResponse.json({ message: 'Sessão ausente.' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: sessao } = await supabase
    .from('simulado_sessoes_prova')
    .select('id, simulado_id, estudante_id, status, iniciado_em, tenant_id')
    .eq('id', st)
    .maybeSingle()

  if (!sessao) {
    return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })
  }

  const { data: simulado } = await supabase
    .from('simulado_simulados')
    .select('tempo_limite_min')
    .eq('id', sessao.simulado_id)
    .single()

  const { data: sq } = await supabase
    .from('simulado_prova_questoes')
    .select('ordem, questoes:simulado_questoes(id, tipo, enunciado, alternativas:simulado_alternativas(id, texto, ordem))')
    .eq('simulado_id', sessao.simulado_id)
    .eq('anulada', false)
    .order('ordem')

  const questoes = (sq ?? []).map((row: any) => ({
    id: row.questoes?.id,
    tipo: row.questoes?.tipo ?? 'objetiva',
    enunciado: row.questoes?.enunciado ?? '',
    alternativas: (row.questoes?.alternativas ?? [])
      .slice()
      .sort((a: any, b: any) => a.ordem - b.ordem)
      .map((a: any) => ({ id: a.id, texto: a.texto, ordem: a.ordem })),
  }))

  const { data: respostas } = await supabase
    .from('simulado_respostas_objetivas')
    .select('questao_id, alternativa_id')
    .eq('sessao_id', sessao.id)

  const respMap: Record<string, string> = {}
  for (const r of respostas ?? []) {
    if (r.alternativa_id) respMap[r.questao_id as string] = r.alternativa_id as string
  }

  // Respostas discursivas já escritas nesta sessão.
  const { data: disc } = await supabase
    .from('simulado_respostas_discursivas')
    .select('questao_id, texto')
    .eq('sessao_id', sessao.id)
  const respDisc: Record<string, string> = {}
  for (const d of disc ?? []) respDisc[d.questao_id as string] = (d.texto as string) ?? ''

  return NextResponse.json({
    id: sessao.id,
    questoes,
    tempo_limite_min: simulado?.tempo_limite_min ?? null,
    iniciado_em: sessao.iniciado_em,
    status: sessao.status,
    respostas: respMap,
    respostas_discursivas: respDisc,
  })
}
