'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { softDelete } from '@/lib/soft-delete'

async function guard() {
  if (!(await checkPermission('questoes:view'))) {
    return { ok: false as const, error: 'Sem permissão.' }
  }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId }
}

/** Cria um banco (pasta) de questões. */
export async function criarBanco(nome: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const titulo = nome.trim()
  if (!titulo) return { ok: false, error: 'Informe um nome.' }

  const svc = createAdminClient()
  const { data, error } = await svc
    .from('simulado_pastas')
    .insert({ tenant_id: g.tenantId, nome: titulo })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_pastas', entidadeId: data.id, depois: { nome: titulo } })
  revalidatePath('/admin/banco-questoes')
  return { ok: true, id: data.id }
}

/** Renomeia um banco. */
export async function renomearBanco(id: string, nome: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const titulo = nome.trim()
  if (!titulo) return { ok: false, error: 'Informe um nome.' }

  const svc = createAdminClient()
  const { error } = await svc.from('simulado_pastas').update({ nome: titulo }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: id, depois: { nome: titulo } })
  revalidatePath('/admin/banco-questoes')
  revalidatePath(`/admin/banco-questoes/${id}`)
  return { ok: true }
}

/** Duplica um banco: cria uma cópia com os mesmos vínculos de questões. */
export async function duplicarBanco(id: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard()
  if (!g.ok) return g

  const svc = createAdminClient()
  const { data: orig } = await svc.from('simulado_pastas').select('nome').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  if (!orig) return { ok: false, error: 'Banco não encontrado.' }

  const { data: novo, error } = await svc
    .from('simulado_pastas')
    .insert({ tenant_id: g.tenantId, nome: `${orig.nome} (cópia)` })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  // Copia os vínculos de questões.
  const { data: vinculos } = await svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', id).eq('tenant_id', g.tenantId)
  if (vinculos?.length) {
    await svc.from('simulado_questao_pasta').insert(
      vinculos.map((v: any) => ({ tenant_id: g.tenantId, pasta_id: novo.id, questao_id: v.questao_id })),
    )
  }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_pastas', entidadeId: novo.id, depois: { copia_de: id, questoes: vinculos?.length ?? 0 } })
  revalidatePath('/admin/banco-questoes')
  return { ok: true, id: novo.id }
}

/** Exclui um banco (e seus vínculos com questões — as questões NÃO são apagadas). */
export async function excluirBanco(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g

  // Soft delete: o banco vai para a Lixeira. Mantemos os vínculos (questões/estudantes)
  // para que a restauração traga o banco completo de volta.
  const { error } = await softDelete('simulado_pastas', id)
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_pastas', entidadeId: id, depois: { deletado: true } })
  revalidatePath('/admin/banco-questoes')
  return { ok: true }
}

/** Adiciona questões a um banco (ignora as que já estão nele). */
export async function adicionarQuestoes(bancoId: string, questaoIds: string[]): Promise<{ ok: boolean; adicionadas?: number; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  if (!questaoIds.length) return { ok: false, error: 'Selecione ao menos uma questão.' }

  const svc = createAdminClient()
  const { data: jaTem } = await svc
    .from('simulado_questao_pasta')
    .select('questao_id')
    .eq('pasta_id', bancoId)
    .in('questao_id', questaoIds)
  const existentes = new Set((jaTem ?? []).map((r: any) => r.questao_id))
  const novas = questaoIds.filter((q) => !existentes.has(q))
  if (!novas.length) return { ok: true, adicionadas: 0 }

  const { error } = await svc
    .from('simulado_questao_pasta')
    .insert(novas.map((questao_id) => ({ tenant_id: g.tenantId, pasta_id: bancoId, questao_id })))
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: bancoId, depois: { questoes_adicionadas: novas.length } })
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true, adicionadas: novas.length }
}

/** Remove várias questões de um banco de uma vez (as questões continuam existindo). */
export async function removerQuestoes(bancoId: string, questaoIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  if (!questaoIds.length) return { ok: true }
  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_questao_pasta')
    .delete()
    .eq('pasta_id', bancoId)
    .eq('tenant_id', g.tenantId)
    .in('questao_id', questaoIds)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true }
}

/** Remove uma questão de um banco (a questão continua existindo). */
export async function removerQuestao(bancoId: string, questaoId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g

  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_questao_pasta')
    .delete()
    .eq('pasta_id', bancoId)
    .eq('questao_id', questaoId)
    .eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true }
}
