import { createAdminClient } from '@/lib/supabase/server'
import { handler, paginacao, dataParam, uuidParam, okLista } from '@/lib/api-v1'

export const dynamic = 'force-dynamic'

const BASE = 'id, estudante_id, metodo, origem, dispositivo, navegador, so, iniciado_em, ultimo_visto_em, encerrado_em'

export async function GET(req: Request) {
  return handler(req, 'acessos:read', async ({ auth, url }) => {
    const pg = paginacao(url)
    const pii = auth.escopos.includes('acessos:pii')
    let query = createAdminClient()
      .from('simulado_aluno_acessos')
      .select(pii ? `${BASE}, ip, user_agent` : BASE, { count: 'exact' })
      .eq('tenant_id', auth.tenantId)
      .is('impersonado_por', null) // fora: sessões de impersonação por admin
    const est = uuidParam(url, 'estudante_id'); if (est) query = query.eq('estudante_id', est)
    const desde = dataParam(url, 'desde'); if (desde) query = query.gte('iniciado_em', desde)
    const ate = dataParam(url, 'ate'); if (ate) query = query.lte('iniciado_em', ate)
    const { data, count, error } = await query.order('iniciado_em', { ascending: false }).order('id').range(pg.from, pg.to)
    if (error) throw error
    return okLista(data ?? [], pg, count)
  })
}
