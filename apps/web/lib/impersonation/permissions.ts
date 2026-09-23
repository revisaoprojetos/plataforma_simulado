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

  // super_admin: acesso cross-tenant, sempre disponível (não depende de linha na tabela).
  if (access.role === 'super_admin') return clamp({ scope: 'all_tenants', action_level: 'read_only' })

  // Demais papéis: AUTORITATIVO POR LINHA — só pode se houver uma linha em
  // simulado_impersonation_permissions para (tenant, papel). É o que a tela de Config edita.
  try {
    const svc = createAdminClient()
    // Papel do admin NESTE tenant (prefere a cópia do próprio tenant; cai na de sistema).
    const { data: roles } = await svc.from('simulado_roles').select('id, tenant_id, is_sistema').eq('nome', access.role)
    const lista = (roles ?? []) as { id: string; tenant_id: string | null; is_sistema: boolean | null }[]
    const roleRow = lista.find((r) => r.tenant_id === access.tenantId) ?? lista.find((r) => r.is_sistema)
    if (!roleRow?.id) return null

    const { data: perm } = await svc
      .from('simulado_impersonation_permissions')
      .select('scope, action_level')
      .eq('tenant_id', access.tenantId)
      .eq('role_id', roleRow.id)
      .maybeSingle()

    return perm ? clamp({ scope: perm.scope as ImpersonationScope, action_level: perm.action_level as ImpersonationActionLevel }) : null
  } catch {
    return null // tabela ausente → feature dormante (só super_admin acessa)
  }
}
