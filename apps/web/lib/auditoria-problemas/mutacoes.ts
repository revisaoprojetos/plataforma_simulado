// Mutações da Auditoria de Problemas (usadas SÓ pelas rotas de API, que já checaram a permissão).
// Cada mutação grava o histórico (antes/depois) e o audit log geral.
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { hojeBrtISO } from '@/lib/brt'
import { semTabela, MSG_MIGRACAO } from './dados'
import type { ProblemaInput } from './tipos'

export type ResultadoMut = { ok: true; id: string } | { ok: false; status: number; message: string }

const CAMPOS = ['area', 'assunto', 'razao', 'acao', 'status', 'prioridade', 'prazo', 'prazo_texto', 'data_registro', 'versao', 'relator', 'responsavel'] as const

const falha = (error: { code?: string; message?: string } | null): ResultadoMut =>
  semTabela(error) ? { ok: false, status: 409, message: MSG_MIGRACAO } : { ok: false, status: 500, message: `Não foi possível salvar: ${error?.message ?? 'erro'}` }

async function historico(tenantId: string, problemaId: string, atorId: string, acao: string, antes: unknown, depois: unknown) {
  // Best-effort: o histórico nunca derruba a mutação já feita.
  try {
    await createAdminClient().from('auditoria_problemas_historico').insert({ tenant_id: tenantId, problema_id: problemaId, ator_id: atorId, acao, antes, depois })
  } catch { /* ignora */ }
}

/** Só os campos que mudaram (antes/depois). */
function diff(antes: Record<string, any>, novo: Record<string, any>) {
  const a: Record<string, unknown> = {}, d: Record<string, unknown> = {}
  for (const k of Object.keys(novo)) if ((antes[k] ?? null) !== (novo[k] ?? null)) { a[k] = antes[k] ?? null; d[k] = novo[k] ?? null }
  return { antes: a, depois: d, mudou: Object.keys(d).length > 0 }
}

export async function criarProblema(tenantId: string, userId: string, input: ProblemaInput, origem = 'manual'): Promise<ResultadoMut> {
  const row = {
    ...input, tenant_id: tenantId, origem, criado_por: userId, atualizado_por: userId,
    data_registro: input.data_registro ?? hojeBrtISO(),
    resolvido_em: input.status === 'resolvido' ? new Date().toISOString() : null,
  }
  const { data, error } = await createAdminClient().from('auditoria_problemas').insert(row).select('id').single()
  if (error || !data) return falha(error)
  await historico(tenantId, data.id, userId, 'criado', null, input)
  await registrarAudit({ operacao: 'INSERT', entidade: 'auditoria_problemas', entidadeId: data.id, tenantId, atorId: userId, atorTipo: 'admin', depois: { assunto: input.assunto, area: input.area, status: input.status } })
  return { ok: true, id: data.id }
}

export async function atualizarProblema(tenantId: string, userId: string, id: string, patch: Partial<ProblemaInput>): Promise<ResultadoMut> {
  const svc = createAdminClient()
  const { data: atual, error: e1 } = await svc.from('auditoria_problemas').select(CAMPOS.join(', ') + ', status').eq('id', id).eq('tenant_id', tenantId).is('deleted_at', null).maybeSingle()
  if (e1) return falha(e1)
  if (!atual) return { ok: false, status: 404, message: 'Problema não encontrado.' }
  const campos: Record<string, unknown> = {}
  for (const k of CAMPOS) if ((patch as any)[k] !== undefined) campos[k] = (patch as any)[k]
  const { antes, depois, mudou } = diff(atual as any, campos)
  if (!mudou) return { ok: true, id }
  const extra: Record<string, unknown> = {}
  if ('status' in depois) extra.resolvido_em = depois.status === 'resolvido' ? new Date().toISOString() : null
  const { error } = await svc.from('auditoria_problemas').update({ ...campos, ...extra, atualizado_por: userId, atualizado_em: new Date().toISOString() }).eq('id', id).eq('tenant_id', tenantId)
  if (error) return falha(error)
  const soStatus = Object.keys(depois).length === 1 && 'status' in depois
  await historico(tenantId, id, userId, soStatus ? 'status' : 'editado', antes, depois)
  await registrarAudit({ operacao: 'UPDATE', entidade: 'auditoria_problemas', entidadeId: id, tenantId, atorId: userId, atorTipo: 'admin', antes, depois })
  return { ok: true, id }
}

/** Exclusão LÓGICA (soft-delete): o registro some das telas mas o histórico permanece. */
export async function excluirProblema(tenantId: string, userId: string, id: string): Promise<ResultadoMut> {
  const svc = createAdminClient()
  const { data: atual, error: e1 } = await svc.from('auditoria_problemas').select('assunto, area, status').eq('id', id).eq('tenant_id', tenantId).is('deleted_at', null).maybeSingle()
  if (e1) return falha(e1)
  if (!atual) return { ok: false, status: 404, message: 'Problema não encontrado.' }
  const { error } = await svc.from('auditoria_problemas').update({ deleted_at: new Date().toISOString(), atualizado_por: userId }).eq('id', id).eq('tenant_id', tenantId)
  if (error) return falha(error)
  await historico(tenantId, id, userId, 'excluido', atual, null)
  await registrarAudit({ operacao: 'DELETE', entidade: 'auditoria_problemas', entidadeId: id, tenantId, atorId: userId, atorTipo: 'admin', antes: atual as Record<string, unknown> })
  return { ok: true, id }
}
