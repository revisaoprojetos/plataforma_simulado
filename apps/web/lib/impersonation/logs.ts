import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import type { ImpersonationScope, ImpersonationActionLevel } from './token'

export type EndReason = 'closed_by_admin' | 'expired' | 'renewed_into_new_session'

/** Abre o registro de uma sessão de visualização. Retorna o id (session_id) ou null se dormente. */
export async function abrirLogImpersonation(p: {
  tenantId: string; adminId: string; estudanteId: string
  scope: ImpersonationScope; actionLevel: ImpersonationActionLevel; ip: string | null
}): Promise<string | null> {
  try {
    const svc = createAdminClient()
    const { data, error } = await svc.from('simulado_impersonation_logs').insert({
      tenant_id: p.tenantId, admin_id: p.adminId, estudante_id: p.estudanteId,
      scope_used: p.scope, action_level_used: p.actionLevel, ip_address: p.ip,
    }).select('id').maybeSingle()
    if (error) return null
    return (data as { id?: string } | null)?.id ?? null
  } catch {
    return null // tabela ainda não aplicada → logging dormente (não quebra a visualização)
  }
}

/** Encerra o registro (uma vez). Best-effort; o trigger garante imutabilidade no banco. */
export async function fecharLogImpersonation(sessionId: string, tenantId: string, endReason: EndReason): Promise<void> {
  if (!sessionId) return
  try {
    const svc = createAdminClient()
    await svc.from('simulado_impersonation_logs')
      .update({ ended_at: new Date().toISOString(), end_reason: endReason })
      .eq('id', sessionId).eq('tenant_id', tenantId).is('ended_at', null)
  } catch { /* tolerante */ }
}

export interface LogImpersonation {
  id: string; adminId: string; estudanteId: string; estudanteNome: string; estudanteEmail: string | null
  scope: string; actionLevel: string; ip: string | null
  startedAt: string; endedAt: string | null; endReason: string | null
}

/** Lista os logs do tenant (mais recentes primeiro) com nome/e-mail do aluno. Para o painel E8. */
export async function listarLogsImpersonation(tenantId: string, limite = 200): Promise<LogImpersonation[]> {
  try {
    const svc = createAdminClient()
    const { data } = await svc.from('simulado_impersonation_logs')
      .select('id, admin_id, estudante_id, scope_used, action_level_used, ip_address, started_at, ended_at, end_reason')
      .eq('tenant_id', tenantId).order('started_at', { ascending: false }).limit(limite)
    const rows = (data ?? []) as any[]
    if (!rows.length) return []
    const estIds = [...new Set(rows.map((r) => r.estudante_id))]
    const ests = await fetchAllByIn<{ id: string; nome: string; email: string | null }>(estIds, (chunk) =>
      svc.from('simulado_estudantes').select('id, nome, email').in('id', chunk))
    const estDe = new Map(ests.map((e) => [e.id, e]))
    return rows.map((r) => ({
      id: r.id, adminId: r.admin_id, estudanteId: r.estudante_id,
      estudanteNome: estDe.get(r.estudante_id)?.nome ?? '—', estudanteEmail: estDe.get(r.estudante_id)?.email ?? null,
      scope: r.scope_used, actionLevel: r.action_level_used, ip: r.ip_address ?? null,
      startedAt: r.started_at, endedAt: r.ended_at ?? null, endReason: r.end_reason ?? null,
    }))
  } catch {
    return []
  }
}
