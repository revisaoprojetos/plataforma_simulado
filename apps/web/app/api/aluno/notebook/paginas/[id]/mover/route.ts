import { NextRequest } from 'next/server'
import { autenticarBeta, lerJson, limiteEscrita, resp400, resp404, resp429, respErroDb, respJson } from '@/lib/aluno/notebook-api'
import { colunaAusente, normalizarNiveisSecao, rpcAusente } from '@/lib/aluno/notebook-server'
import { intervaloBloco, planejarMover } from '@/lib/aluno/notebook-arvore'
import { moverPaginaSchema, uuidSchema } from '@/lib/aluno/notebook-tipos'

export const dynamic = 'force-dynamic'

type Linha = { id: string; ordem: number; nivel: number }

// POST /api/aluno/notebook/paginas/:id/mover {secao_id, antes_de_id?} -> {ok, secao_id, ids:[...movidos], ordens:{id:ordem}}
// Move a página + suas subpáginas CONTÍGUAS (nível maior) para outra seção (ou outra posição da mesma) do MESMO aluno.
// `antes_de_id` = página da seção destino que ficará DEPOIS do bloco; ausente = fim. Seção auto_* => 400.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await autenticarBeta()
  if (!a.ok) return a.resposta
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) return resp404()
  if (!limiteEscrita(a.estudanteId)) return resp429()
  const j = await lerJson(request)
  if (!j.ok) return j.resposta
  const p = moverPaginaSchema.safeParse(j.corpo)
  if (!p.success) return resp400('Dados inválidos.', { erros: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })
  const { secao_id: destinoId, antes_de_id: antesDeId } = p.data

  const escopo = (q: any) => q.eq('tenant_id', a.tenantId).eq('estudante_id', a.estudanteId)
  const pag = await escopo(a.svc.from('simulado_aluno_notebook_paginas').select('id, secao_id').eq('id', id)).is('deletado_em', null).maybeSingle()
  if (pag.error) return respErroDb(pag.error, 'mover.pagina')
  if (!pag.data) return resp404()
  const sec = await escopo(a.svc.from('simulado_aluno_notebook_secoes').select('id, tipo').eq('id', destinoId)).is('deletado_em', null).maybeSingle()
  if (sec.error) return respErroDb(sec.error, 'mover.secao')
  if (!sec.data) return resp404()
  if (String(sec.data.tipo).startsWith('auto_')) return resp400('Seção automática não aceita páginas.')
  if (antesDeId === id) return resp400('antes_de_id não pode ser a própria página.')

  // sequência (ordem, id) das páginas vivas — com `nivel`; sem a coluna (migração pendente) assume 0 e não move subpáginas.
  const ler = async (secaoId: string): Promise<{ linhas: Linha[] } | { error: unknown }> => {
    const q = (cols: string) => escopo(a.svc.from('simulado_aluno_notebook_paginas').select(cols).eq('secao_id', secaoId)).is('deletado_em', null)
      .order('ordem', { ascending: true }).order('id', { ascending: true }).limit(2000)
    let r = await q('id, ordem, nivel')
    if (r.error && colunaAusente(r.error)) r = await q('id, ordem')
    if (r.error) return { error: r.error }
    return { linhas: (r.data ?? []).map((l: any) => ({ id: l.id, ordem: l.ordem, nivel: typeof l.nivel === 'number' ? l.nivel : 0 })) }
  }
  const origem = await ler(pag.data.secao_id)
  if ('error' in origem) return respErroDb(origem.error, 'mover.origem')
  const idx = origem.linhas.findIndex((l) => l.id === id)
  if (idx < 0) return resp404()
  const [ini, fim] = intervaloBloco(origem.linhas.map((l) => l.nivel), idx)
  const bloco = origem.linhas.slice(ini, fim)

  let destino = origem
  if (destinoId !== pag.data.secao_id) {
    const d = await ler(destinoId)
    if ('error' in d) return respErroDb(d.error, 'mover.destino')
    destino = d
  }
  const plano = planejarMover(destino.linhas, bloco, antesDeId)
  if (!plano) return resp400('antes_de_id não pertence à seção de destino.')

  const mudaSecao = destinoId !== pag.data.secao_id
  const resposta = () => respJson({ secao_id: destinoId, ids: bloco.map((b) => b.id), ordens: Object.fromEntries(bloco.map((b) => [b.id, plano.ordens.get(b.id)])) })

  // Caminho preferido: RPC ATÔMICA (uma transação, seção destino travada, tenant+estudante validados dentro da função,
  // versao++ das páginas cujo nível mudou, cascata de níveis nas duas seções). Sem a RPC (migração 20261129020000) cai no caminho antigo.
  const ordemIds0 = plano.renumerou ? plano.sequenciaFinal : bloco.map((b) => b.id)
  const alvos = ordemIds0.filter((alvo) => plano.ordens.get(alvo) !== undefined)
  const rpc = await a.svc.rpc('notebook_mover_bloco', {
    p_tenant: a.tenantId, p_estudante: a.estudanteId, p_secao_origem: pag.data.secao_id, p_secao_destino: destinoId,
    p_ids: alvos, p_ordens: alvos.map((x) => plano.ordens.get(x) as number),
    p_niveis: alvos.map((x) => plano.niveisBloco.get(x) ?? -1), // -1 = manter o nível
    p_ids_bloco: mudaSecao ? bloco.map((b) => b.id) : [],
  })
  if (!rpc.error) return resposta()
  if (!rpcAusente(rpc.error)) {
    if ((rpc.error as { code?: string }).code === 'P0002') return resp404()
    return respErroDb(rpc.error, 'mover.rpc')
  }

  const aplicar = async (alvoId: string, ordem: number) => {
    const upd: Record<string, unknown> = { ordem }
    if (mudaSecao && bloco.some((b) => b.id === alvoId)) upd.secao_id = destinoId
    const nivel = plano.niveisBloco.get(alvoId)
    if (nivel !== undefined) upd.nivel = nivel
    let u = await escopo(a.svc.from('simulado_aluno_notebook_paginas').update(upd).eq('id', alvoId))
    if (u.error && colunaAusente(u.error) && 'nivel' in upd) { delete upd.nivel; u = await escopo(a.svc.from('simulado_aluno_notebook_paginas').update(upd).eq('id', alvoId)) }
    return u.error
  }
  // blocos movidos primeiro (ficam consistentes com a nova seção), depois os demais renumerados (raro)
  const ordemIds = plano.renumerou ? plano.sequenciaFinal : bloco.map((b) => b.id)
  for (const alvo of ordemIds) {
    const ordem = plano.ordens.get(alvo)
    if (ordem === undefined) continue
    const err = await aplicar(alvo, ordem)
    if (err) return respErroDb(err, 'mover.aplicar')
  }
  // cascata de níveis: o primeiro item depois do bloco (destino) e o item que ficou depois do bloco na origem
  for (const sid of new Set([destinoId, pag.data.secao_id])) {
    const n = await normalizarNiveisSecao(a.svc, a, sid)
    if (n) return respErroDb(n.error, 'mover.normalizar')
  }
  return resposta()
}
