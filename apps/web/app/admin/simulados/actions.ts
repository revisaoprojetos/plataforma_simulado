'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
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
  /** Banco base (pasta) do qual herdar estudantes/config — o banco é o pré-preparatório. */
  bancoBaseId?: string
  /** Estudantes escolhidos manualmente para matricular (modo "criar do zero"). */
  estudanteIds?: string[]
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
      regras: data.bancoBaseId ? { ...(data.regras ?? {}), banco_base_id: data.bancoBaseId } : (data.regras ?? {}),
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

  // Matricula os estudantes: herdados do banco base (pré-preparatório) + escolhidos manualmente.
  let herdados = 0
  const aMatricular = new Set<string>((data.estudanteIds ?? []).filter(Boolean))
  if (data.bancoBaseId || aMatricular.size) {
    const svc = await createServiceClient()
    if (data.bancoBaseId) {
      const { data: alunos } = await svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', data.bancoBaseId).eq('tenant_id', tenantId)
      for (const a of (alunos ?? []) as any[]) if (a.estudante_id) aMatricular.add(a.estudante_id)
    }
    const estIds = [...aMatricular]
    if (estIds.length) {
      const { data: ja } = await svc.from('simulado_matriculas').select('estudante_id').eq('simulado_id', simulado.id).in('estudante_id', estIds)
      const jaSet = new Set((ja ?? []).map((m: any) => m.estudante_id))
      const novos = estIds.filter((e) => !jaSet.has(e))
      if (novos.length) {
        await svc.from('simulado_matriculas').insert(novos.map((estudante_id) => ({ tenant_id: tenantId, estudante_id, simulado_id: simulado.id, liberado: true })))
        herdados = novos.length
      }
    }
  }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_simulados', entidadeId: simulado.id, depois: { ...simulado, questoes: ids.length, estudantes_matriculados: herdados } })

  revalidatePath('/admin/simulados')
  redirect(`/admin/simulados/${simulado.id}`)
}

export async function updateSimuladoAction(id: string, data: SimuladoData) {
  if (!(await checkPermission('simulados:update'))) return { error: 'Você não tem permissão para editar simulados.' }
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
  if (!(await checkPermission('simulados:update'))) return { error: 'Sem permissão.' }
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
  if (!(await checkPermission('simulados:update'))) return { error: 'Sem permissão.' }
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
  if (!(await checkPermission('simulados:update'))) return { error: 'Sem permissão.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('simulado_prova_questoes')
    .delete()
    .eq('id', simuladoQuestaoId)

  if (error) return { error: error.message }
  revalidatePath(`/admin/simulados/${simuladoId}`)
  return { ok: true }
}

/** Gera um embed_token se o simulado ainda não tiver — sem ele o aluno não consegue abrir a prova. */
async function patchComToken(supabase: any, id: string, base: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data } = await supabase.from('simulado_simulados').select('embed_token').eq('id', id).maybeSingle()
  return data?.embed_token ? base : { ...base, embed_token: crypto.randomUUID() }
}

export async function publishSimuladoAction(id: string) {
  if (!(await checkPermission('simulados:update'))) return { error: 'Sem permissão.' }
  const supabase = await createClient()
  const patch = await patchComToken(supabase, id, { status: 'publicado' })
  await supabase.from('simulado_simulados').update(patch).eq('id', id)
  await registrarAudit({ operacao: 'LIBERAR', entidade: 'simulado_simulados', entidadeId: id, depois: { status: 'publicado' } })
  revalidatePath(`/admin/simulados/${id}`)
  revalidatePath('/admin/simulados')
}

export async function encerrarSimuladoAction(id: string) {
  if (!(await checkPermission('simulados:update'))) return { error: 'Sem permissão.' }
  const supabase = await createClient()
  await supabase.from('simulado_simulados').update({ status: 'encerrado' }).eq('id', id)
  await registrarAudit({ operacao: 'BLOQUEAR', entidade: 'simulado_simulados', entidadeId: id, depois: { status: 'encerrado' } })
  revalidatePath(`/admin/simulados/${id}`)
  revalidatePath('/admin/simulados')
}

export async function reabrirSimuladoAction(id: string) {
  if (!(await checkPermission('simulados:update'))) return { error: 'Sem permissão.' }
  const supabase = await createClient()
  const patch = await patchComToken(supabase, id, { status: 'publicado' })
  await supabase.from('simulado_simulados').update(patch).eq('id', id)
  await registrarAudit({ operacao: 'LIBERAR', entidade: 'simulado_simulados', entidadeId: id, depois: { status: 'publicado', reaberto: true } })
  revalidatePath(`/admin/simulados/${id}`)
  revalidatePath('/admin/simulados')
}

/** Libera (ou bloqueia) manualmente um item do simulado (nota, gabarito ou caderno). */
export async function liberarItemAction(id: string, item: 'nota' | 'gabarito' | 'caderno', liberado: boolean) {
  if (!(await checkPermission('simulados:update'))) return { error: 'Sem permissão.' }
  const flag = { nota: 'nota_liberada', gabarito: 'gabarito_liberado', caderno: 'caderno_liberado' }[item]
  const supabase = await createClient()
  const { data: s } = await supabase.from('simulado_simulados').select('regras').eq('id', id).maybeSingle()
  const regras = { ...(((s?.regras as Record<string, unknown>) ?? {})), [flag]: liberado }
  await supabase.from('simulado_simulados').update({ regras }).eq('id', id)
  await registrarAudit({ operacao: liberado ? 'LIBERAR' : 'BLOQUEAR', entidade: 'simulado_simulados', entidadeId: id, depois: { [flag]: liberado } })
  revalidatePath('/admin/simulados')
  revalidatePath(`/admin/simulados/${id}`)
}

/** Libera (ou bloqueia) manualmente o gabarito do simulado — grava regras.gabarito_liberado. */
export async function liberarGabaritoAction(id: string, liberado: boolean) {
  return liberarItemAction(id, 'gabarito', liberado)
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
