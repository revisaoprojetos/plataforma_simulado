'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { AREAS_EQUIPE, NIVEL_ROTULO, type Nivel } from '@/lib/admin/revisao/equipe-tipos'

// Matriz papéis × áreas: grava em simulado_role_permissions (RBAC real). Criar papel / convidar / trocar papel /
// tirar acesso reutilizam as actions já existentes (app/admin/rbac e app/admin/administradores) — chamadas
// direto do client, sem duplicar regra.

/** Define o nível (0 não vê · 1 vê · 2 edita) de um papel do tenant numa área. */
export async function definirNivelAreaAction(roleId: string, areaId: string, nivel: Nivel): Promise<{ ok: boolean; error?: string }> {
  const access = await getCurrentAccess()
  if (!access.tenantId || !accessCan(access, 'rbac:manage')) return { ok: false, error: 'Sem permissão.' }
  const area = AREAS_EQUIPE.find((a) => a.id === areaId)
  if (!area || ![0, 1, 2].includes(nivel)) return { ok: false, error: 'Área ou nível inválido.' }

  const svc = createAdminClient()
  // só papel do PRÓPRIO tenant e que não seja de acesso total
  const { data: role } = await svc.from('simulado_roles').select('id, nome').eq('id', roleId).eq('tenant_id', access.tenantId).maybeSingle()
  if (!role) return { ok: false, error: 'Papel não encontrado nesta plataforma.' }
  if (['admin', 'admin_geral', 'super_admin'].includes((role as any).nome)) return { ok: false, error: 'Este papel tem acesso total e não depende da matriz.' }

  const { data: perms } = await svc.from('simulado_permissions').select('id, action').eq('resource', area.recurso)
  const todas = (perms ?? []) as { id: string; action: string }[]
  if (!todas.length) return { ok: false, error: `O recurso "${area.recurso}" ainda não está cadastrado nas permissões.` }

  const view = todas.filter((p) => p.action === 'view').map((p) => p.id)
  const alvo = new Set<string>(nivel === 0 ? [] : nivel === 1 ? view : todas.map((p) => p.id))
  const ids = todas.map((p) => p.id)

  const { data: atuais } = await svc.from('simulado_role_permissions').select('permission_id').eq('role_id', roleId).in('permission_id', ids)
  const tem = new Set(((atuais ?? []) as any[]).map((r) => r.permission_id as string))
  const remover = ids.filter((id) => tem.has(id) && !alvo.has(id))
  const incluir = [...alvo].filter((id) => !tem.has(id))

  if (remover.length) {
    const { error } = await svc.from('simulado_role_permissions').delete().eq('role_id', roleId).in('permission_id', remover)
    if (error) return { ok: false, error: error.message }
  }
  if (incluir.length) {
    const { error } = await svc.from('simulado_role_permissions').insert(incluir.map((permission_id) => ({ role_id: roleId, permission_id })))
    if (error) return { ok: false, error: error.message }
  }

  await registrarAudit({
    operacao: 'UPDATE', entidade: 'simulado_role_permissions', entidadeId: roleId, tenantId: access.tenantId,
    antes: { papel: (role as any).nome, area: area.nome, nivel: tem.size ? 'tinha' : 'não tinha' },
    depois: { papel: (role as any).nome, area: area.nome, nivel: NIVEL_ROTULO[nivel], recurso: area.recurso },
  })
  revalidatePath('/admin/revisao/equipe')
  revalidatePath('/admin/administradores/permissoes')
  return { ok: true }
}
