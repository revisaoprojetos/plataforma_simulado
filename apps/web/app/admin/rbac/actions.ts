'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission, isSuperAdmin } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

/**
 * Resolve o tenant do RBAC. Com `tenantIdAlvo` (só super-admin) opera na plataforma-alvo
 * a partir do console /super; sem ele, exige `rbac:manage` e usa o tenant da sessão.
 */
async function ctxRbac(tenantIdAlvo?: string): Promise<{ ok: true; tenantId: string; ehSuper: boolean } | { ok: false; error: string }> {
  if (tenantIdAlvo && (await isSuperAdmin())) return { ok: true, tenantId: tenantIdAlvo, ehSuper: true }
  if (!(await checkPermission('rbac:manage'))) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  return { ok: true, tenantId, ehSuper: false }
}
function revalRbac(tenantId: string, ehSuper: boolean) {
  revalidatePath('/admin/administradores/permissoes')
  if (ehSuper) revalidatePath(`/super/plataformas/${tenantId}/rbac`)
}

export async function createRoleAction(
  nome: string,
  descricao: string,
  tenantIdAlvo?: string,
  categoriaId?: string,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const ctx = await ctxRbac(tenantIdAlvo)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  const { tenantId } = ctx

  const slug = nome.trim().toLowerCase().replace(/\s+/g, '_')
  if (!slug) return { ok: false, error: 'Informe um nome de perfil.' }

  const supabase = createAdminClient()
  const { data: novo, error } = await supabase
    .from('simulado_roles')
    .insert({ tenant_id: tenantId, nome: slug, descricao: descricao.trim() || null })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  // Categoria (banda da matriz) — só no console super (grava em tema.rbac.cargoCategoria).
  if (categoriaId && ctx.ehSuper && novo?.id) {
    try {
      const { data: t } = await supabase.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
      const tema = { ...((t?.tema as Record<string, unknown>) ?? {}) }
      const rbac = (tema.rbac as { categorias?: unknown[]; cargoCategoria?: Record<string, string> } | undefined) ?? {}
      const cc = { ...(rbac.cargoCategoria ?? {}) }
      cc[novo.id] = categoriaId
      tema.rbac = { categorias: rbac.categorias ?? [], cargoCategoria: cc }
      await supabase.from('simulado_tenants').update({ tema }).eq('id', tenantId)
    } catch { /* categoria é best-effort */ }
  }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_roles', tenantId, depois: { nome: slug, descricao } })
  revalRbac(tenantId, ctx.ehSuper)
  return { ok: true, id: novo?.id }
}

export async function deleteRoleAction(roleId: string, tenantIdAlvo?: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await ctxRbac(tenantIdAlvo)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  const { tenantId } = ctx
  const supabase = createAdminClient()
  // Só perfis do próprio tenant (nunca de outro tenant, nem os de sistema).
  const { data: role } = await supabase.from('simulado_roles').select('is_sistema, nome').eq('id', roleId).eq('tenant_id', tenantId).maybeSingle()
  if (!role) return { ok: false, error: 'Perfil não encontrado.' }
  if (role.is_sistema) return { ok: false, error: 'Perfil de sistema não pode ser excluído.' }
  const { error } = await supabase.from('simulado_roles').delete().eq('id', roleId).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_roles', entidadeId: roleId, tenantId, antes: role ?? undefined })
  revalRbac(tenantId, ctx.ehSuper)
  return { ok: true }
}

