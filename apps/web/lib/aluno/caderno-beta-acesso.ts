import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/server'
import { ehNoWorkspace, estudanteEmAlgumGrupo, normalizarIdsWorkspace } from '@/lib/sistema/testadores-globais'

/**
 * ACESSO À ABA "Caderno (beta)" do Meus Cadernos (OneNote do aluno, fase 1).
 * Regra por GRUPO DE ACESSO: `simulado_tenants.tema.caderno_beta_grupos` = ids de `simulado_grupos` (zero migração).
 * Libera também a equipe do Workspace (testadores globais: e-mail OU grupo). Lista vazia/ausente = ninguém (fail-closed).
 * A decisão é SEMPRE do servidor (a página e as rotas /api/aluno/notebook/** chamam esta função).
 *
 * CACHE EM MEMÓRIA (por réplica do `web`): cada rota do caderno chama esta função, e a decisão custa 2-4 consultas. Guardamos o
 * resultado POSITIVO e NEGATIVO por `${tenantId}:${estudanteId}` por 30 s e a lista de grupos por tenant por 60 s.
 * ATRASO MÁXIMO para remover alguém do beta (tirar do grupo / do Workspace) = 30 s por réplica (a lista de grupos do tenant pode levar
 * até 60 s para refletir uma troca de `caderno_beta_grupos`, mas a decisão de cada aluno só é recalculada a cada 30 s, então o pior
 * caso é ~90 s). Falhas de banco NÃO são cacheadas (fail-closed sem "grudar" o erro).
 */
export const TTL_BETA_MS = 30_000
export const TTL_GRUPOS_BETA_MS = 60_000
const MAX_ENTRADAS = 2000

const cacheDecisao = new Map<string, { ok: boolean; ate: number }>()
const cacheGrupos = new Map<string, { ids: string[]; ate: number }>()

function podar<V extends { ate: number }>(m: Map<string, V>, agora: number) {
  if (m.size < MAX_ENTRADAS) return
  for (const [k, v] of m) if (v.ate <= agora) m.delete(k)
  if (m.size >= MAX_ENTRADAS) m.clear()
}

/** Limpa os caches (uso em testes / invalidação manual). */
export function limparCacheCadernoBeta() { cacheDecisao.clear(); cacheGrupos.clear() }

async function lerGrupos(tenantId: string): Promise<string[]> {
  const agora = Date.now()
  const c = cacheGrupos.get(tenantId)
  if (c && c.ate > agora) return c.ids
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_tenants').select('g:tema->caderno_beta_grupos').eq('id', tenantId).maybeSingle()
  if (error) throw error
  const ids = normalizarIdsWorkspace((data as { g?: unknown } | null)?.g)
  podar(cacheGrupos, agora)
  cacheGrupos.set(tenantId, { ids, ate: agora + TTL_GRUPOS_BETA_MS })
  return ids
}

export const getGruposCadernoBeta = cache(async (tenantId: string): Promise<string[]> => {
  try { return await lerGrupos(tenantId) } catch { return [] }
})

export async function cadernoBetaLiberado(args: { tenantId: string; estudanteId: string | null | undefined; email?: string | null }): Promise<boolean> {
  if (!args.estudanteId) return false
  const k = `${args.tenantId}:${args.estudanteId}`
  const agora = Date.now()
  const c = cacheDecisao.get(k)
  if (c && c.ate > agora) return c.ok
  try {
    let grupos: string[] = []
    let degradado = false // leitura dos grupos falhou: decide só pelo Workspace e NÃO cacheia um "não" provisório
    try { grupos = await lerGrupos(args.tenantId) } catch { degradado = true }
    const ok = (await estudanteEmAlgumGrupo(args.estudanteId, grupos))
      || (await ehNoWorkspace({ tenantId: args.tenantId, email: args.email ?? null, estudanteId: args.estudanteId }))
    if (ok || !degradado) {
      podar(cacheDecisao, agora)
      cacheDecisao.set(k, { ok, ate: agora + TTL_BETA_MS })
    }
    return ok
  } catch { return false }
}
