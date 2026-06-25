import { Job } from 'bullmq'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function autoEncerramentoProcessor(job: Job) {
  const { simulado_id, tenant_id } = job.data as { simulado_id: string; tenant_id: string }

  console.log(`[auto-encerramento] Encerrando simulado ${simulado_id}`)

  // 1. Find all active sessions
  const { data: sessoes, error } = await supabase
    .from('sessoes_prova')
    .select('id, estudante_id, tenant_id')
    .eq('simulado_id', simulado_id)
    .eq('status', 'em_andamento')

  if (error) throw error
  if (!sessoes?.length) {
    console.log(`[auto-encerramento] Simulado ${simulado_id}: nenhuma sessão ativa`)
    return { encerradas: 0, ranked: 0 }
  }

  const ids = sessoes.map((s) => s.id as string)
  const sessaoTenantId = tenant_id ?? sessoes[0]?.tenant_id

  // 2. Mark all sessions as finalized
  const { error: updateError } = await supabase
    .from('sessoes_prova')
    .update({ status: 'finalizada', finalizado_em: new Date().toISOString() })
    .in('id', ids)

  if (updateError) throw updateError

  // 3. Log auto_finalizou event for each session
  await supabase.from('sessao_eventos').insert(
    ids.map((sessao_id) => ({
      sessao_id,
      tipo: 'auto_finalizou',
      tenant_id: sessaoTenantId,
    })),
  )

  // 4. Calculate score for each session
  let gradedCount = 0
  for (const sessaoId of ids) {
    try {
      await gradeSession(sessaoId, sessaoTenantId)
      gradedCount++
    } catch (err) {
      console.error(`[auto-encerramento] Erro ao calcular nota da sessão ${sessaoId}:`, err)
    }
  }

  // 5. Calculate ranking for the simulado
  const ranked = await recalcRanking(simulado_id, sessaoTenantId)

  // 6. Update simulado status to encerrado
  await supabase
    .from('simulados')
    .update({ status: 'encerrado' })
    .eq('id', simulado_id)

  console.log(
    `[auto-encerramento] Simulado ${simulado_id}: ${ids.length} sessões encerradas, ${gradedCount} corrigidas, ${ranked} no ranking`,
  )

  return { encerradas: ids.length, corrigidas: gradedCount, ranked }
}

async function gradeSession(sessaoId: string, tenantId: string) {
  const { data: respostas } = await supabase
    .from('respostas_objetivas')
    .select('correta')
    .eq('sessao_id', sessaoId)

  const total = respostas?.length ?? 0
  const corretas = respostas?.filter((r) => r.correta).length ?? 0
  const nota = total > 0 ? parseFloat(((corretas / total) * 10).toFixed(2)) : 0

  await supabase
    .from('sessoes_prova')
    .update({ nota })
    .eq('id', sessaoId)

  return { nota, total, corretas }
}

async function recalcRanking(simuladoId: string, tenantId: string): Promise<number> {
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

    await supabase
      .from('sessoes_prova')
      .update({ posicao_ranking: rank })
      .eq('id', sessoes[i].id)

    prevNota = nota
  }

  return sessoes.length
}
