import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import type { RegraFiltros, InicioConfig, FimConfig, StatusRegra } from './tipos'
import { sanearBusca } from '@/lib/seguranca/postgrest-safe'

/**
 * Leituras do admin de Regras de liberação (/admin/liberacao). server-only; recebe tenantId.
 * Otimizado: counts no banco, projeção de colunas, paginação server-side.
 */

function normFiltros(f: any): RegraFiltros {
  return {
    plataformas: Array.isArray(f?.plataformas) ? f.plataformas : [],
    produtos: Array.isArray(f?.produtos) ? f.produtos : [],
    ofertas: Array.isArray(f?.ofertas) ? f.ofertas : [],
    periodoDe: f?.periodoDe ?? null, periodoAte: f?.periodoAte ?? null, aplicarATudo: !!f?.aplicarATudo,
  }
}

export interface RegraAdmin {
  id: string; nome: string; status: StatusRegra; prioridade: number
  filtros: RegraFiltros; inicio: InicioConfig; fim: FimConfig
  pausadaEm: string | null; canceladaEm: string | null
  produtoIds: string[]; produtoNomes: string[]; grantsAtivos: number
}

export async function listarRegras(tenantId: string): Promise<RegraAdmin[]> {
  const svc = createAdminClient()
  const { data: regras } = await svc.from('simulado_liberacao_regras')
    .select('id, nome, status, prioridade, filtros, inicio, fim, paused_at, canceled_at, criado_em')
    .eq('tenant_id', tenantId).order('status', { ascending: true }).order('prioridade', { ascending: true }).order('criado_em', { ascending: false })
  const lista = regras ?? []
  if (!lista.length) return []
  const ids = lista.map((r: any) => r.id)
  const [{ data: rp }, { data: grants }] = await Promise.all([
    svc.from('simulado_liberacao_regra_produtos').select('regra_id, produto_id').in('regra_id', ids),
    svc.from('simulado_access_grants').select('regra_id').eq('tenant_id', tenantId).eq('status', 'active').in('regra_id', ids),
  ])
  const prodIds = [...new Set((rp ?? []).map((x: any) => x.produto_id))]
  const nomeProd = new Map<string, string>()
  if (prodIds.length) {
    const { data: prods } = await svc.from('simulado_produtos').select('id, nome').in('id', prodIds)
    for (const p of prods ?? []) nomeProd.set(p.id, p.nome)
  }
  const prodsPorRegra = new Map<string, string[]>()
  for (const x of rp ?? []) { const a = prodsPorRegra.get(x.regra_id) ?? []; a.push(x.produto_id); prodsPorRegra.set(x.regra_id, a) }
  const grantsPorRegra = new Map<string, number>()
  for (const g of grants ?? []) if (g.regra_id) grantsPorRegra.set(g.regra_id, (grantsPorRegra.get(g.regra_id) ?? 0) + 1)

  return lista.map((r: any) => {
    const pids = prodsPorRegra.get(r.id) ?? []
    return {
      id: r.id, nome: r.nome, status: r.status, prioridade: r.prioridade ?? 100,
      filtros: normFiltros(r.filtros), inicio: (r.inicio ?? { tipo: 'immediate' }) as InicioConfig, fim: (r.fim ?? { tipo: 'lifetime' }) as FimConfig,
      pausadaEm: r.paused_at ?? null, canceladaEm: r.canceled_at ?? null,
      produtoIds: pids, produtoNomes: pids.map((pid) => nomeProd.get(pid) ?? pid), grantsAtivos: grantsPorRegra.get(r.id) ?? 0,
    }
  })
}

export interface ProdutoSeletor { id: string; nome: string; ativo: boolean }
export async function listarProdutosParaSeletor(tenantId: string): Promise<ProdutoSeletor[]> {
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_produtos').select('id, nome, ativo').eq('tenant_id', tenantId).order('nome', { ascending: true })
  return (data ?? []).map((p: any) => ({ id: p.id, nome: p.nome, ativo: p.ativo !== false }))
}

export interface StatusMapAdmin { id: string; provider: string; valor_normalizado: string; classificacao: 'positive' | 'negative' | 'neutral' }
export async function listarStatusMappings(tenantId: string): Promise<StatusMapAdmin[]> {
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_status_mappings').select('id, provider, valor_normalizado, classificacao').eq('tenant_id', tenantId).order('provider', { ascending: true }).order('valor_normalizado', { ascending: true })
  return (data ?? []) as StatusMapAdmin[]
}

const ESTADOS_PEDIDO = ['pending', 'granted', 'no_matching_rule', 'blocked_by_paused_rule', 'revoked', 'ignored'] as const
export interface PedidoAdmin {
  id: string; provider: string; pedido_id: string; produto_nome: string | null; oferta_nome: string | null
  comprador_email: string | null; comprador_nome: string | null; data_compra: string | null
  status_bruto: string | null; status_classificacao: string | null; processing_state: string; criado_em: string
}
export interface PedidosPagina { rows: PedidoAdmin[]; total: number; totaisPorEstado: Record<string, number> }

export async function listarPedidos(tenantId: string, opts: { estado?: string; q?: string; page?: number; porPagina?: number }): Promise<PedidosPagina> {
  const svc = createAdminClient()
  const porPagina = opts.porPagina ?? 20
  const page = Math.max(1, opts.page ?? 1)
  const de = (page - 1) * porPagina

  // Totais por estado (counts no banco — para os chips de filtro).
  const totaisPorEstado: Record<string, number> = {}
  await Promise.all(ESTADOS_PEDIDO.map(async (est) => {
    const { count } = await svc.from('simulado_liberacao_pedidos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('processing_state', est)
    totaisPorEstado[est] = count ?? 0
  }))

  let q = svc.from('simulado_liberacao_pedidos')
    .select('id, provider, pedido_id, produto_nome, oferta_nome, comprador_email, comprador_nome, data_compra, status_bruto, status_classificacao, processing_state, criado_em', { count: 'exact' })
    .eq('tenant_id', tenantId)
  if (opts.estado && opts.estado !== 'todos') q = q.eq('processing_state', opts.estado)
  const busca = (opts.q ?? '').trim()
  if (busca) {
    const safe = sanearBusca(busca)
    q = q.or(`comprador_email.ilike.%${safe}%,produto_nome.ilike.%${safe}%,pedido_id.ilike.%${safe}%`)
  }
  const { data, count } = await q.order('criado_em', { ascending: false }).range(de, de + porPagina - 1)
  return { rows: (data ?? []) as PedidoAdmin[], total: count ?? 0, totaisPorEstado }
}
