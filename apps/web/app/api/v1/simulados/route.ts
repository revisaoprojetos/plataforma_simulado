import { createAdminClient } from '@/lib/supabase/server'
import { handler, paginacao, okLista } from '@/lib/api-v1'

export const dynamic = 'force-dynamic'

const STATUS = ['rascunho', 'publicado', 'encerrado']

export async function GET(req: Request) {
  return handler(req, 'simulados:read', async ({ auth, url }) => {
    const pg = paginacao(url)
    let query = createAdminClient()
      .from('simulado_simulados')
      .select('id, titulo, descricao, modo_aplicacao, status, data_inicio, data_fim, tempo_limite_min, created_at', { count: 'exact' })
      .eq('tenant_id', auth.tenantId)
    const st = url.searchParams.get('status')
    if (st && STATUS.includes(st)) query = query.eq('status', st)
    const { data, count, error } = await query.order('created_at', { ascending: false }).order('id').range(pg.from, pg.to)
    if (error) throw error
    return okLista(data ?? [], pg, count)
  })
}
