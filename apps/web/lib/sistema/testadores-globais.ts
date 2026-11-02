import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'

/**
 * WORKSPACE do tenant (evolução dos "testadores globais") — a lista da EQUIPE INTERNA.
 * Um membro entra por **e-mail** (`tema->testadores_globais`) OU por **grupo de estudantes**
 * (`tema->workspace_grupos`, ids de `simulado_grupos`). Membro do Workspace:
 *   - vê TODAS as áreas normalmente (fura manutenção de área/plataforma e todos os gates de
 *     conteúdo), tanto no portal do aluno quanto no painel admin — a regra fica POR CIMA da manutenção;
 *   - fica FORA de ranking/estatística: a sessão de prova nasce `is_teste=true` (decisão do produto,
 *     out/2026 — reverte o comportamento anterior em que os testadores contavam).
 * Persistido no `tema` (zero migração), no mesmo padrão de merge do `/admin/sistema`.
 */

export function normalizarEmailsTestador(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out = new Set<string>()
  for (const e of v) {
    if (typeof e === 'string') {
      const n = e.trim().toLowerCase()
      if (n) out.add(n)
    }
  }
  return [...out].sort()
}

/** Normaliza uma lista de ids de grupo (uuid/strings) — único, sem vazios. */
export function normalizarIdsWorkspace(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out = new Set<string>()
  for (const g of v) {
    if (typeof g === 'string') {
      const n = g.trim()
      if (n) out.add(n)
    }
  }
  return [...out]
}

/**
 * Config do Workspace do tenant (e-mails + grupos) numa ÚNICA leitura jsonb-path, p/ NÃO puxar os
 * logos base64 do tema. Cache por request. Fail-open: erro → vazio (acesso normal).
 */
const getWorkspaceConfig = cache(async (tenantId?: string | null): Promise<{ emails: string[]; grupos: string[] }> => {
  try {
    const tid = tenantId ?? (await getCurrentTenantId())
    const svc = createAdminClient()
    const base = svc.from('simulado_tenants').select('e:tema->testadores_globais, g:tema->workspace_grupos')
    const { data } = tid
      ? await base.eq('id', tid).maybeSingle()
      : await base.eq('ativo', true).limit(1).maybeSingle()
    const row = data as { e?: unknown; g?: unknown } | null
    return { emails: normalizarEmailsTestador(row?.e), grupos: normalizarIdsWorkspace(row?.g) }
  } catch {
    return { emails: [], grupos: [] }
  }
})

/** E-mails do Workspace do tenant atual (ou do `tenantId` dado). Cache por request. */
export const getTestadoresGlobais = cache(async (tenantId?: string | null): Promise<string[]> => {
  return (await getWorkspaceConfig(tenantId)).emails
})

/** Grupos (ids) do Workspace do tenant atual (ou do `tenantId` dado). Cache por request. */
export const getWorkspaceGrupos = cache(async (tenantId?: string | null): Promise<string[]> => {
  return (await getWorkspaceConfig(tenantId)).grupos
})

/** E-mail (minúsculo) de um estudante, p/ casar por e-mail quando só se tem o id. Cache por request. */
const emailDoEstudante = cache(async (estudanteId: string): Promise<string | null> => {
  try {
    const svc = createAdminClient()
    const { data } = await svc.from('simulado_estudantes').select('email').eq('id', estudanteId).maybeSingle()
    const e = (data as { email?: string | null } | null)?.email
    return e ? e.trim().toLowerCase() : null
  } catch {
    return null
  }
})

/** Ids dos grupos de um estudante (p/ casar membro do Workspace por grupo). Cache por request. */
const gruposDoEstudante = cache(async (estudanteId: string): Promise<string[]> => {
  try {
    const svc = createAdminClient()
    const { data } = await svc.from('simulado_grupo_membros').select('grupo_id').eq('estudante_id', estudanteId)
    return [...new Set(((data as { grupo_id?: string }[] | null) ?? []).map((r) => r.grupo_id).filter(Boolean) as string[])]
  } catch {
    return []
  }
})

/**
 * O usuário é membro do Workspace do tenant? Casa por **e-mail** (preferido; resolve o e-mail do
 * estudante quando só há `estudanteId`) OU por **grupo** (quando há grupos configurados e temos o
 * `estudanteId`). FAST-PATH: se o Workspace está vazio (sem e-mails e sem grupos), retorna false SEM
 * query extra — não pesa no hot path de layout/acesso a conteúdo.
 */
export async function ehTestadorGlobal(args: {
  tenantId?: string | null
  email?: string | null
  estudanteId?: string | null
}): Promise<boolean> {
  const { emails, grupos } = await getWorkspaceConfig(args.tenantId)
  if (!emails.length && !grupos.length) return false

  // 1) e-mail
  let email = args.email?.trim().toLowerCase() || null
  if (!email && args.estudanteId) email = await emailDoEstudante(args.estudanteId)
  if (email && emails.includes(email)) return true

  // 2) grupo (só vale a pena quando há grupos no Workspace e sabemos qual estudante é)
  if (grupos.length && args.estudanteId) {
    const meus = await gruposDoEstudante(args.estudanteId)
    if (meus.some((g) => grupos.includes(g))) return true
  }

  return false
}

/** Alias semântico: "o usuário está no Workspace?" (mesma função de `ehTestadorGlobal`). */
export const ehNoWorkspace = ehTestadorGlobal

/**
 * O estudante pertence a ALGUM dos grupos dados? P/ layouts que já têm os grupos do Workspace em
 * mãos (lidos do tema já carregado) e só precisam checar a associação — evita a query de config.
 * Lista vazia → false SEM query (fast-path). A query de membros é cacheada por request.
 */
export async function estudanteEmAlgumGrupo(estudanteId: string | null | undefined, grupoIds: string[]): Promise<boolean> {
  if (!estudanteId || !grupoIds.length) return false
  const meus = await gruposDoEstudante(estudanteId)
  return meus.some((g) => grupoIds.includes(g))
}
