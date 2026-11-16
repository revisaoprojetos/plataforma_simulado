import { createAdminClient } from '@/lib/supabase/server'
import { handler, paginacao, okLista, erro, ehUuid } from '@/lib/api-v1'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handler(req, 'simulados:read', async ({ auth, url }) => {
    if (!ehUuid(id)) return erro(400, 'id inválido.')
    const svc = createAdminClient()
    const { data: sim } = await svc.from('simulado_simulados').select('id').eq('tenant_id', auth.tenantId).eq('id', id).maybeSingle()
    if (!sim) return erro(404, 'Simulado não encontrado.')

    const pg = paginacao(url)
    // Testadores/sessões de teste e apagadas ficam FORA (is_teste=false).
    const { data, count, error } = await svc
      .from('simulado_sessoes_prova')
      .select('id, estudante_id, tentativa_num, status, nota, posicao_ranking, iniciado_em, finalizado_em', { count: 'exact' })
      .eq('tenant_id', auth.tenantId).eq('simulado_id', id)
      .eq('is_teste', false).eq('deletado', false)
      .order('nota', { ascending: false, nullsFirst: false }).order('id')
      .range(pg.from, pg.to)
    if (error) throw error

    const linhas = data ?? []
    const ids = Array.from(new Set(linhas.map((r: any) => r.estudante_id)))
    const nomes = new Map<string, string>()
    for (let i = 0; i < ids.length; i += 80) {
      const { data: es } = await svc.from('simulado_estudantes').select('id, nome').eq('tenant_id', auth.tenantId).in('id', ids.slice(i, i + 80))
      for (const e of es ?? []) nomes.set((e as any).id, (e as any).nome)
    }
    return okLista(linhas.map((r: any) => ({
      sessao_id: r.id,
      estudante_id: r.estudante_id,
      estudante_nome: nomes.get(r.estudante_id) ?? null,
      tentativa: r.tentativa_num,
      status: r.status,
      nota: r.nota,
      posicao: r.posicao_ranking,
      iniciado_em: r.iniciado_em,
      finalizado_em: r.finalizado_em,
    })), pg, count)
  })
}
