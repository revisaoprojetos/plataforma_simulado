import { createAdminClient } from '@/lib/supabase/server'
import { handler, paginacao, dataParam, uuidParam, okLista } from '@/lib/api-v1'
import { sanearBusca } from '@/lib/seguranca/postgrest-safe'

export const dynamic = 'force-dynamic'

/** meta: só chaves não sensíveis (sem ids de admin/impersonação). */
const META_OK = ['qtd', 'pct', 'acertos', 'total', 'origem'] as const
function metaSegura(meta: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!meta || typeof meta !== 'object') return out
  for (const k of META_OK) {
    const v = (meta as Record<string, unknown>)[k]
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out[k] = typeof v === 'string' ? v.slice(0, 80) : v
  }
  return out
}

export async function GET(req: Request) {
  return handler(req, 'atividades:read', async ({ auth, url }) => {
    const pg = paginacao(url)
    let query = createAdminClient()
      .from('simulado_aluno_atividades')
      .select('id, estudante_id, tipo, ref_tipo, ref_id, titulo, meta, criado_em', { count: 'exact' })
      .eq('tenant_id', auth.tenantId)
      .is('meta->>impersonado_por', null) // fora: visualização como aluno (impersonação por admin)
    const est = uuidParam(url, 'estudante_id'); if (est) query = query.eq('estudante_id', est)
    const tipo = sanearBusca(url.searchParams.get('tipo') || '', 40); if (tipo) query = query.eq('tipo', tipo)
    const desde = dataParam(url, 'desde'); if (desde) query = query.gte('criado_em', desde)
    const ate = dataParam(url, 'ate'); if (ate) query = query.lte('criado_em', ate)
    const { data, count, error } = await query.order('criado_em', { ascending: false }).order('id').range(pg.from, pg.to)
    if (error) throw error
    return okLista((data ?? []).map((r) => ({ ...r, meta: metaSegura((r as { meta?: unknown }).meta) })), pg, count)
  })
}
