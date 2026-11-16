import { createAdminClient } from '@/lib/supabase/server'
import { handler, paginacao, buscaParam, dataParam, okLista } from '@/lib/api-v1'

export const dynamic = 'force-dynamic'

import { COLS_ALUNO, mapAluno } from '@/lib/api-v1/aluno'

export async function GET(req: Request) {
  return handler(req, 'alunos:read', async ({ auth, url }) => {
    const pg = paginacao(url)
    const q = buscaParam(url)
    const since = dataParam(url, 'updated_since')
    let query = createAdminClient()
      .from('simulado_estudantes')
      .select(COLS_ALUNO, { count: 'exact' })
      .eq('tenant_id', auth.tenantId)
    if (q) query = query.or(`nome.ilike.%${q}%,email.ilike.%${q}%`)
    if (since) query = query.gte('updated_at', since)
    const { data, count, error } = await query.order('created_at', { ascending: false }).order('id').range(pg.from, pg.to)
    if (error) throw error
    return okLista((data ?? []).map(mapAluno), pg, count)
  })
}
