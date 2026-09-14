import { getCurrentAccess } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Preferências de UI POR ADMIN (individuais, por user+tenant) — ex.: o tipo de exibição salvo da
 * Aplicação de Simulado. Guardadas em `simulado_tenant_acessos.prefs` (jsonb). Tolerante: se a coluna
 * ainda não existir (migração 20260914000000 não aplicada), devolve {} → tudo cai no padrão.
 */
export async function getAdminPrefs(): Promise<Record<string, unknown>> {
  const acc = await getCurrentAccess()
  if (!acc.userId || !acc.tenantId) return {}
  try {
    const svc = createAdminClient()
    const { data } = await svc.from('simulado_tenant_acessos').select('prefs')
      .eq('user_id', acc.userId).eq('tenant_id', acc.tenantId).maybeSingle()
    return ((data as any)?.prefs as Record<string, unknown>) ?? {}
  } catch {
    return {}
  }
}
