'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { getImpersonationPermission } from '@/lib/impersonation/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { getModoNotificacao, type NotifMode } from '@/lib/impersonation/notification'

export interface AlunoBusca { id: string; nome: string; email: string | null }

/** Busca alunos do tenant para o console de visualização (só quem pode visualizar). */
export async function buscarAlunosImpersonacao(query: string): Promise<{ ok: boolean; alunos?: AlunoBusca[]; error?: string }> {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId) return { ok: false, error: 'Sessão inválida.' }
  const perm = await getImpersonationPermission(access)
  if (!perm) return { ok: false, error: 'Sem permissão para visualizar alunos.' }
  const svc = createAdminClient()
  const q = (query ?? '').trim().replace(/[,%()]/g, ' ').trim()
  let sel = svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', access.tenantId).order('nome').limit(40)
  if (q) sel = sel.or(`nome.ilike.%${q}%,email.ilike.%${q}%`)
  const { data } = await sel
  return { ok: true, alunos: (data ?? []) as AlunoBusca[] }
}

// Só administradores (admin/super_admin/admin_geral) configuram QUEM pode visualizar alunos.
async function guardAdmin() {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId) return { ok: false as const, error: 'Sessão inválida.' }
  if (!access.isAdmin) return { ok: false as const, error: 'Apenas administradores podem alterar esta configuração.' }
  return { ok: true as const, access }
}

export interface PapelImpersonacao { id: string; nome: string; habilitado: boolean; bloqueado: boolean }

/** Carrega os papéis do tenant + se cada um pode visualizar + o modo de notificação. */
export async function carregarConfigImpersonacao(): Promise<{ ok: boolean; roles?: PapelImpersonacao[]; modo?: NotifMode; error?: string }> {
  const g = await guardAdmin(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  try {
    const [{ data: roles }, { data: perms }] = await Promise.all([
      svc.from('simulado_roles').select('id, nome, is_sistema').eq('tenant_id', g.access.tenantId).order('nome'),
      svc.from('simulado_impersonation_permissions').select('role_id').eq('tenant_id', g.access.tenantId),
    ])
    const habil = new Set((perms ?? []).map((p: any) => p.role_id))
    const out: PapelImpersonacao[] = (roles ?? []).map((r: any) => ({
      id: r.id, nome: r.nome,
      habilitado: r.nome === 'super_admin' ? true : habil.has(r.id),
      bloqueado: r.nome === 'super_admin', // super_admin sempre pode (cross-tenant) — não editável
    }))
    const modo = await getModoNotificacao(g.access.tenantId!)
    return { ok: true, roles: out, modo }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Erro ao carregar.' }
  }
}

/** Habilita/desabilita um papel (own_tenant/read_only). Desabilitar = remove a linha. */
export async function salvarPapelImpersonacao(roleId: string, habilitar: boolean): Promise<{ ok: boolean; error?: string }> {
  const g = await guardAdmin(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  try {
    if (habilitar) {
      const { error } = await svc.from('simulado_impersonation_permissions').upsert(
        { tenant_id: g.access.tenantId, role_id: roleId, scope: 'own_tenant', action_level: 'read_and_act' },
        { onConflict: 'tenant_id,role_id' },
      )
      if (error) throw error
    } else {
      const { error } = await svc.from('simulado_impersonation_permissions').delete().eq('tenant_id', g.access.tenantId).eq('role_id', roleId)
      if (error) throw error
    }
  } catch (e: any) {
    const msg = e?.message ?? ''
    return { ok: false, error: /impersonation_permissions|column|schema cache|relation/i.test(msg) ? 'Migração pendente (simulado_impersonation_permissions).' : (msg || 'Erro ao salvar.') }
  }
  await registrarAudit({ operacao: habilitar ? 'LIBERAR' : 'BLOQUEAR', entidade: 'simulado_impersonation_permissions', entidadeId: roleId, depois: { habilitado: habilitar } })
  revalidatePath('/admin/impersonation/config')
  return { ok: true }
}

/** Modo de notificação ao aluno por tenant (mandatory/passive/disabled). */
export async function salvarModoNotificacaoImpersonacao(mode: NotifMode): Promise<{ ok: boolean; error?: string }> {
  const g = await guardAdmin(); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  try {
    const { error } = await svc.from('simulado_impersonation_notification_config').upsert(
      { tenant_id: g.access.tenantId, mode, atualizado_em: new Date().toISOString() },
      { onConflict: 'tenant_id' },
    )
    if (error) throw error
  } catch (e: any) {
    const msg = e?.message ?? ''
    return { ok: false, error: /notification_config|column|schema cache|relation/i.test(msg) ? 'Migração pendente (simulado_impersonation_notification_config).' : (msg || 'Erro ao salvar.') }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_impersonation_notification_config', depois: { mode } })
  revalidatePath('/admin/impersonation/config')
  return { ok: true }
}
