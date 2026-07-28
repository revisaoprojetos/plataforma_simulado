import { cache } from 'react'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'

export interface Access {
  userId: string | null
  tenantId: string | null
  role: string | null
  isAdmin: boolean
  permissions: string[] // "resource:action"
}

const EMPTY: Access = { userId: null, tenantId: null, role: null, isAdmin: false, permissions: [] }

/**
 * Consulta a tabela simulado_super_admins via service role (bypassa RLS). Tolerante:
 * tabela ausente/erro → false. `function` (não arrow) para poder ser usada em
 * getCurrentAccess mesmo estando declarada depois (hoisting).
 */
async function consultarSuperAdmin(svc: ReturnType<typeof createAdminClient>, userId: string): Promise<boolean> {
  try {
    const { data } = await svc.from('simulado_super_admins').select('user_id').eq('user_id', userId).maybeSingle()
    return !!data
  } catch {
    return false
  }
}

/**
 * Resolve o acesso do usuário atual: papel (de tenant_acessos) + permissões
 * (roles → role_permissions → permissions). Papel "admin" tem acesso total.
 */
export const getCurrentAccess = cache(async (): Promise<Access> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const tenantId = await getCurrentTenantId()

  if (!user || !tenantId) return { ...EMPTY, userId: user?.id ?? null, tenantId }

  // Service role REAL: a checagem do próprio acesso (filtrada por user_id+tenant_id) não
  // pode depender do RLS do banco — em bancos com RLS incompleto (migrados), createServiceClient
  // rodaria como o usuário e falharia, zerando o acesso do admin.
  const svc = createAdminClient()

  // Super-admin GLOBAL: acesso TOTAL a qualquer plataforma (acima dos tenants), mesmo sem
  // papel no tenant atual. Checado ANTES do papel por-tenant — é o topo da hierarquia.
  if (await consultarSuperAdmin(svc, user.id)) {
    return { userId: user.id, tenantId, role: 'super_admin', isAdmin: true, permissions: ['*'] }
  }

  const { data: acesso } = await svc
    .from('simulado_tenant_acessos')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .maybeSingle()

  const role = (acesso?.role as string | undefined) ?? null
  if (!role) return { ...EMPTY, userId: user.id, tenantId }

  // Admin do tenant = acesso total (não depende de seed de permissões).
  if (role === 'admin' || role === 'super_admin' || role === 'admin_geral') {
    return { userId: user.id, tenantId, role, isAdmin: true, permissions: ['*'] }
  }

  // Demais papéis: resolve permissões em consultas explícitas (sem join embutido).
  let permissions: string[] = []
  try {
    const { data: roleRows } = await svc.from('simulado_roles').select('id, tenant_id, is_sistema').eq('nome', role)
    const roleRow = (roleRows ?? []).find((r: any) => r.tenant_id === tenantId || r.is_sistema)

    if (roleRow?.id) {
      const { data: rp } = await svc.from('simulado_role_permissions').select('permission_id').eq('role_id', roleRow.id)
      const permIds = (rp ?? []).map((r: any) => r.permission_id).filter(Boolean)
      if (permIds.length) {
        const { data: pms } = await svc.from('simulado_permissions').select('resource, action').in('id', permIds)
        permissions = (pms ?? []).map((p: any) => `${p.resource}:${p.action}`)
      }
    }
  } catch {
    /* tabelas RBAC indisponíveis — sem permissões extras */
  }

  return { userId: user.id, tenantId, role, isAdmin: false, permissions }
})

/**
 * Super-admin GLOBAL (tabela simulado_super_admins, sem tenant) — acima de todas as
 * plataformas. Controla gestão de plataformas, entrada neutra e compartilhamento.
 * Ortogonal ao papel por-tenant: não depende do subdomínio atual. Resolvido via service
 * role real (nunca confia no cliente). Tolerante: se a tabela ainda não foi aplicada,
 * retorna false (ninguém é super-admin) — seguro por padrão.
 */
export const isSuperAdmin = cache(async (): Promise<boolean> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  return consultarSuperAdmin(createAdminClient(), user.id)
})

/** Verifica uma permissão sobre um Access já resolvido. */
export function accessCan(access: Access, permission: string): boolean {
  if (access.isAdmin) return true
  if (access.permissions.includes('*')) return true
  return access.permissions.includes(permission)
}

/** Helper para server actions: resolve o acesso e checa a permissão. */
export async function checkPermission(permission: string): Promise<boolean> {
  const access = await getCurrentAccess()
  return accessCan(access, permission)
}
