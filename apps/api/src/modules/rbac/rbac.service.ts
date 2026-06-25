import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service.js'
import { CreateRoleDto } from './dto/create-role.dto.js'
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto.js'

export const SYSTEM_ROLES = [
  'super_admin', 'admin_geral', 'admin_conteudo', 'admin_correcao',
  'admin_relatorio', 'admin_comercial', 'estudante', 'testador',
]

// Static permission catalog — seeded on DB creation
export const ALL_PERMISSIONS = [
  'questoes:view', 'questoes:create', 'questoes:update', 'questoes:delete', 'questoes:export',
  'simulados:view', 'simulados:create', 'simulados:update', 'simulados:delete', 'simulados:test',
  'estudantes:view', 'estudantes:create', 'estudantes:update', 'estudantes:delete',
  'matriculas:view', 'matriculas:create', 'matriculas:update', 'matriculas:delete',
  'grupos:view', 'grupos:create', 'grupos:update', 'grupos:delete',
  'rbac:view', 'rbac:manage',
  'auditoria:view',
  'relatorios:view', 'relatorios:export',
  'configuracoes:view', 'configuracoes:manage',
  'api_keys:manage',
  'tenants:manage',
]

// Default permissions per role
const ROLE_DEFAULTS: Record<string, string[]> = {
  super_admin: ALL_PERMISSIONS,
  admin_geral: ALL_PERMISSIONS.filter(p => !p.startsWith('tenants:')),
  admin_conteudo: ['questoes:view', 'questoes:create', 'questoes:update', 'questoes:delete', 'questoes:export', 'simulados:view', 'simulados:create', 'simulados:update'],
  admin_correcao: ['simulados:view', 'simulados:update', 'relatorios:view', 'relatorios:export'],
  admin_relatorio: ['relatorios:view', 'relatorios:export', 'questoes:view', 'simulados:view', 'estudantes:view'],
  admin_comercial: ['estudantes:view', 'estudantes:create', 'matriculas:view', 'matriculas:create', 'matriculas:update'],
  estudante: [],
  testador: ['simulados:test'],
}

@Injectable()
export class RbacService {
  constructor(private readonly supabase: SupabaseService) {}

  async getRoles(tenantId: string) {
    const { data } = await this.supabase.getClient()
      .from('roles')
      .select('id, nome, descricao, is_sistema, criado_em')
      .or(`tenant_id.eq.${tenantId},is_sistema.eq.true`)
      .order('is_sistema', { ascending: false })
      .order('nome')
    return data ?? []
  }

  async createRole(tenantId: string, dto: CreateRoleDto) {
    if (SYSTEM_ROLES.includes(dto.nome)) {
      throw new BadRequestException('Nome de perfil reservado')
    }
    const { data, error } = await this.supabase.getClient()
      .from('roles')
      .insert({ nome: dto.nome, descricao: dto.descricao ?? null, tenant_id: tenantId, is_sistema: false })
      .select()
      .single()
    if (error) throw new BadRequestException(error.message)
    return data
  }

  async deleteRole(roleId: string, tenantId: string) {
    const { data: role } = await this.supabase.getClient()
      .from('roles')
      .select('id, is_sistema')
      .eq('id', roleId)
      .eq('tenant_id', tenantId)
      .single()

    if (!role) throw new NotFoundException('Perfil não encontrado')
    if (role.is_sistema) throw new BadRequestException('Perfis de sistema não podem ser removidos')

    await this.supabase.getClient().from('role_permissions').delete().eq('role_id', roleId)
    await this.supabase.getClient().from('roles').delete().eq('id', roleId)
    return { deleted: true }
  }

  async getPermissions() {
    const { data } = await this.supabase.getClient()
      .from('permissions')
      .select('id, resource, action')
      .order('resource')
      .order('action')
    return data ?? []
  }

  async getRolePermissions(roleId: string) {
    const { data } = await this.supabase.getClient()
      .from('role_permissions')
      .select('permission_id, permissions(id, resource, action)')
      .eq('role_id', roleId)
    return data ?? []
  }

  async setRolePermissions(roleId: string, dto: SetRolePermissionsDto) {
    await this.supabase.getClient().from('role_permissions').delete().eq('role_id', roleId)
    if (!dto.permission_ids.length) return []

    const rows = dto.permission_ids.map(pid => ({ role_id: roleId, permission_id: pid }))
    const { data, error } = await this.supabase.getClient()
      .from('role_permissions').insert(rows).select()
    if (error) throw new BadRequestException(error.message)
    return data
  }

