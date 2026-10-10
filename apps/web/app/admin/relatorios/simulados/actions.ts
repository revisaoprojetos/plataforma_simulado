'use server'

// Ações de GESTÃO DE TENTATIVAS do relatório de simulado:
//   • marcarSessaoTeste  — liga/desliga is_teste numa sessão (reversível; some de stats/ranking).
//   • excluirSessaoSimulado — marca deletado=true (remove de vez do relatório).
//   • marcarTestadorSimulado — marca/desmarca o ALUNO como testador DESTE simulado
//     (grava em simulado_testadores → futuras sessões já nascem is_teste=true) e cascateia
//     as sessões existentes dele para is_teste = true/false.
//
// Todas: authz (checkPermission simulados:update) + auditoria + invalidação do cache do relatório.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { invalidarRelatoriosSimulado } from '@/lib/cache/relatorio-cache'

type R = { ok?: true; error?: string }

async function revalidar(tenantId: string | null, simuladoId: string, estudanteId?: string | null) {
  await invalidarRelatoriosSimulado(tenantId, simuladoId)
  revalidatePath('/admin/relatorios/simulados')
  if (estudanteId) revalidatePath(`/admin/estudantes/${estudanteId}/simulado/${simuladoId}`)
}

/** Liga/desliga `is_teste` de UMA sessão (reversível). */
export async function marcarSessaoTeste(sessaoId: string, isTeste: boolean): Promise<R> {
  if (!(await checkPermission('simulados:update'))) return { error: 'Você não tem permissão.' }
  const { tenantId } = await getCurrentAccess()
  const svc = createAdminClient()
  const { data: sess } = await svc
    .from('simulado_sessoes_prova')
    .select('id, simulado_id, estudante_id, is_teste')
    .eq('id', sessaoId).eq('tenant_id', tenantId ?? '').maybeSingle()
  if (!sess) return { error: 'Sessão não encontrada.' }
  const s = sess as any
  const { error } = await svc.from('simulado_sessoes_prova')
    .update({ is_teste: isTeste, updated_at: new Date().toISOString() })
    .eq('id', sessaoId).eq('tenant_id', tenantId ?? '')
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_sessoes_prova', entidadeId: sessaoId, tenantId, antes: { is_teste: s.is_teste }, depois: { is_teste: isTeste, acao: isTeste ? 'marcar_teste' : 'desmarcar_teste', simulado_id: s.simulado_id } })
  await revalidar(tenantId, s.simulado_id, s.estudante_id)
  return { ok: true }
}

/** Marca a sessão como deletada (sai de vez do relatório/ranking). */
export async function excluirSessaoSimulado(sessaoId: string): Promise<R> {
  if (!(await checkPermission('simulados:update'))) return { error: 'Você não tem permissão.' }
  const { tenantId, userId } = await getCurrentAccess() as any
  const svc = createAdminClient()
  const { data: sess } = await svc
    .from('simulado_sessoes_prova')
    .select('id, simulado_id, estudante_id')
    .eq('id', sessaoId).eq('tenant_id', tenantId ?? '').maybeSingle()
  if (!sess) return { error: 'Sessão não encontrada.' }
  const s = sess as any
  const { error } = await svc.from('simulado_sessoes_prova')
    .update({ deletado: true, deletado_em: new Date().toISOString(), deletado_por: userId ?? null })
    .eq('id', sessaoId).eq('tenant_id', tenantId ?? '')
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_sessoes_prova', entidadeId: sessaoId, tenantId, depois: { acao: 'excluir_sessao', simulado_id: s.simulado_id, estudante_id: s.estudante_id } })
  await revalidar(tenantId, s.simulado_id, s.estudante_id)
  return { ok: true }
}

/** Marca/desmarca o ALUNO como testador DESTE simulado (persiste em simulado_testadores) e
 *  cascateia as sessões existentes dele para is_teste = valor. Reversível. */
export async function marcarTestadorSimulado(simuladoId: string, estudanteId: string, isTestador: boolean): Promise<R> {
  if (!(await checkPermission('simulados:update'))) return { error: 'Você não tem permissão.' }
  const { tenantId } = await getCurrentAccess()
  const svc = createAdminClient()
  // Confere que o simulado é do tenant (evita cross-tenant).
  const { data: sim } = await svc.from('simulado_simulados').select('id').eq('id', simuladoId).eq('tenant_id', tenantId ?? '').maybeSingle()
  if (!sim) return { error: 'Simulado não encontrado.' }

  if (isTestador) {
    const { data: ja } = await svc.from('simulado_testadores').select('id').eq('simulado_id', simuladoId).eq('estudante_id', estudanteId).maybeSingle()
    if (!ja) {
      const { error } = await svc.from('simulado_testadores').insert({ tenant_id: tenantId, simulado_id: simuladoId, estudante_id: estudanteId })
      if (error) return { error: error.message }
    }
  } else {
    const { error } = await svc.from('simulado_testadores').delete().eq('simulado_id', simuladoId).eq('estudante_id', estudanteId).eq('tenant_id', tenantId ?? '')
    if (error) return { error: error.message }
  }
  // Cascata nas sessões existentes do aluno NESTE simulado.
  await svc.from('simulado_sessoes_prova')
    .update({ is_teste: isTestador, updated_at: new Date().toISOString() })
    .eq('simulado_id', simuladoId).eq('estudante_id', estudanteId).eq('tenant_id', tenantId ?? '')
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_testadores', entidadeId: estudanteId, tenantId, depois: { acao: isTestador ? 'marcar_testador' : 'desmarcar_testador', simulado_id: simuladoId } })
  await revalidar(tenantId, simuladoId, estudanteId)
  return { ok: true }
}
