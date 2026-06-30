import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'

// Entidades núcleo com soft delete (Lixeira). Ligações e matriculas seguem hard delete.
export const SOFT_DELETE_TABELAS = [
  'simulado_questoes',
  'simulado_simulados',
  'simulado_estudantes',
  'simulado_grupos',
  'simulado_pastas',
  'simulado_cadernos_designer',
  'simulado_etiquetas',
  'simulado_sessoes_prova',
] as const
export type SoftDeleteTabela = (typeof SOFT_DELETE_TABELAS)[number]

function permitida(t: string): t is SoftDeleteTabela {
  return (SOFT_DELETE_TABELAS as readonly string[]).includes(t)
}

/**
 * Soft delete: marca deletado=true (esconde das telas, mantém no banco/Lixeira).
 * Roda server-side com service-role; grava deletado_por = admin logado e filtra por tenant.
 */
export async function softDelete(tabela: SoftDeleteTabela, ids: string | string[]) {
  const arr = (Array.isArray(ids) ? ids : [ids]).filter(Boolean)
  if (!permitida(tabela)) return { error: new Error(`Tabela não permitida: ${tabela}`), count: 0 }
  if (!arr.length) return { error: null, count: 0 }
  const access = await getCurrentAccess()
  if (!access.userId) return { error: new Error('Sem sessão.'), count: 0 }

  const svc = createAdminClient()
  let q = svc
    .from(tabela)
    .update({ deletado: true, deletado_em: new Date().toISOString(), deletado_por: access.userId })
    .in('id', arr)
    .eq('deletado', false)
  if (access.tenantId) q = q.eq('tenant_id', access.tenantId)
  const { data, error } = await q.select('id')
  return { error: (error as Error) ?? null, count: data?.length ?? 0 }
}

/** Restaura (deletado=false). O trigger limpa deletado_em/por. */
export async function softRestore(tabela: SoftDeleteTabela, id: string) {
  if (!permitida(tabela)) return { error: new Error(`Tabela não permitida: ${tabela}`) }
  const access = await getCurrentAccess()
  if (!access.userId) return { error: new Error('Sem sessão.') }
  const svc = createAdminClient()
  let q = svc.from(tabela).update({ deletado: false }).eq('id', id).eq('deletado', true)
  if (access.tenantId) q = q.eq('tenant_id', access.tenantId)
  const { error } = await q
  return { error: (error as Error) ?? null }
}
