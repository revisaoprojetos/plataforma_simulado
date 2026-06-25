import { Job } from 'bullmq'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function importProcessor(job: Job) {
  const { questoes, tenant_id } = job.data as {
    questoes: Array<{
      external_id: string
      enunciado: string
      tipo: string
      alternativas?: Array<{ texto: string; correta: boolean; ordem: number }>
    }>
    tenant_id: string
  }

  console.log(`[import] Importando ${questoes.length} questões para tenant ${tenant_id}`)

  let importadas = 0
  let atualizadas = 0

  for (const questao of questoes) {
    const { data: existing } = await supabase
      .from('questoes')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('external_id', questao.external_id)
      .single()

    if (existing) {
      await supabase
        .from('questoes')
        .update({ enunciado: questao.enunciado })
        .eq('id', existing.id)
      atualizadas++
    } else {
      await supabase.from('questoes').insert({
        tenant_id,
        external_id: questao.external_id,
        enunciado: questao.enunciado,
        tipo: questao.tipo,
        status: 'rascunho',
        versao: 1,
      })
      importadas++
    }
  }

  return { importadas, atualizadas }
}
