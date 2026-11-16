import 'server-only'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { remember } from '@/lib/cache/relatorio-cache'
import { ContextoAluno, avaliarSegmentos } from './avaliar'
import { normalizarRegra, refsDaRegra } from './tipos'
import { gruposForaDaMatriz, ordemRegra as ordem } from './matriz-grupos'

/**
 * Regras POR SEGMENTO dentro de um produto, aplicadas ao aluno (tabelas da migração 20261115010000):
 *  - LIBERAÇÃO (simulado_produto_disponibilidade_seg): módulo/aula com disponibilidade própria para quem está no
 *    segmento — substitui a disponibilidade base do item. Várias casando: menor `prioridade` (empate: mais antiga).
 *  - CAPA (simulado_produto_capas_seg): módulo (ou produto) com imagem/título/descrição próprios para quem está
 *    no segmento. Várias casando: menor `prioridade` vence.
 * Sem as tabelas (migração ausente) ou sem regras = comportamento anterior (sem custo: nem avalia segmentos).
 *
 * MATRIZ (decisão 16/11/2026): só ficam sujeitos às regras de liberação os grupos que estão DENTRO da matriz (grupo
 * referenciado na regra de algum segmento com linha ativa em disponibilidade_seg do produto). Aluno que pertence (vigente)
 * a algum grupo VINCULADO ao produto e FORA da matriz tem liberação TOTAL (disp = base; a regra restritiva de outro grupo
 * dele não tira acesso). Se todos os grupos vinculados dele estão na matriz, valem as regras: várias casando = menor
 * `prioridade`, empate = regra mais ANTIGA (criado_em). Capas não são afetadas.
 */

export type CapaSegmento = { imagem_url: string | null; titulo: string | null; descricao: string | null; ocultar_titulo: boolean }
export interface RegrasSegmentoAluno {
  /** Disponibilidade efetiva do alvo: a do segmento do aluno, se houver; senão a base. */
  disp: (alvoId: string, base: unknown) => unknown
  /** Capa do segmento do aluno para o alvo (módulo) ou o produto; null = usar a capa base. */
  capa: (tipo: 'modulo' | 'produto', alvoId: string | null) => CapaSegmento | null
  /** O aluno tem regra de liberação de segmento PRÓPRIA para este módulo/aula? (false em liberação total.) */
  temRegra?: (alvoId: string) => boolean
  /** Liberação TOTAL: ids dos grupos do aluno, vinculados ao produto e FORA da matriz (null = regras valem normalmente). */
  liberacaoTotal?: string[] | null
}

const SEM_REGRAS: RegrasSegmentoAluno = { disp: (_id, base) => base, capa: () => null, temRegra: () => false, liberacaoTotal: null }

/** Grupos vinculados ao produto (simulado_produto_itens tipo 'grupo' ativo). Cache curto compartilhado. */
async function gruposVinculados(svc: any, tenantId: string, produtoId: string): Promise<string[]> {
  return remember<string[]>(`seg-matriz:vinc:${tenantId}:${produtoId}`, 60, async () => {
    const rows = await fetchAll<{ item_id: string }>(() => svc.from('simulado_produto_itens').select('item_id')
      .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('tipo_item', 'grupo').eq('ativo', true).order('item_id', { ascending: true }) as any)
    return [...new Set(rows.map((r) => r.item_id))]
  })
}

/** Grupos DENTRO da matriz: referenciados (ref/refs) na regra dos segmentos que têm linha ativa de liberação no produto. */
async function gruposNaMatriz(svc: any, tenantId: string, produtoId: string, segmentoIds: string[]): Promise<string[]> {
  return remember<string[]>(`seg-matriz:dentro:${tenantId}:${produtoId}`, 60, async () => {
    const ids = [...new Set(segmentoIds)]
    const out = new Set<string>()
    for (let k = 0; k < ids.length; k += 80) {
      const { data, error } = await svc.from('simulado_segmentos').select('id, regra').eq('tenant_id', tenantId).in('id', ids.slice(k, k + 80))
      if (error) throw error
      for (const r of (data ?? []) as any[]) for (const g of refsDaRegra(normalizarRegra(r.regra)).grupo) out.add(g)
    }
    return [...out]
  })
}

type LinhaDisp = { alvo_id: string; segmento_id: string; disponibilidade: unknown; prioridade: number; criado_em: string }
type LinhaCapa = { alvo_tipo: 'produto' | 'modulo'; alvo_id: string | null; segmento_id: string; imagem_url: string | null; titulo: string | null; descricao: string | null; ocultar_titulo: boolean; prioridade: number; criado_em: string }


