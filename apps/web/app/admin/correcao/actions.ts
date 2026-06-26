'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'

const LOCK_MIN = 30

/** Assume a correção (lock). Falha se já há outro corretor com lock ativo. */
export async function assumirCorrecao(respostaId: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('correcao:corrigir')) && !(await checkPermission('questoes:update'))) {
    return { ok: false, error: 'Sem permissão para corrigir.' }
  }
  const access = await getCurrentAccess()
  const svc = createAdminClient()

  const { data: r } = await svc
    .from('simulado_respostas_discursivas')
    .select('id, status, em_correcao_por, lock_expira_em')
    .eq('id', respostaId)
    .maybeSingle()
  if (!r) return { ok: false, error: 'Resposta não encontrada.' }
  if (r.status === 'corrigida') return { ok: false, error: 'Já corrigida.' }

  const lockAtivo = r.em_correcao_por && r.lock_expira_em && new Date(r.lock_expira_em) > new Date()
  if (lockAtivo && r.em_correcao_por !== access.userId) {
    return { ok: false, error: 'Outro corretor está com esta resposta no momento.' }
  }

  const expira = new Date(Date.now() + LOCK_MIN * 60_000).toISOString()
  await svc
    .from('simulado_respostas_discursivas')
    .update({ status: 'em_correcao', em_correcao_por: access.userId, lock_expira_em: expira, atualizado_em: new Date().toISOString() })
    .eq('id', respostaId)

  return { ok: true }
}

/** Salva a correção: nota por competência + feedback. Calcula a nota total e finaliza. */
export async function salvarCorrecao(
  respostaId: string,
  competencias: { competencia_id: string; nota: number; comentario?: string }[],
  feedback: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('correcao:corrigir')) && !(await checkPermission('questoes:update'))) {
    return { ok: false, error: 'Sem permissão para corrigir.' }
  }
  const access = await getCurrentAccess()
  const svc = createAdminClient()

  const { data: r } = await svc
    .from('simulado_respostas_discursivas')
    .select('id, status, em_correcao_por, lock_expira_em')
    .eq('id', respostaId)
    .maybeSingle()
  if (!r) return { ok: false, error: 'Resposta não encontrada.' }

  const lockAtivo = r.em_correcao_por && r.lock_expira_em && new Date(r.lock_expira_em) > new Date()
  if (lockAtivo && r.em_correcao_por !== access.userId) {
    return { ok: false, error: 'O lock desta resposta é de outro corretor.' }
  }

  // Regrava as notas por competência.
  await svc.from('simulado_correcao_competencias').delete().eq('resposta_id', respostaId)
  if (competencias.length) {
    await svc.from('simulado_correcao_competencias').insert(
      competencias.map((c) => ({ resposta_id: respostaId, competencia_id: c.competencia_id, nota: c.nota ?? 0, comentario: c.comentario?.trim() || null })),
    )
  }
  const notaTotal = competencias.reduce((acc, c) => acc + (Number(c.nota) || 0), 0)

  const { error } = await svc
    .from('simulado_respostas_discursivas')
    .update({
      status: 'corrigida',
      nota: notaTotal,
      feedback: feedback.trim() || null,
      corrigido_por: access.userId,
      corrigido_em: new Date().toISOString(),
      em_correcao_por: null,
      lock_expira_em: null,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', respostaId)
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_respostas_discursivas', entidadeId: respostaId, depois: { status: 'corrigida', nota: notaTotal } })

  revalidatePath('/admin/correcao')
  return { ok: true }
}
