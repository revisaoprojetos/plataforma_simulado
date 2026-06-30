import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/sessoes/resultado?st={sessao_id}
// Dados da central de revisão: resumo + questões com resposta do aluno.
// O gabarito (alternativa correta) só é revelado se liberado pela config do simulado.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const st = searchParams.get('st')
  if (!st) return NextResponse.json({ message: 'Sessão ausente.' }, { status: 400 })

  const supabase = await createServiceClient()

  const { data: sessao } = await supabase
    .from('simulado_sessoes_prova')
    .select('id, simulado_id, status, nota, posicao_ranking')
    .eq('id', st)
    .maybeSingle()
  if (!sessao) return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })

  // Total de participantes (alunos distintos finalizados, exceto testes) — contexto do ranking.
  const { data: participantes } = await supabase
    .from('simulado_sessoes_prova')
    .select('estudante_id')
    .eq('simulado_id', sessao.simulado_id)
    .eq('is_teste', false)
    .eq('status', 'finalizada')
    .eq('deletado', false)
  const totalParticipantes = new Set((participantes ?? []).map((p: any) => p.estudante_id)).size

  const { data: simulado } = await supabase
    .from('simulado_simulados')
    .select('titulo, status, data_fim, regras')
    .eq('id', sessao.simulado_id)
    .single()

  const regras = (simulado?.regras as { liberar_gabarito?: string; gabarito_liberado?: boolean }) ?? {}
  const liberar = regras.liberar_gabarito ?? 'apos_janela'
  const agora = new Date()
  let gabaritoLiberado = false
  if (regras.gabarito_liberado) gabaritoLiberado = true // liberação manual (qualquer modo)
  else if (liberar === 'imediato') gabaritoLiberado = true
  else if (liberar === 'apos_janela') {
    gabaritoLiberado =
      simulado?.status === 'encerrado' ||
      (!!simulado?.data_fim && new Date(simulado.data_fim) < agora)
  }

  const { data: sq } = await supabase
    .from('simulado_prova_questoes')
    .select('ordem, questoes:simulado_questoes(id, tipo, enunciado, disciplina_id, disciplinas:simulado_disciplinas(nome), alternativas:simulado_alternativas(id, texto, ordem))')
    .eq('simulado_id', sessao.simulado_id)
    .eq('anulada', false)
    .order('ordem')

  const { data: respostas } = await supabase
    .from('simulado_respostas_objetivas')
    .select('questao_id, alternativa_id, correta')
    .eq('sessao_id', st)

  // Respostas discursivas desta sessão (com correção, se houver).
  const { data: disc } = await supabase
    .from('simulado_respostas_discursivas')
    .select('questao_id, texto, status, nota, feedback')
    .eq('sessao_id', st)
  const discMap = new Map((disc ?? []).map((d: any) => [d.questao_id, d]))

  // Para revelar o gabarito, buscamos as alternativas corretas separadamente.
  let corretasMap = new Map<string, string>() // questao_id -> alternativa_id correta
  if (gabaritoLiberado) {
    const questaoIds = (sq ?? []).map((r: any) => r.questoes?.id).filter(Boolean)
    if (questaoIds.length) {
      const { data: corretas } = await supabase
        .from('simulado_alternativas')
        .select('id, questao_id')
        .in('questao_id', questaoIds)
        .eq('correta', true)
      corretasMap = new Map((corretas ?? []).map((a) => [a.questao_id as string, a.id as string]))
    }
  }

  const respMap = new Map((respostas ?? []).map((r) => [r.questao_id as string, r]))
  const total = (sq ?? []).length
  const acertos = (respostas ?? []).filter((r) => r.correta).length

  // Estatística por matéria/disciplina (só quando o gabarito está liberado).
  let statsPorDisciplina: Array<{ disciplina: string; acertos: number; total: number; percentual: number }> = []
  if (gabaritoLiberado) {
    const agg = new Map<string, { acertos: number; total: number }>()
    for (const row of sq ?? []) {
      const q = (row as any).questoes
      const disc = q?.disciplinas?.nome ?? 'Sem matéria'
      const resp = respMap.get(q?.id)
      const cur = agg.get(disc) ?? { acertos: 0, total: 0 }
      cur.total += 1
      if (resp?.correta) cur.acertos += 1
      agg.set(disc, cur)
    }
    statsPorDisciplina = [...agg.entries()]
      .map(([disciplina, v]) => ({
        disciplina,
        acertos: v.acertos,
        total: v.total,
        percentual: v.total > 0 ? Math.round((v.acertos / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }

  const questoes = (sq ?? []).map((row: any, idx: number) => {
    const q = row.questoes
    const resp = respMap.get(q?.id)
    const correta_id = corretasMap.get(q?.id) ?? null
    const d = discMap.get(q?.id)
    return {
      numero: idx + 1,
      id: q?.id,
      tipo: q?.tipo ?? 'objetiva',
      enunciado: q?.enunciado ?? '',
      resposta_aluno: resp?.alternativa_id ?? null,
      acertou: gabaritoLiberado ? resp?.correta ?? false : null,
      // Para discursiva: a resposta escrita + estado da correção.
      discursiva: q?.tipo === 'discursiva' && d
        ? { texto: d.texto ?? '', status: d.status, nota: d.nota, feedback: d.feedback }
        : null,
      alternativas: (q?.alternativas ?? [])
        .slice()
        .sort((a: any, b: any) => a.ordem - b.ordem)
        .map((a: any) => ({
          id: a.id,
          texto: a.texto,
          correta: gabaritoLiberado ? a.id === correta_id : undefined,
        })),
    }
  })

  return NextResponse.json({
    titulo: simulado?.titulo ?? 'Simulado',
    nota: sessao.nota ?? null,
    acertos,
    total,
    posicao: sessao.posicao_ranking ?? null,
    total_participantes: totalParticipantes ?? 0,
    stats_por_disciplina: statsPorDisciplina,
    gabarito_liberado: gabaritoLiberado,
    questoes,
  })
}
