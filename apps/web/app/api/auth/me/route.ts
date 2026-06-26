import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ permissions: [] }, { status: 401 })
    }

    const service = await createServiceClient()

    // Load user roles for this tenant (first tenant by default)
    const { data: tenant } = await service.from('simulado_tenants').select('id').limit(1).single()
    if (!tenant) return NextResponse.json({ permissions: [] })

    const { data: userRoles } = await service
      .from('simulado_user_roles')
      .select('role_id, roles(nome)')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant.id)

    if (!userRoles || userRoles.length === 0) {
      return NextResponse.json({ permissions: [], roles: [] })
    }

    // super_admin / admin_geral get all permissions
    const roleNames = userRoles.map((r) => {
      const role = r.roles as { nome?: string } | null
      return role?.nome ?? ''
    })

    if (roleNames.some((r) => ['super_admin', 'admin_geral'].includes(r))) {
      return NextResponse.json({ permissions: ['*'], roles: roleNames })
    }

    const roleIds = userRoles.map((r) => r.role_id)
    const { data: rolePerms } = await service
      .from('simulado_role_permissions')
      .select('permissions(resource, action)')
      .in('role_id', roleIds)

    const permissions = new Set<string>()
    for (const rp of rolePerms ?? []) {
      const perm = rp.permissions as { resource?: string; action?: string } | null
      if (perm?.resource && perm?.action) {
        permissions.add(`${perm.resource}:${perm.action}`)
      }
    }

    return NextResponse.json({
      permissions: [...permissions],
      roles: roleNames,
    })
  } catch (err) {
    console.error('[api/auth/me]', err)
    return NextResponse.json({ permissions: [] })
  }
}
