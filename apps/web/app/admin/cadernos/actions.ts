'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { softDelete } from '@/lib/soft-delete'

export interface CadernoBloco {
  id: string
  tipo: 'texto' | 'questao'
  conteudo?: string
  questao_id?: string
}
export interface CadernoConfig {
  cabecalho?: string
  instrucoes?: string
  blocos: CadernoBloco[]
}

export async function criarCaderno(nome: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!(await checkPermission('questoes:create')) && !(await checkPermission('questoes:update'))) {
    return { ok: false, error: 'Sem permissão.' }
  }
  const access = await getCurrentAccess()
  if (!nome.trim()) return { ok: false, error: 'Informe um nome.' }

  const svc = createAdminClient()
  const { data, error } = await svc
    .from('simulado_cadernos_designer')
    .insert({ tenant_id: access.tenantId, nome: nome.trim(), config: { blocos: [] } })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_cadernos_designer', entidadeId: data.id, depois: { nome } })
  // Sem revalidatePath aqui: revalidar a rota atual corre com o redirect do cliente
  // pro editor e cancela a navegação. A lista revalida ao voltar.
  return { ok: true, id: data.id }
}

export async function salvarCadernoConfig(id: string, config: CadernoConfig): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_cadernos_designer')
    .update({ config, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/admin/cadernos/${id}`)
  return { ok: true }
}

/** Salva o documento do editor de blocos v2 (docsV2/modalidadesV2/cores), preservando campos legados. */
export async function salvarCadernoDesignerV2(
  id: string,
  payload: { docsV2: Record<string, unknown>; modalidadesV2: unknown[]; cores: Record<string, string>; bancoId?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const { data: atual } = await svc.from('simulado_cadernos_designer').select('config').eq('id', id).maybeSingle()
  const merged = { ...(((atual?.config as Record<string, unknown>) ?? {})), ...payload }
  const { error } = await svc
    .from('simulado_cadernos_designer')
    .update({ config: merged, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/admin/cadernos/${id}`)
  return { ok: true }
}

export async function excluirCaderno(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const { error } = await softDelete('simulado_cadernos_designer', id)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_cadernos_designer', entidadeId: id, depois: { deletado: true } })
  revalidatePath('/admin/cadernos')
  return { ok: true }
}
