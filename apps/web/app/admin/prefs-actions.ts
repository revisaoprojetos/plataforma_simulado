'use server'

import { getCurrentAccess } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Salva UMA preferência de UI do admin logado (individual, por user+tenant) — faz merge no jsonb
 * `simulado_tenant_acessos.prefs`. Usado, por ex., pelo board de simulados p/ lembrar o tipo de
 * exibição escolhido. Só grava a própria linha do admin (user_id + tenant_id).
 */
export async function salvarAdminPref(chave: string, valor: unknown): Promise<{ ok: boolean }> {
  const acc = await getCurrentAccess()
  if (!acc.userId || !acc.tenantId || !acc.isAdmin) return { ok: false }
  try {
    const svc = createAdminClient()
    const { data } = await svc.from('simulado_tenant_acessos').select('prefs')
      .eq('user_id', acc.userId).eq('tenant_id', acc.tenantId).maybeSingle()
    const prefs = { ...(((data as any)?.prefs as Record<string, unknown>) ?? {}), [chave]: valor }
    const { error } = await svc.from('simulado_tenant_acessos').update({ prefs })
      .eq('user_id', acc.userId).eq('tenant_id', acc.tenantId)
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}
