'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { exportarDadosEstudante, anonimizarEstudante, type ExportacaoLgpd } from '@/lib/lgpd/dados'

const SEM_TENANT = '00000000-0000-0000-0000-000000000000'
const nowIso = () => new Date().toISOString()

export type SolicitacaoLgpd = {
  id: string; estudante_id: string; estudante_nome: string; estudante_email: string | null
  tipo: string; status: string; canal: string; motivo: string | null; criado_em: string; processado_em: string | null
}

/** Lista as solicitações LGPD do tenant (aluno×admin). Tolerante à ausência da tabela. */
export async function listarSolicitacoes(): Promise<{ ok?: boolean; error?: string; solicitacoes?: SolicitacaoLgpd[]; tabelaAusente?: boolean }> {
  if (!(await checkPermission('estudantes:view'))) return { error: 'Você não tem permissão para acessar esta área.' }
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()
  try {
    const { data, error } = await svc.from('simulado_lgpd_solicitacoes')
      .select('id, estudante_id, tipo, status, canal, motivo, criado_em, processado_em')
      .eq('tenant_id', tenantId ?? SEM_TENANT).order('criado_em', { ascending: false }).limit(500)
    if (error) return { ok: true, solicitacoes: [], tabelaAusente: true }
    const rows = (data ?? []) as any[]
    const ids = [...new Set(rows.map((r) => r.estudante_id))]
    const info = new Map<string, { nome: string; email: string | null }>()
    if (ids.length) {
      const { data: ests } = await svc.from('simulado_estudantes').select('id, nome, email').in('id', ids).eq('tenant_id', tenantId ?? SEM_TENANT)
      for (const e of (ests ?? []) as any[]) info.set(e.id, { nome: e.nome ?? '—', email: e.email ?? null })
    }
    return {
      ok: true,
      solicitacoes: rows.map((r) => ({
        id: r.id, estudante_id: r.estudante_id,
        estudante_nome: info.get(r.estudante_id)?.nome ?? '—', estudante_email: info.get(r.estudante_id)?.email ?? null,
        tipo: r.tipo, status: r.status, canal: r.canal, motivo: r.motivo ?? null, criado_em: r.criado_em, processado_em: r.processado_em ?? null,
      })),
    }
  } catch {
    return { ok: true, solicitacoes: [], tabelaAusente: true }
  }
}

/** Exporta os dados de um estudante (para atender pedido de acesso/portabilidade). */
export async function exportarEstudanteAdmin(estudanteId: string): Promise<{ ok?: boolean; error?: string; dados?: ExportacaoLgpd }> {
  if (!(await checkPermission('estudantes:view'))) return { error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  const dados = await exportarDadosEstudante(createAdminClient(), estudanteId, tenantId)
  if (!dados) return { error: 'Estudante não encontrado.' }
  return { ok: true, dados }
}

/** Processa a EXCLUSÃO (anonimização) de uma solicitação. Preserva estatísticas, remove PII. Auditado. */
export async function anonimizarSolicitacao(id: string): Promise<{ ok?: boolean; error?: string }> {
  if (!(await checkPermission('estudantes:delete'))) return { error: 'Você não tem permissão para excluir/anonimizar estudantes.' }
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()
  const { data: sol } = await svc.from('simulado_lgpd_solicitacoes').select('id, estudante_id, status').eq('id', id).eq('tenant_id', tenantId ?? SEM_TENANT).maybeSingle()
  if (!sol) return { error: 'Solicitação não encontrada.' }
  if ((sol as any).status !== 'pendente') return { error: 'Esta solicitação já foi processada.' }
  const estudanteId = (sol as any).estudante_id

  const { data: antes } = await svc.from('simulado_estudantes').select('nome, email, cpf, telefone').eq('id', estudanteId).eq('tenant_id', tenantId ?? SEM_TENANT).maybeSingle()
  const ok = await anonimizarEstudante(svc, estudanteId, tenantId, null)
  if (!ok) return { error: 'Não foi possível anonimizar o estudante.' }

  await svc.from('simulado_lgpd_solicitacoes').update({ status: 'concluida', processado_em: nowIso() }).eq('id', id).eq('tenant_id', tenantId ?? SEM_TENANT)
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_estudantes', entidadeId: estudanteId, tenantId, antes: antes ?? undefined, depois: { anonimizado: true, lgpd_solicitacao: id } })
  return { ok: true }
}

/** Rejeita uma solicitação (ex.: retenção legal obrigatória). Registra o motivo. Auditado. */
export async function rejeitarSolicitacao(id: string, motivo: string): Promise<{ ok?: boolean; error?: string }> {
  if (!(await checkPermission('estudantes:update'))) return { error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_lgpd_solicitacoes')
    .update({ status: 'rejeitada', motivo: (motivo ?? '').trim().slice(0, 500) || null, processado_em: nowIso() })
    .eq('id', id).eq('tenant_id', tenantId ?? SEM_TENANT).eq('status', 'pendente')
  if (error) return { error: 'Não foi possível rejeitar a solicitação.' }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_lgpd_solicitacoes', entidadeId: id, tenantId, depois: { status: 'rejeitada', motivo } })
  return { ok: true }
}
