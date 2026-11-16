import { createAdminClient } from '@/lib/supabase/server'
import { handler, paginacao, dataParam, uuidParam, okLista } from '@/lib/api-v1'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handler(req, 'leitura:read', async ({ auth, url }) => {
    const pg = paginacao(url)
    let query = createAdminClient()
      .from('simulado_leitura_progresso')
      .select('id, estudante_id, documento_id, documento_versao, pct, tempo_seg, iniciado_em, concluido_em, atualizado_em', { count: 'exact' })
      .eq('tenant_id', auth.tenantId)
    const est = uuidParam(url, 'estudante_id'); if (est) query = query.eq('estudante_id', est)
    const doc = uuidParam(url, 'documento_id'); if (doc) query = query.eq('documento_id', doc)
    const desde = dataParam(url, 'desde'); if (desde) query = query.gte('atualizado_em', desde)
    const { data, count, error } = await query.order('atualizado_em', { ascending: false }).order('id').range(pg.from, pg.to)
    if (error) throw error
    return okLista(data ?? [], pg, count)
  })
}
