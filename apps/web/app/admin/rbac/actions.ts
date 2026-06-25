'use server'

import { createServiceClient } from '@/lib/supabase/server'

export async function saveRolePermissions(
  roleId: string,
  permissionIds: string[],
  tenantId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()

    // Verify role belongs to this tenant (or is a system role)
    const { data: role } = await supabase
      .from('roles')
      .select('id, is_sistema')
      .eq('id', roleId)
      .or(`tenant_id.eq.${tenantId},is_sistema.eq.true`)
      .single()

    if (!role) return { ok: false, error: 'Perfil não encontrado' }

    // Delete existing role permissions
    await supabase.from('role_permissions').delete().eq('role_id', roleId)

    // Insert new permissions
    if (permissionIds.length > 0) {
      const rows = permissionIds.map((pid) => ({ role_id: roleId, permission_id: pid }))
      const { error } = await supabase.from('role_permissions').insert(rows)
      if (error) return { ok: false, error: error.message }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