export async function saveRolePermissions(
  roleId: string,
  permissionIds: string[],
  // Só é aceito quando o CHAMADOR é super-admin (console /super). No painel do tenant é
  // ignorado — o tenant vem da sessão (não se confia no cliente).
  tenantIdAlvo?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await ctxRbac(tenantIdAlvo)
    if (!ctx.ok) return { ok: false, error: ctx.error }
    const { tenantId } = ctx
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

// ── Usuários por perfil (via simulado_tenant_acessos.role = nome do perfil) ──────
export type UsuarioPerfil = { userId: string; nome: string | null; email: string | null; roleAtual?: string | null }

async function acharRole(svc: ReturnType<typeof createAdminClient>, roleId: string, tenantId: string) {
  const { data } = await svc.from('simulado_roles').select('id, nome, descricao, is_sistema').eq('id', roleId).or(`tenant_id.eq.${tenantId},is_sistema.eq.true`).maybeSingle()
  return data as { id: string; nome: string; descricao: string | null; is_sistema: boolean } | null
}

/** Membros do perfil + usuários do tenant disponíveis para adicionar. */
export async function usuariosDoPerfil(roleId: string): Promise<{ ok: boolean; error?: string; role?: { id: string; nome: string; descricao: string | null; is_sistema: boolean }; membros?: UsuarioPerfil[]; disponiveis?: UsuarioPerfil[] }> {
  if (!(await checkPermission('rbac:manage'))) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const role = await acharRole(svc, roleId, tenantId)
  if (!role) return { ok: false, error: 'Perfil não encontrado.' }

  const { data: acessos } = await svc.from('simulado_tenant_acessos').select('user_id, role').eq('tenant_id', tenantId).eq('ativo', true)
  const userIds = [...new Set((acessos ?? []).map((a: any) => a.user_id).filter(Boolean))]
  const perfil = new Map<string, { nome: string | null; email: string | null }>()
  if (userIds.length) {
    const { data: us } = await svc.from('simulado_users').select('id, nome, email').in('id', userIds)
    for (const u of us ?? []) perfil.set((u as any).id, { nome: (u as any).nome ?? null, email: (u as any).email ?? null })
  }
  const membros: UsuarioPerfil[] = []
  const disponiveis: UsuarioPerfil[] = []
  for (const a of acessos ?? []) {
    const p = perfil.get((a as any).user_id) ?? { nome: null, email: null }
    const item: UsuarioPerfil = { userId: (a as any).user_id, nome: p.nome, email: p.email, roleAtual: (a as any).role ?? null }
    if ((a as any).role === role.nome) membros.push(item)
    else disponiveis.push(item)
  }
  const ord = (x: UsuarioPerfil, y: UsuarioPerfil) => (x.nome ?? x.email ?? '').localeCompare(y.nome ?? y.email ?? '', 'pt-BR')
  return { ok: true, role, membros: membros.sort(ord), disponiveis: disponiveis.sort(ord) }
}

/** Atribui o perfil a um usuário (define tenant_acessos.role = nome do perfil). */
export async function atribuirPerfil(roleId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('rbac:manage'))) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const role = await acharRole(svc, roleId, tenantId)
  if (!role) return { ok: false, error: 'Perfil não encontrado.' }
  const { error } = await svc.from('simulado_tenant_acessos').update({ role: role.nome }).eq('user_id', userId).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_tenant_acessos', entidadeId: userId, depois: { role: role.nome } })
  revalidatePath(`/admin/administradores/permissoes/${roleId}`); revalidatePath('/admin/administradores/permissoes')
  return { ok: true }
}

/** Remove o usuário do perfil — volta para o papel base "estudante" (não perde o acesso ao tenant). */
export async function removerDoPerfil(roleId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('rbac:manage'))) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const role = await acharRole(svc, roleId, tenantId)
  if (!role) return { ok: false, error: 'Perfil não encontrado.' }
  const { error } = await svc.from('simulado_tenant_acessos').update({ role: 'estudante' }).eq('user_id', userId).eq('tenant_id', tenantId).eq('role', role.nome)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_tenant_acessos', entidadeId: userId, depois: { role: 'estudante', removido_de: role.nome } })
  revalidatePath(`/admin/administradores/permissoes/${roleId}`); revalidatePath('/admin/administradores/permissoes')
  return { ok: true }
}
