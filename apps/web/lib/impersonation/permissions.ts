import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import type { Access } from '@/lib/auth/permissions'

/** Escopo de quem o admin pode "visualizar como aluno". Adaptado ao multitenant (sem turma/escola). */
export type ImpersonationScope = 'own_tenant' | 'all_tenants'
export type ImpersonationActionLevel = 'read_only' | 'read_and_act'
export interface ImpersonationPermission { scope: ImpersonationScope; action_level: ImpersonationActionLevel }

/**
 * MVP = SOMENTE leitura. Trava o nível de ação em `read_only` mesmo que uma linha (futura) diga
 * `read_and_act` — o "agir como o aluno" só será liberado numa fase posterior, com a blocklist
 * completa cobrindo as mutações perigosas (simulado/nota/ranking/XP/perfil/LGPD).
 */
export const MVP_SOMENTE_LEITURA = true

/**
 * Resolve a permissão de impersonation do admin logado a partir do seu `Access` (papel + tenant).
 * - super_admin / acesso total (`permissions: ['*']`) → cross-tenant, mas ainda `read_only` no MVP.
 * - demais papéis → consulta `simulado_impersonation_permissions` por role_id (do papel no tenant).
 * Tolerante: tabela/linha ausente → `null` (feature dormente, sem quebrar nada).
 */
export async function getImpersonationPermission(access: Access): Promise<ImpersonationPermission | null> {
  if (!access.userId || !access.tenantId || !access.role) return null

  const clamp = (p: ImpersonationPermission): ImpersonationPermission =>
    MVP_SOMENTE_LEITURA ? { ...p, action_level: 'read_only' } : p

  // Acesso total (super_admin / admin_geral com '*') pode visualizar; super_admin é cross-tenant.
  const total = access.permissions.includes('*')
  if (access.role === 'super_admin') return clamp({ scope: 'all_tenants', action_level: 'read_only' })

  try {
    const svc = createAdminClient()
    // role_id do papel neste tenant (papéis de sistema valem para todos os tenants).
    const { data: roles } = await svc.from('simulado_roles').select('id, tenant_id, is_sistema').eq('nome', access.role)
    const roleRow = (roles ?? []).find((r: any) => r.tenant_id === access.tenantId || r.is_sistema)
    if (!roleRow?.id) return total ? clamp({ scope: 'own_tenant', action_level: 'read_only' }) : null

    const { data: perm } = await svc
      .from('simulado_impersonation_permissions')
      .select('scope, action_level')
      .eq('tenant_id', access.tenantId)
      .eq('role_id', roleRow.id)
      .maybeSingle()

    if (perm) return clamp({ scope: perm.scope as ImpersonationScope, action_level: perm.action_level as ImpersonationActionLevel })
    // Sem linha específica: admin com '*' ainda pode (own_tenant/read_only); demais, não.
    return total ? clamp({ scope: 'own_tenant', action_level: 'read_only' }) : null
  } catch {
    // Tabela ainda não aplicada → dormante, mas admin com acesso total continua podendo visualizar.
    return total ? clamp({ scope: 'own_tenant', action_level: 'read_only' }) : null
  }
}
