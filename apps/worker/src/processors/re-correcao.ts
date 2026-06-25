import { Job } from 'bullmq'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

interface ReCorrecaoJobData {
  simulado_id: string
  questao_id: string
  tenant_id: string
  tipo: 'anulacao' | 'alteracao_gabarito' | 'troca_alternativa'
  motivo: string
  politica: 'pontua_todos' | 'descarta'
  executado_por: string
}

export async function reCorrecaoProcessor(job: Job) {
  const data = job.data as ReCorrecaoJobData
  const { simulado_id, questao_id, tenant_id, tipo, motivo, politica, executado_por } = data

  console.log(`[re-correcao] Tipo: ${tipo}, simulado: ${simulado_id}, questão: ${questao_id}`)

  // 1. Get all responses for this question in this simulado
  const { data: respostas, error: respostasError } = await supabase
    .from('respostas_objetivas')
    .select('id, sessao_id, correta, pontuacao, alternativa_id, snapshot_gabarito')
    .eq('questao_id', questao_id)
    .eq('tenant_id', tenant_id)

  if (respostasError) throw respostasError
  if (!respostas?.length) {
    console.log(`[re-correcao] Nenhuma resposta encontrada para questão ${questao_id}`)
    return { regraded: 0 }
  }

  // Filter only sessions belonging to this simulado
  const sessaoIds = [...new Set(respostas.map((r) => r.sessao_id as string))]
  const { data: sessoesDoSimulado } = await supabase
    .from('sessoes_prova')
    .select('id, nota, posicao_ranking, estudante_id')
    .in('id', sessaoIds)
    .eq('simulado_id', simulado_id)

  const sessaoIdsDoSimulado = new Set((sessoesDoSimulado ?? []).map((s) => s.id as string))
  const respostasFiltradas = respostas.filter((r) => sessaoIdsDoSimulado.has(r.sessao_id as string))

  if (!respostasFiltradas.length) {
    console.log(`[re-correcao] Nenhuma resposta no simulado ${simulado_id}`)
    return { regraded: 0 }
  }

  // 2. Snapshot before
  const sessaoBeforeMap = new Map(
    (sessoesDoSimulado ?? []).map((s) => [s.id as string, { nota: s.nota as number, rank: s.posicao_ranking as number }]),
  )

  // 3. Update responses based on policy
  for (const resposta of respostasFiltradas) {
    let novaCorreta = false
    let novaPontuacao = 0

    if (tipo === 'anulacao') {
      if (politica === 'pontua_todos') {
        novaCorreta = true
        novaPontuacao = 1
      }
      // descarta: both stay 0/false
    } else if (tipo === 'alteracao_gabarito') {
      // Re-evaluate against new correct answer (stored in snapshot doesn't help;
      // we need the new alternativa_correta from the alternativas table)
      const { data: altCorreta } = await supabase
        .from('alternativas')
        .select('id')
        .eq('questao_id', questao_id)
        .eq('correta', true)
        .single()

      if (altCorreta) {
        novaCorreta = resposta.alternativa_id === altCorreta.id
        novaPontuacao = novaCorreta ? 1 : 0
      }
    }

    await supabase
      .from('respostas_objetivas')
      .update({ correta: novaCorreta, pontuacao: novaPontuacao })
      .eq('id', resposta.id)
  }

  // 4. Recalculate scores for all affected sessions
  const affectedSessaoIds = [...new Set(respostasFiltradas.map((r) => r.sessao_id as string))]
  for (const sessaoId of affectedSessaoIds) {
    await gradeSession(sessaoId, tenant_id)
  }

  // 5. Recalculate ranking
  await recalcRanking(simulado_id, tenant_id)

  // 6. Get new states for impact report
  const { data: sessoesAfter } = await supabase
    .from('sessoes_prova')
    .select('id, nota, posicao_ranking, estudante_id')
    .in('id', affectedSessaoIds)

  // 7. Save recorrecao record
  const { data: recorrecao } = await supabase
    .from('recorrecoes')
    .insert({
      simulado_id,
      questao_id,
      tipo,
      motivo,
      politica,
      executado_por,
      tenant_id,
      executado_em: new Date().toISOString(),
    })
    .select('id')
    .single()

  // 8. Save impact per student
  if (recorrecao) {
    const impactoRows = (sessoesAfter ?? []).map((sa) => {
      const before = sessaoBeforeMap.get(sa.id as string) ?? { nota: 0, rank: null }
      const notaAntes = before.nota ?? 0
      const notaDepois = sa.nota as number ?? 0
      const delta = notaDepois - notaAntes
      const classificacao = delta > 0 ? 'beneficiado' : delta < 0 ? 'prejudicado' : 'neutro'

      return {
        recorrecao_id: recorrecao.id,
        estudante_id: sa.estudante_id,
        nota_antes: notaAntes,
        nota_depois: notaDepois,
        delta,
        ranking_antes: before.rank ?? null,
        ranking_depois: sa.posicao_ranking ?? null,
        classificacao,
        tenant_id,
      }
    })

    if (impactoRows.length) {
      await supabase.from('recorrecao_impactos').insert(impactoRows)
    }
  }

  console.log(
    `[re-correcao] Concluído: ${respostasFiltradas.length} respostas, ${affectedSessaoIds.length} sessões`,
  )
  return {
    regraded: respostasFiltradas.length,
    sessoes_afetadas: affectedSessaoIds.length,
    recorrecao_id: recorrecao?.id,
  }
}

async function gradeSession(sessaoId: string, tenantId: string) {
  const { data: respostas } = await supabase
    .from('respostas_objetivas')
    .select('correta')
    .eq('sessao_id', sessaoId)

  const total = respostas?.length ?? 0
  const corretas = respostas?.filter((r) => r.correta).length ?? 0
  const nota = total > 0 ? parseFloat(((corretas / total) * 10).toFixed(2)) : 0

  await supabase.from('sessoes_prova').update({ nota }).eq('id', sessaoId)
  return nota
}

async function recalcRanking(simuladoId: string, tenantId: string) {
  const { data: sessoes } = await supabase
    .from('sessoes_prova')
    .select('id, nota')
    .eq('simulado_id', simuladoId)
    .eq('status', 'finalizada')
    .eq('is_teste', false)
    .not('nota', 'is', null)
    .order('nota', { ascending: false })

  if (!sessoes?.length) return 0

  let rank = 1
  let prevNota: number | null = null

  for (let i = 0; i < sessoes.length; i++) {
    const nota = sessoes[i].nota as number
    if (prevNota !== null && nota < prevNota) rank = i + 1
    await supabase.from('sessoes_prova').update({ posicao_ranking: rank }).eq('id', sessoes[i].id)
    prevNota = nota
  }

  return sessoes.length
}
