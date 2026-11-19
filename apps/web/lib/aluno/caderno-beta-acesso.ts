import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/server'
import { ehNoWorkspace, estudanteEmAlgumGrupo, normalizarIdsWorkspace } from '@/lib/sistema/testadores-globais'

/**
 * ACESSO À ABA "Caderno (beta)" do Meus Cadernos (OneNote do aluno, fase 1).
 * Regra por GRUPO DE ACESSO: `simulado_tenants.tema.caderno_beta_grupos` = ids de `simulado_grupos` (zero migração).
 * Libera também a equipe do Workspace (testadores globais: e-mail OU grupo). Lista vazia/ausente = ninguém (fail-closed).
 * A decisão é SEMPRE do servidor (a página e as rotas /api/aluno/notebook/** chamam esta função).
 */
export const getGruposCadernoBeta = cache(async (tenantId: string): Promise<string[]> => {
  try {
    const svc = createAdminClient()
    const { data } = await svc.from('simulado_tenants').select('g:tema->caderno_beta_grupos').eq('id', tenantId).maybeSingle()
    return normalizarIdsWorkspace((data as { g?: unknown } | null)?.g)
  } catch { return [] }
})

export async function cadernoBetaLiberado(args: { tenantId: string; estudanteId: string | null | undefined; email?: string | null }): Promise<boolean> {
  if (!args.estudanteId) return false
  try {
    if (await estudanteEmAlgumGrupo(args.estudanteId, await getGruposCadernoBeta(args.tenantId))) return true
    return await ehNoWorkspace({ tenantId: args.tenantId, email: args.email ?? null, estudanteId: args.estudanteId })
  } catch { return false }
}
