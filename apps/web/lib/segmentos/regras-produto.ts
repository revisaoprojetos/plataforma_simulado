import 'server-only'
import { ContextoAluno, avaliarSegmentos } from './avaliar'

/**
 * Regras POR SEGMENTO dentro de um produto, aplicadas ao aluno (tabelas da migração 20261115010000):
 *  - LIBERAÇÃO (simulado_produto_disponibilidade_seg): módulo/aula com disponibilidade própria para quem está no
 *    segmento — substitui a disponibilidade base do item. Várias casando: menor `prioridade` (empate: mais antiga).
 *  - CAPA (simulado_produto_capas_seg): módulo (ou produto) com imagem/título/descrição próprios para quem está
 *    no segmento. Várias casando: menor `prioridade` vence.
 * Sem as tabelas (migração ausente) ou sem regras = comportamento anterior (sem custo: nem avalia segmentos).
 */

export type CapaSegmento = { imagem_url: string | null; titulo: string | null; descricao: string | null; ocultar_titulo: boolean }
export interface RegrasSegmentoAluno {
  /** Disponibilidade efetiva do alvo: a do segmento do aluno, se houver; senão a base. */
  disp: (alvoId: string, base: unknown) => unknown
  /** Capa do segmento do aluno para o alvo (módulo) ou o produto; null = usar a capa base. */
  capa: (tipo: 'modulo' | 'produto', alvoId: string | null) => CapaSegmento | null
}

const SEM_REGRAS: RegrasSegmentoAluno = { disp: (_id, base) => base, capa: () => null }

type LinhaDisp = { alvo_id: string; segmento_id: string; disponibilidade: unknown; prioridade: number; criado_em: string }
type LinhaCapa = { alvo_tipo: 'produto' | 'modulo'; alvo_id: string | null; segmento_id: string; imagem_url: string | null; titulo: string | null; descricao: string | null; ocultar_titulo: boolean; prioridade: number; criado_em: string }

const ordem = (a: { prioridade: number; criado_em: string }, b: { prioridade: number; criado_em: string }) =>
  a.prioridade - b.prioridade || (a.criado_em < b.criado_em ? -1 : a.criado_em > b.criado_em ? 1 : 0)

export async function regrasSegmentoDoAluno(svc: any, tenantId: string, estudanteId: string, produtoId: string, ctx?: ContextoAluno): Promise<RegrasSegmentoAluno> {
  let disp: LinhaDisp[] = [], capas: LinhaCapa[] = []
  try {
    const [d, c] = await Promise.all([
      svc.from('simulado_produto_disponibilidade_seg').select('alvo_id, segmento_id, disponibilidade, prioridade, criado_em')
        .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).limit(5000),
      svc.from('simulado_produto_capas_seg').select('alvo_tipo, alvo_id, segmento_id, imagem_url, titulo, descricao, ocultar_titulo, prioridade, criado_em')
        .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).limit(2000),
    ])
    if (!d.error) disp = (d.data ?? []) as LinhaDisp[]
    if (!c.error) capas = (c.data ?? []) as LinhaCapa[]
  } catch { return SEM_REGRAS }
  if (!disp.length && !capas.length) return SEM_REGRAS

  const noSeg = await avaliarSegmentos(ctx ?? new ContextoAluno(svc, tenantId, estudanteId), [...disp.map((r) => r.segmento_id), ...capas.map((r) => r.segmento_id)])
  const dispPorAlvo = new Map<string, LinhaDisp[]>()
  for (const r of disp) if (noSeg.get(r.segmento_id)) { const l = dispPorAlvo.get(r.alvo_id) ?? []; l.push(r); dispPorAlvo.set(r.alvo_id, l) }
  const capaPorAlvo = new Map<string, LinhaCapa[]>()
  for (const r of capas) if (noSeg.get(r.segmento_id)) { const k = r.alvo_tipo === 'produto' ? 'produto' : `modulo:${r.alvo_id}`; const l = capaPorAlvo.get(k) ?? []; l.push(r); capaPorAlvo.set(k, l) }

  return {
    disp: (alvoId, base) => { const l = dispPorAlvo.get(alvoId); return l?.length ? [...l].sort(ordem)[0].disponibilidade : base },
    capa: (tipo, alvoId) => {
      const l = capaPorAlvo.get(tipo === 'produto' ? 'produto' : `modulo:${alvoId}`)
      if (!l?.length) return null
      const r = [...l].sort(ordem)[0]
      return { imagem_url: r.imagem_url, titulo: r.titulo, descricao: r.descricao, ocultar_titulo: !!r.ocultar_titulo }
    },
  }
}
