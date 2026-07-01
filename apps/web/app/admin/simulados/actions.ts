'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { softDelete } from '@/lib/soft-delete'

interface SimuladoData {
  titulo: string
  descricao?: string
  modo_aplicacao: string
  data_inicio?: string
  data_fim?: string
  tempo_limite_min?: number
  metodo_identificacao?: string
  embed_ativo?: boolean
  regras?: Record<string, unknown>
  status?: string
  /** Questões selecionadas (dos bancos) para já compor a prova na criação. */
  questaoIds?: string[]
}

export async function createSimuladoAction(data: SimuladoData) {
  if (!(await checkPermission('simulados:create'))) return { error: 'Você não tem permissão para criar simulados.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido. Verifique o acesso.' }

  const supabase = await createClient()

  const { data: simulado, error } = await supabase
    .from('simulado_simulados')
    .insert({
      tenant_id: tenantId,
      titulo: data.titulo,
      descricao: data.descricao || null,
      modo_aplicacao: data.modo_aplicacao,
      data_inicio: data.data_inicio || null,
      data_fim: data.data_fim || null,
      tempo_limite_min: data.tempo_limite_min || null,
      metodo_identificacao: data.metodo_identificacao || null,
      embed_ativo: data.embed_ativo ?? false,
      regras: data.regras ?? {},
      status: 'rascunho',
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Compõe a prova com as questões escolhidas (dos bancos), na ordem selecionada.
  const ids = [...new Set((data.questaoIds ?? []).filter(Boolean))]
  if (ids.length) {
    await supabase.from('simulado_prova_questoes').insert(
      ids.map((questao_id, i) => ({ tenant_id: tenantId, simulado_id: simulado.id, questao_id, ordem: i })),
    )
  }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_simulados', entidadeId: simulado.id, depois: { ...simulado, questoes: ids.length } })

  revalidatePath('/admin/simulados')
  redirect(`/admin/simulados/${simulado.id}`)
}

export async function updateSimuladoAction(id: string, data: SimuladoData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('simulado_simulados')
    .update({
      titulo: data.titulo,
      descricao: data.descricao || null,
      modo_aplicacao: data.modo_aplicacao,
      data_inicio: data.data_inicio || null,
      data_fim: data.data_fim || null,
      tempo_limite_min: data.tempo_limite_min || null,
      metodo_identificacao: data.metodo_identificacao || null,
      embed_ativo: data.embed_ativo ?? false,
      regras: data.regras ?? {},
    })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/admin/simulados')
  revalidatePath(`/admin/simulados/${id}`)
  redirect(`/admin/simulados/${id}`)
}

/** Vincula (ou desvincula) explicitamente um caderno de design ao simulado — define o tema/HUD aplicado. */
export async function vincularCadernoSimulado(simuladoId: string, cadernoId: string | null) {
  const supabase = await createClient()
  const { data: sim } = await supabase.from('simulado_simulados').select('regras').eq('id', simuladoId).maybeSingle()
  const regras: Record<string, unknown> = { ...((sim?.regras as Record<string, unknown>) ?? {}) }
  if (cadernoId) regras.caderno_id = cadernoId
  else delete regras.caderno_id
  const { error } = await supabase.from('simulado_simulados').update({ regras }).eq('id', simuladoId)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_simulados', entidadeId: simuladoId, depois: { caderno_id: cadernoId } })
  revalidatePath(`/admin/simulados/${simuladoId}`)
  return { ok: true }
}

export async function addQuestaoToSimulado(simuladoId: string, questaoId: string) {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido.' }

  const supabase = await createClient()
  const { count } = await supabase
    .from('simulado_prova_questoes')
    .select('*', { count: 'exact', head: true })
    .eq('simulado_id', simuladoId)

  const { error } = await supabase.from('simulado_prova_questoes').insert({
    tenant_id: tenantId,
    simulado_id: simuladoId,
    questao_id: questaoId,
    ordem: count ?? 0,
  })

  if (error) return { error: error.message }
  revalidatePath(`/admin/simulados/${simuladoId}`)
  return { ok: true }
}

export async function removeQuestaoFromSimulado(simuladoQuestaoId: string, simuladoId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('simulado_prova_questoes')
    .delete()
    .eq('id', simuladoQuestaoId)

  if (error) return { error: error.message }
  revalidatePath(`/admin/simulados/${simuladoId}`)
  return { ok: true }
}

export async function publishSimuladoAction(id: string) {
  const supabase = await createClient()
  await supabase.from('simulado_simulados').update({ status: 'publicado' }).eq('id', id)
  await registrarAudit({ operacao: 'LIBERAR', entidade: 'simulado_simulados', entidadeId: id, depois: { status: 'publicado' } })
  revalidatePath(`/admin/simulados/${id}`)
  revalidatePath('/admin/simulados')
}

export async function encerrarSimuladoAction(id: string) {
  const supabase = await createClient()
  await supabase.from('simulado_simulados').update({ status: 'encerrado' }).eq('id', id)
  await registrarAudit({ operacao: 'BLOQUEAR', entidade: 'simulado_simulados', entidadeId: id, depois: { status: 'encerrado' } })
  revalidatePath(`/admin/simulados/${id}`)
  revalidatePath('/admin/simulados')
}

export async function reabrirSimuladoAction(id: string) {
  const supabase = await createClient()
  await supabase.from('simulado_simulados').update({ status: 'publicado' }).eq('id', id)
  await registrarAudit({ operacao: 'LIBERAR', entidade: 'simulado_simulados', entidadeId: id, depois: { status: 'publicado', reaberto: true } })
  revalidatePath(`/admin/simulados/${id}`)
  revalidatePath('/admin/simulados')
}

/** Libera (ou bloqueia) manualmente o gabarito do simulado — grava regras.gabarito_liberado. */
export async function liberarGabaritoAction(id: string, liberado: boolean) {
  const supabase = await createClient()
  const { data: s } = await supabase.from('simulado_simulados').select('regras').eq('id', id).maybeSingle()
  const regras = { ...(((s?.regras as Record<string, unknown>) ?? {})), gabarito_liberado: liberado }
  await supabase.from('simulado_simulados').update({ regras }).eq('id', id)
  await registrarAudit({ operacao: liberado ? 'LIBERAR' : 'BLOQUEAR', entidade: 'simulado_simulados', entidadeId: id, depois: { gabarito_liberado: liberado } })
  revalidatePath('/admin/simulados')
  revalidatePath(`/admin/simulados/${id}`)
}

export async function deleteSimuladoAction(id: string) {
  if (!(await checkPermission('simulados:delete'))) return { error: 'Você não tem permissão para excluir simulados.' }
  // Soft delete: vai para a Lixeira (recuperável); sessões/prova_questoes ficam preservadas.
  const { error } = await softDelete('simulado_simulados', id)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_simulados', entidadeId: id, depois: { deletado: true } })
  revalidatePath('/admin/simulados')
  return { ok: true }
}