  async getPermissionsMatrix(tenantId: string) {
    const [roles, permissions, rpData] = await Promise.all([
      this.getRoles(tenantId),
      this.getPermissions(),
      this.supabase.getClient().from('role_permissions').select('role_id, permission_id'),
    ])

    const matrix: Record<string, string[]> = {}
    for (const row of rpData.data ?? []) {
      if (!matrix[row.role_id]) matrix[row.role_id] = []
      matrix[row.role_id].push(row.permission_id)
    }

    return { roles, permissions, matrix }
  }

  // Called at login to embed permissions in JWT
  async getPermissionsForUser(userId: string, tenantId: string): Promise<string[]> {
    // Get roles for user in this tenant
    const { data: acessos } = await this.supabase.getClient()
      .from('tenant_acessos')
      .select('role')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('ativo', true)

    const roleNames = (acessos ?? []).map(a => a.role as string)

    if (roleNames.includes('super_admin')) return ALL_PERMISSIONS

    // Attempt to fetch from DB (role_permissions table may not exist yet)
    try {
      const { data: roles } = await this.supabase.getClient()
        .from('roles')
        .select('id, nome')
        .or(`tenant_id.eq.${tenantId},is_sistema.eq.true`)
        .in('nome', roleNames)

      if (!roles?.length) return this.getDefaultPermissions(roleNames)

      const roleIds = roles.map(r => r.id)
      const { data: rp } = await this.supabase.getClient()
        .from('role_permissions')
        .select('permissions(resource, action)')
        .in('role_id', roleIds)

      if (!rp?.length) return this.getDefaultPermissions(roleNames)

      const perms = new Set<string>()
      for (const row of rp) {
        const p = (row.permissions as unknown) as { resource: string; action: string } | null
        if (p) perms.add(`${p.resource}:${p.action}`)
      }
      return Array.from(perms)
    } catch {
      // Table doesn't exist yet — fall back to static defaults
      return this.getDefaultPermissions(roleNames)
    }
  }

  private getDefaultPermissions(roleNames: string[]): string[] {
    const perms = new Set<string>()
    for (const role of roleNames) {
      for (const p of ROLE_DEFAULTS[role] ?? []) perms.add(p)
    }
    return Array.from(perms)
  }

  // Seed system roles and permissions for a new tenant
  async seedTenantRoles(tenantId: string) {
    // Seed permissions catalog (global, idempotent)
    const permRows = ALL_PERMISSIONS.map(p => {
      const [resource, action] = p.split(':')
      return { resource, action }
    })
    await this.supabase.getClient()
      .from('permissions')
      .upsert(permRows, { onConflict: 'resource,action', ignoreDuplicates: true })

    // Seed system roles for tenant
    for (const roleName of SYSTEM_ROLES.filter(r => r !== 'super_admin')) {
      const { data: role } = await this.supabase.getClient()
        .from('roles')
        .upsert(
          { nome: roleName, tenant_id: tenantId, is_sistema: true, descricao: null },
          { onConflict: 'nome,tenant_id', ignoreDuplicates: true }
        )
        .select('id')
        .single()

      if (!role) continue

      // Assign default permissions
      const defaults = ROLE_DEFAULTS[roleName] ?? []
      if (!defaults.length) continue

      const { data: perms } = await this.supabase.getClient()
        .from('permissions')
        .select('id, resource, action')
        .in('resource', defaults.map(p => p.split(':')[0]))

      if (!perms?.length) continue

      const matchedPerms = perms.filter(p => defaults.includes(`${p.resource}:${p.action}`))
      const rpRows = matchedPerms.map(p => ({ role_id: role.id, permission_id: p.id }))
      if (rpRows.length) {
        await this.supabase.getClient()
          .from('role_permissions')
          .upsert(rpRows, { onConflict: 'role_id,permission_id', ignoreDuplicates: true })
      }
    }

    return { seeded: true }
  }

  async getUserRoles(userId: string, tenantId: string) {
    const { data } = await this.supabase.getClient()
      .from('user_roles')
      .select('role_id, roles(id, nome, descricao)')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
    return data ?? []
  }

  async setUserRoles(userId: string, tenantId: string, roleIds: string[]) {
    await this.supabase.getClient()
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
    if (!roleIds.length) return []
    const rows = roleIds.map(rid => ({ user_id: userId, tenant_id: tenantId, role_id: rid }))
    const { data, error } = await this.supabase.getClient()
      .from('user_roles').insert(rows).select()
    if (error) throw new BadRequestException(error.message)
    return data
  }
}
