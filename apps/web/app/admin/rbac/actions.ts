'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

export async function createRoleAction(
  nome: string,
  descricao: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('rbac:manage'))) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }

  const slug = nome.trim().toLowerCase().replace(/\s+/g, '_')
  if (!slug) return { ok: false, error: 'Informe um nome de perfil.' }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('simulado_roles')
    .insert({ tenant_id: tenantId, nome: slug, descricao: descricao.trim() || null })

  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_roles', depois: { nome: slug, descricao } })
  revalidatePath('/admin/rbac')
  return { ok: true }
}

export async function deleteRoleAction(roleId: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('rbac:manage'))) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const supabase = createAdminClient()
  // Só perfis do próprio tenant (nunca de outro tenant, nem os de sistema).
  const { data: role } = await supabase.from('simulado_roles').select('is_sistema, nome').eq('id', roleId).eq('tenant_id', tenantId).maybeSingle()
  if (!role) return { ok: false, error: 'Perfil não encontrado.' }
  if (role.is_sistema) return { ok: false, error: 'Perfil de sistema não pode ser excluído.' }
  const { error } = await supabase.from('simulado_roles').delete().eq('id', roleId).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_roles', entidadeId: roleId, antes: role ?? undefined })
  revalidatePath('/admin/rbac')
  return { ok: true }
}

export async function saveRolePermissions(
  roleId: string,
  permissionIds: string[],
  _tenantIdCliente?: string, // ignorado: o tenant é sempre derivado da sessão (não confiar no cliente)
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!(await checkPermission('rbac:manage'))) return { ok: false, error: 'Sem permissão.' }
    const tenantId = await getCurrentTenantId()
    if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
    const supabase = createAdminClient()

    // Só permite editar permissões de um perfil DO PRÓPRIO TENANT (perfis de sistema
    // são globais e não são editáveis por aqui, para não afetar outros tenants).
    const { data: role } = await supabase
      .from('simulado_roles')
      .select('id, is_sistema')
      .eq('id', roleId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!role) return { ok: false, error: 'Perfil não encontrado neste tenant.' }

    // Delete existing role permissions
    await supabase.from('simulado_role_permissions').delete().eq('role_id', roleId)

    // Insert new permissions
    if (permissionIds.length > 0) {
      const rows = permissionIds.map((pid) => ({ role_id: roleId, permission_id: pid }))
      const { error } = await supabase.from('simulado_role_permissions').insert(rows)
      if (error) return { ok: false, error: error.message }
    }

    await registrarAudit({
      operacao: 'UPDATE', entidade: 'simulado_role_permissions', entidadeId: roleId,
      depois: { role_id: roleId, total_permissoes: permissionIds.length },
      tenantId,
    })

    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
