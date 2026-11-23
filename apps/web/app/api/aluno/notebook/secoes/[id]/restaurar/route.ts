import { NextRequest } from 'next/server'
import { autenticarBeta, excedeTetoPaginas, limiteEscrita, resp400, resp404, resp429, respErroDb, respJson, respTetoPaginas } from '@/lib/aluno/notebook-api'
import { limiteLixeiraISO, normalizarNiveisSecao } from '@/lib/aluno/notebook-server'
import { LIMITES, uuidSchema } from '@/lib/aluno/notebook-tipos'

export const dynamic = 'force-dynamic'

// POST /api/aluno/notebook/secoes/:id/restaurar -> {ok, id, paginas_restauradas}
// Restaura a seção (apagada há <= 60 dias) e as páginas apagadas JUNTO com ela (MESMO instante exato de deletado_em: a exclusão grava `agora` nas duas).
// Respeita o teto de seções (100) e de páginas (2000); depois renormaliza os níveis da seção.
// Páginas que o aluno já tinha apagado antes continuam na lixeira.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return resp404()
  if (!limiteEscrita(a.estudanteId)) return resp429()
  const escopo = (q: any) => q.eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId)
  const s = await escopo(a.svc.from('simulado_aluno_notebook_secoes').select('id, tipo, notebook_id, deletado_em').eq('id', id)).not('deletado_em', 'is', null).gte('deletado_em', limiteLixeiraISO()).maybeSingle()
  if (s.error) return respErroDb(s.error, 'secao.restaurar.get')
  if (!s.data) return resp404()

  if (['manual', 'importada'].includes(s.data.tipo)) {
    const c = await escopo(a.svc.from('simulado_aluno_notebook_secoes').select('id', { count: 'exact', head: true }).eq('notebook_id', s.data.notebook_id)).is('deletado_em', null).in('tipo', ['manual', 'importada'])
    if (c.error) return respErroDb(c.error, 'secao.restaurar.count')
    if ((c.count ?? 0) >= LIMITES.secoesManuaisMax) return resp400(`Limite de ${LIMITES.secoesManuaisMax} seções atingido.`)
  }
  const np = await escopo(a.svc.from('simulado_aluno_notebook_paginas').select('id', { count: 'exact', head: true }).eq('secao_id', id)).eq('deletado_em', s.data.deletado_em)
  if (np.error) return respErroDb(np.error, 'secao.restaurar.np')
  const teto = await excedeTetoPaginas(a.svc, a.tenantId, a.estudanteId, s.data.notebook_id, np.count ?? 0)
  if ('error' in teto) return respErroDb(teto.error, 'secao.restaurar.teto')
  if (teto.excede) return respTetoPaginas()
  const du = await escopo(a.svc.from('simulado_aluno_notebook_secoes').update({ deletado_em: null }).eq('id', id)).not('deletado_em', 'is', null)
  if (du.error) return respErroDb(du.error, 'secao.restaurar')
  const pg = await escopo(a.svc.from('simulado_aluno_notebook_paginas').update({ deletado_em: null }).eq('secao_id', id))
    .eq('deletado_em', s.data.deletado_em).select('id')
  if (pg.error) return respErroDb(pg.error, 'secao.restaurar.paginas')
  const n = await normalizarNiveisSecao(a.svc, a, id)
  if (n) console.error('[notebook] secao.restaurar normalizar', (n.error as { code?: string } | null)?.code)
  return respJson({ id, paginas_restauradas: (pg.data ?? []).length })
}