export async function regrasSegmentoDoAluno(svc: any, tenantId: string, estudanteId: string, produtoId: string, ctx?: ContextoAluno): Promise<RegrasSegmentoAluno> {
  let disp: LinhaDisp[] = [], capas: LinhaCapa[] = []
  try {
    // PAGINADO: o PostgREST corta em 1000 linhas por resposta (o `.limit(5000)` não passa disso) e as regras por
    // aula de várias turmas somam milhares — sem paginar, turmas inteiras ficavam SEM a restrição no aluno.
    const [d, c] = await Promise.all([
      fetchAll<LinhaDisp>(() => svc.from('simulado_produto_disponibilidade_seg').select('alvo_id, segmento_id, disponibilidade, prioridade, criado_em')
        .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).order('id', { ascending: true }) as any).then((data) => ({ data, error: null })).catch((error) => ({ data: [] as LinhaDisp[], error })),
      fetchAll<LinhaCapa>(() => svc.from('simulado_produto_capas_seg').select('alvo_tipo, alvo_id, segmento_id, imagem_url, titulo, descricao, ocultar_titulo, prioridade, criado_em')
        .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).order('id', { ascending: true }) as any).then((data) => ({ data, error: null })).catch((error) => ({ data: [] as LinhaCapa[], error })),
    ])
    if (!d.error) disp = d.data
    if (!c.error) capas = c.data
  } catch { return SEM_REGRAS }
  if (!disp.length && !capas.length) return SEM_REGRAS

  const ctxA = ctx ?? new ContextoAluno(svc, tenantId, estudanteId)
  const noSeg = await avaliarSegmentos(ctxA, [...disp.map((r) => r.segmento_id), ...capas.map((r) => r.segmento_id)])
  // D1/D2: grupo do aluno vinculado ao produto e FORA da matriz → liberação total (regras de liberação não se aplicam).
  // Só entram na conta grupos VINCULADOS ao produto: grupo geral não vinculado (ex.: Passaporte) é NEUTRO; se ganhar regra de segmento
  // na matriz, ela vale para quem casa (prioridade / mais antiga) sem ser 'engolida' pela liberação total. Regra de disponibilidade
  // só altera datas; acesso ao produto vem de assinatura/grupo vinculado/gratuito/segmento da aba Visibilidade (não desta tabela).
  let foraDaMatriz: string[] | null = null
  if (disp.length) {
    try {
      const [vinc, dentro, meus] = await Promise.all([
        gruposVinculados(svc, tenantId, produtoId),
        gruposNaMatriz(svc, tenantId, produtoId, disp.map((r) => r.segmento_id)),
        ctxA.grupos(),
      ])
      const f = gruposForaDaMatriz(vinc, new Set(dentro), meus, new Date().toISOString())
      if (f.length) foraDaMatriz = f
    } catch { /* sem a checagem: comportamento anterior (regras valem) */ }
  }
  const dispPorAlvo = new Map<string, LinhaDisp[]>()
  if (!foraDaMatriz) for (const r of disp) if (noSeg.get(r.segmento_id)) { const l = dispPorAlvo.get(r.alvo_id) ?? []; l.push(r); dispPorAlvo.set(r.alvo_id, l) }
  const capaPorAlvo = new Map<string, LinhaCapa[]>()
  for (const r of capas) if (noSeg.get(r.segmento_id)) { const k = r.alvo_tipo === 'produto' ? 'produto' : `modulo:${r.alvo_id}`; const l = capaPorAlvo.get(k) ?? []; l.push(r); capaPorAlvo.set(k, l) }

  return {
    disp: (alvoId, base) => { const l = dispPorAlvo.get(alvoId); return l?.length ? [...l].sort(ordem)[0].disponibilidade : base },
    temRegra: (alvoId) => !!dispPorAlvo.get(alvoId)?.length,
    liberacaoTotal: foraDaMatriz,
    capa: (tipo, alvoId) => {
      const l = capaPorAlvo.get(tipo === 'produto' ? 'produto' : `modulo:${alvoId}`)
      if (!l?.length) return null
      const r = [...l].sort(ordem)[0]
      return { imagem_url: r.imagem_url, titulo: r.titulo, descricao: r.descricao, ocultar_titulo: !!r.ocultar_titulo }
    },
  }
}
