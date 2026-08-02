'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'

/**
 * Registra (ou atualiza) a avaliação de satisfação (NPS 0–10 + comentário) do aluno para um
 * simulado que ele CONCLUIU. Idempotente por (estudante, simulado) via upsert. Tolerante: se a
 * tabela ainda não foi migrada, devolve erro claro sem quebrar.
 */
export async function submeterAvaliacao(input: {
  simuladoId: string
  sessaoId?: string | null
  nps: number
  comentario?: string
}): Promise<{ ok: boolean; error?: string }> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, error: 'Sessão expirada. Entre novamente.' }

  const nps = Math.round(Number(input.nps))
  if (!Number.isFinite(nps) || nps < 0 || nps > 10) return { ok: false, error: 'Escolha uma nota de 0 a 10.' }

  const svc = await createServiceClient()

  // Só aceita avaliação de quem realmente concluiu o simulado (e do próprio tenant).
  const { data: sess } = await svc
    .from('simulado_sessoes_prova')
    .select('id')
    .eq('estudante_id', sessao.estudanteId)
    .eq('simulado_id', input.simuladoId)
    .eq('is_teste', false)
    .eq('status', 'finalizada')
    .limit(1)
    .maybeSingle()
  if (!sess) return { ok: false, error: 'Você ainda não concluiu este simulado.' }

  const { error } = await svc.from('simulado_avaliacoes').upsert(
    {
      tenant_id: sessao.tenantId,
      estudante_id: sessao.estudanteId,
      simulado_id: input.simuladoId,
      sessao_id: input.sessaoId ?? (sess as any).id ?? null,
      nps,
      comentario: (input.comentario ?? '').trim().slice(0, 1000) || null,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'estudante_id,simulado_id' },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
