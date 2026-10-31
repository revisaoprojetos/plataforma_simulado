import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'

/**
 * TESTADORES GLOBAIS do tenant — lista de e-mails que, ao logar como aluno, têm ACESSO
 * TOTAL: furam manutenção de área/plataforma e todos os gates de conteúdo (matrícula,
 * grupo, prazo, não-publicado, Biblioteca, desafio, cronograma). Decisão do produto:
 * eles CONTAM normalmente em ranking/estatística (NÃO viram sessão is_teste) — só ganham
 * o acesso. Persistido em `simulado_tenants.tema->testadores_globais` (zero migração),
 * no mesmo padrão de merge do `/admin/sistema`.
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

/** Lista de e-mails testadores do tenant atual (ou do `tenantId` dado). Cache por request. Fail-open: erro → vazio. */
export const getTestadoresGlobais = cache(async (tenantId?: string | null): Promise<string[]> => {
  try {
    const tid = tenantId ?? (await getCurrentTenantId())
    const svc = createAdminClient()
    // Seleciona só o caminho jsonb para NÃO puxar os logos base64 do tema.
    const base = svc.from('simulado_tenants').select('t:tema->testadores_globais')
    const { data } = tid
      ? await base.eq('id', tid).maybeSingle()
      : await base.eq('ativo', true).limit(1).maybeSingle()
    return normalizarEmailsTestador((data as { t?: unknown } | null)?.t)
  } catch {
    return []
  }
})

/** E-mail (minúsculo) de um estudante, p/ casar testador quando só se tem o id. Cache por request. */
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

/**
 * O aluno logado é testador global do tenant? Casa por e-mail (preferido) e, quando só há
 * o `estudanteId` (ex.: gates de Biblioteca/desafio), resolve o e-mail do estudante.
 * FAST-PATH: se o tenant não tem nenhum testador, retorna false SEM query extra — não pesa
 * no hot path de acesso a conteúdo.
 */
export async function ehTestadorGlobal(args: {
  tenantId?: string | null
  email?: string | null
  estudanteId?: string | null
}): Promise<boolean> {
  const lista = await getTestadoresGlobais(args.tenantId)
  if (!lista.length) return false
  let email = args.email?.trim().toLowerCase() || null
  if (!email && args.estudanteId) email = await emailDoEstudante(args.estudanteId)
  return !!email && lista.includes(email)
}
