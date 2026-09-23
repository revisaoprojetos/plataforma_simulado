import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import type { Access } from '@/lib/auth/permissions'

/** Escopo de quem o admin pode "visualizar como aluno". Adaptado ao multitenant (sem turma/escola). */
export type ImpersonationScope = 'own_tenant' | 'all_tenants'
export type ImpersonationActionLevel = 'read_only' | 'read_and_act'
export interface ImpersonationPermission { scope: ImpersonationScope; action_level: ImpersonationActionLevel }

/**
 * Modo de acesso da visualização. O usuário optou por **OPERÁVEL** (`read_and_act`): o admin AGE
 * como o aluno e as ações são gravadas normalmente como se fossem do aluno (contam na nota/ranking/
 * XP). O freio de segurança fica na BLOCKLIST (só bloqueia identidade/conta irreversível — LGPD,
 * e-mail de login, exclusão de conta). A coluna `action_level` da tabela fica informativa/futura.
 */
export const MODO_ACESSO_IMPERSONATION: ImpersonationActionLevel = 'read_and_act'

/**
 * Resolve a permissão de impersonation do admin logado a partir do seu `Access` (papel + tenant).
 * - super_admin → cross-tenant, sempre disponível.
 * - demais papéis → AUTORITATIVO POR LINHA (o que a tela de Config edita).
 * O nível de ação é sempre `MODO_ACESSO_IMPERSONATION` (operável). Tolerante: tabela/linha ausente
 * → `null` (feature dormente).
 */
export async function getImpersonationPermission(access: Access): Promise<ImpersonationPermission | null> {
  if (!access.userId || !access.tenantId || !access.role) return null

  // super_admin: acesso cross-tenant, sempre disponível (não depende de linha na tabela).
  if (access.role === 'super_admin') return { scope: 'all_tenants', action_level: MODO_ACESSO_IMPERSONATION }

  try {
    const svc = createAdminClient()
    // Papel do admin NESTE tenant (prefere a cópia do próprio tenant; cai na de sistema).
    const { data: roles } = await svc.from('simulado_roles').select('id, tenant_id, is_sistema').eq('nome', access.role)
    const lista = (roles ?? []) as { id: string; tenant_id: string | null; is_sistema: boolean | null }[]
    const roleRow = lista.find((r) => r.tenant_id === access.tenantId) ?? lista.find((r) => r.is_sistema)
    if (!roleRow?.id) return null

    const { data: perm } = await svc
      .from('simulado_impersonation_permissions')
      .select('scope')
      .eq('tenant_id', access.tenantId)
      .eq('role_id', roleRow.id)
      .maybeSingle()

    return perm ? { scope: (perm.scope as ImpersonationScope) ?? 'own_tenant', action_level: MODO_ACESSO_IMPERSONATION } : null
  } catch {
    return null // tabela ausente → feature dormante (só super_admin acessa)
  }
}
