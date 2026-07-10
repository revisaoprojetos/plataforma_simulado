'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'

export async function responderFeedback(
  id: string,
  status: 'pendente' | 'analisado' | 'resolvido',
  resposta: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) {
    return { ok: false, error: 'Sem permissão para moderar reports.' }
  }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_feedbacks_questao')
    .update({
      status,
      resposta_admin: resposta.trim() || null,
      resolvido: status === 'resolvido',
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) return { ok: false, error: error.message }

  await registrarAudit({
    operacao: 'UPDATE',
    entidade: 'simulado_feedbacks_questao',
    entidadeId: id,
    depois: { status, resposta_admin: resposta.trim() || null },
  })

  revalidatePath('/admin/feedbacks')
  return { ok: true }
}
