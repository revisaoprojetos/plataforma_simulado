'use server'

/**
 * Estúdio de Conteúdo · Painel "quem tem acesso e por quê".
 * Reconciliação em 1 clique do elo grupo→banco (reusa `reconciliarGruposBancos`, hoje só cron/script).
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { reconciliarGruposBancos } from '@/lib/simulado/reconciliar-grupos-bancos'

export async function reconciliarAgoraAction(): Promise<{ ok: boolean; links?: number; pastaInseridos?: number; matriculasInseridas?: number; error?: string }> {
  const a = await getCurrentAccess()
  if (!a.tenantId || !(a.isAdmin || a.permissions.includes('grupos:view'))) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  try {
    const r = await reconciliarGruposBancos(svc, { tenantId: a.tenantId })
    await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pasta_grupos', entidadeId: a.tenantId, tenantId: a.tenantId, depois: { reconciliacao: true, ...r } }).catch(() => {})
    revalidatePath('/admin/conteudos/acesso')
    return { ok: true, links: r.links, pastaInseridos: r.pastaInseridos, matriculasInseridas: r.matriculasInseridas }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Falha na reconciliação.' }
  }
}
