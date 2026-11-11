import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { resolverVisualSimulados, type VisualSim } from '@/lib/aluno/simulado-visual'
import type { Disponibilidade, ItemRow, ModuloRow, TipoRef, ModuloCard, MaterialChave, OrdemModulos, FiltroModulos } from './curriculo'
import type { Produto, ProdutoLeve, ProdutoSecao } from './tipos'
import { ehModuloLayout } from './tipos'
import { DISPONIBILIDADE_PADRAO, materialDoItem } from './curriculo'

// Leituras server-side do bloco PRODUTOS do Estúdio (pastas + currículo + instrutores + resumo).
// Backend-first: a lista é paginada no banco (.range + count). Tudo filtra por tenant_id
// (service-role bypassa RLS → isolamento é manual). Tolerante a tabela/coluna ausente.

export const FOLDER_AREA_PRODUTO = 'produto'

// ── Tipos de linha da lista (pasta | produto) ──
export interface PastaProdutoFlat { id: string; nome: string; pai_id: string | null; cor: string | null }

export type LinhaConteudo =
  | { kind: 'pasta'; id: string; nome: string; cor: string | null; capa?: string | null; itens: number; atualizado_em: string | null; criado_em: string | null }
  | { kind: 'produto'; id: string; nome: string; slug: string | null; tipo: string; ativo: boolean; cor: string | null; capa?: string | null; itens: number; membros: number; atualizado_em: string | null; criado_em: string | null }

export interface ConteudoPasta {
  rows: LinhaConteudo[]
  total: number
  totalPastas: number
  totalProdutos: number
}

const P_COLS = 'id, nome, slug, tipo, ativo, cor, capa_url, logo_url, atualizado_em, criado_em'

/** Árvore (flat) das pastas de PRODUTO do tenant — p/ breadcrumb e modal "Mover". Bounded. */
export async function listarPastasProduto(tenantId: string): Promise<PastaProdutoFlat[]> {
  const svc = createAdminClient()
  try {
    const { data } = await svc.from('simulado_pastas')
      .select('id, nome, pai_id, cor')
      .eq('tenant_id', tenantId).eq('folder_area', FOLDER_AREA_PRODUTO).eq('deletado', false)
      .order('nome', { ascending: true }).limit(2000)
    return (data ?? []).map((p: any) => ({ id: p.id, nome: p.nome, pai_id: p.pai_id ?? null, cor: p.cor ?? null }))
  } catch { return [] }
}

/** Caminho (raiz → pasta atual) a partir da árvore flat. */
export function breadcrumbPasta(arvore: PastaProdutoFlat[], paiId: string | null): PastaProdutoFlat[] {
  if (!paiId) return []
  const byId = new Map(arvore.map((p) => [p.id, p]))
  const chain: PastaProdutoFlat[] = []
  let cur: string | null = paiId
  const visto = new Set<string>()
  while (cur && !visto.has(cur)) {
    visto.add(cur)
    const p = byId.get(cur); if (!p) break
    chain.unshift(p); cur = p.pai_id
  }
  return chain
}

// ── Filtros reais do navegador (Tipo / Situação / Grupo de acesso) ──
// tipo='pasta' → só pastas; tipo de produto, situação (ativo/inativo) e grupo de acesso → só
// produtos (filtrados no banco). Grupo vem de simulado_produto_itens (tipo_item='grupo').
export interface FiltrosConteudo { tipo?: string | null; situacao?: 'ativo' | 'inativo' | null; grupo?: string | null }

/** produto_ids vinculados a um grupo de acesso (via simulado_produto_itens tipo_item='grupo'). */
async function produtoIdsDoGrupo(svc: any, tenantId: string, grupoId: string): Promise<string[]> {
  try {
    const { data } = await svc.from('simulado_produto_itens').select('produto_id')
      .eq('tenant_id', tenantId).eq('tipo_item', 'grupo').eq('item_id', grupoId)
    return [...new Set(((data ?? []) as any[]).map((r) => r.produto_id).filter(Boolean))]
  } catch { return [] }
}

/** Aplica os filtros de produto a um query-builder (reusado por lista, contagem e export). */
function filtrosProduto(qq: any, f: FiltrosConteudo, tipoProduto: string | null, grupoIds: string[] | null) {
  if (tipoProduto) qq = qq.eq('tipo', tipoProduto)
  if (f.situacao === 'inativo') qq = qq.eq('ativo', false)
  else if (f.situacao === 'ativo') qq = qq.or('ativo.is.null,ativo.eq.true')
  if (grupoIds) qq = qq.in('id', grupoIds.length ? grupoIds : ['00000000-0000-0000-0000-000000000000'])
  return qq
}

// ═════════ SIMULADOS (área "Simulados" do navegador): pastas folder_area='simulado' + simulados ═════════
export const FOLDER_AREA_SIMULADO = 'simulado'

export type LinhaSimulado =
  | { kind: 'pasta'; id: string; nome: string; cor: string | null; capa?: string | null; itens: number; atualizado_em: string | null; criado_em: string | null }
  | { kind: 'simulado'; id: string; nome: string; status: string; capa?: string | null; itens: number; atualizado_em: string | null; criado_em: string | null }

export interface ConteudoSimulados { rows: LinhaSimulado[]; total: number; totalPastas: number; totalSimulados: number }

/** Árvore (flat) das pastas de SIMULADO do tenant — breadcrumb e "Mover". Só created_at existe. */
export async function listarPastasSimulado(tenantId: string): Promise<PastaProdutoFlat[]> {
  const svc = createAdminClient()
  try {
    const { data } = await svc.from('simulado_pastas')
      .select('id, nome, pai_id, cor')
      .eq('tenant_id', tenantId).eq('folder_area', FOLDER_AREA_SIMULADO).eq('deletado', false)
      .order('nome', { ascending: true }).limit(2000)
    return (data ?? []).map((p: any) => ({ id: p.id, nome: p.nome, pai_id: p.pai_id ?? null, cor: p.cor ?? null }))
  } catch { return [] }
}

// ═════════ LISTAGEM UNIFICADA: pastas (produto+simulado) + produtos + simulados no MESMO nível ═════════
export type LinhaUnificada =
  | (Extract<LinhaConteudo, { kind: 'pasta' }> & { folder_area: string })
  | Extract<LinhaConteudo, { kind: 'produto' }>
  | Extract<LinhaSimulado, { kind: 'simulado' }>

export interface ConteudoUnificado { rows: LinhaUnificada[]; total: number }

/** Pastas das duas áreas (produto + simulado) — breadcrumb e "Mover". */
export async function listarPastasUnificadas(tenantId: string): Promise<PastaProdutoFlat[]> {
  const [a, b] = await Promise.all([listarPastasProduto(tenantId), listarPastasSimulado(tenantId)])
  return [...a, ...b].sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))
}

/**
 * Um nível do navegador: pastas (folder_area produto|simulado) → produtos → simulados, paginado
 * nessa ordem. Filtro `tipo` = pasta | produto | simulado. Pastas usam created_at.
 */
export async function conteudoUnificado(
  tenantId: string,
  paiId: string | null,
  opts: { page: number; perPage: number; q: string; sort: string; dir: 'asc' | 'desc'; tipo?: string | null },
): Promise<ConteudoUnificado> {
  const svc = createAdminClient()
  const { page, perPage, q, dir } = opts
  const asc = dir === 'asc'
  const byTitulo = opts.sort === 'titulo'
  const incPastas = !opts.tipo || opts.tipo === 'pasta'
  const incProd = !opts.tipo || opts.tipo === 'produto'
  const incSim = !opts.tipo || opts.tipo === 'simulado'

  const offset = (page - 1) * perPage

  // Pastas: count exato + .range() só da página pedida (sem teto de 500 nem slice em memória).
  let folderSlice: any[] = []
  let nf = 0
  if (incPastas) {
    const build = (col: string) => {
      let fq = svc.from('simulado_pastas').select('id, nome, cor, capa_card_url, capa_url, created_at, folder_area', { count: 'exact' })
        .eq('tenant_id', tenantId).in('folder_area', [FOLDER_AREA_PRODUTO, FOLDER_AREA_SIMULADO]).eq('deletado', false)
      fq = paiId ? fq.eq('pai_id', paiId) : fq.is('pai_id', null)
      if (q) fq = fq.ilike('nome', `%${q}%`)
      return fq.order(col, { ascending: asc }).order('id', { ascending: true }).range(offset, offset + perPage - 1)
    }
    let r: any = await build(byTitulo ? 'nome' : 'created_at')
    if (r.error) r = await build('nome')
    folderSlice = r.data ?? []
    nf = r.count ?? folderSlice.length
  }

  // Contagem de produtos / simulados
  let semPastaId = false
  const buildProd = (head: boolean, comPasta: boolean) => {
    let pq: any = head ? svc.from('simulado_produtos').select('id', { count: 'exact', head: true }) : svc.from('simulado_produtos').select(P_COLS)
    pq = pq.eq('tenant_id', tenantId)
    if (comPasta) pq = paiId ? pq.eq('pasta_id', paiId) : pq.is('pasta_id', null)
    if (q) pq = pq.ilike('nome', `%${q}%`)
    return pq
  }
  const buildSim = (head: boolean) => {
    let sq: any = head ? svc.from('simulado_simulados').select('id', { count: 'exact', head: true }) : svc.from('simulado_simulados').select('id, titulo, status, created_at, regras')
    sq = sq.eq('tenant_id', tenantId).eq('deletado', false)
    sq = paiId ? sq.eq('pasta_id', paiId) : sq.is('pasta_id', null)
    if (q) sq = sq.ilike('titulo', `%${q}%`)
    return sq
  }
  let np = 0
  if (incProd) {
    let r: any = await buildProd(true, true)
    if (r.error && /pasta_id|column|does not exist/i.test(r.error.message)) {
      semPastaId = true
      r = paiId ? { count: 0, error: null } : await buildProd(true, false)
    }
    np = r.count ?? 0
  }
  let ns = 0
  if (incSim) { const r: any = await buildSim(true); ns = r.count ?? 0 }

  let restante = perPage - folderSlice.length

  let produtos: any[] = []
  if (incProd && restante > 0 && np > 0 && !(semPastaId && paiId)) {
    const off = Math.max(0, offset - nf)
    const run = async (col: string) => buildProd(false, !semPastaId).order(col, { ascending: asc }).range(off, off + restante - 1)
    let r: any = await run(byTitulo ? 'nome' : 'atualizado_em')
    if (r.error) r = await run('nome')
    produtos = r.data ?? []
  }
  restante -= produtos.length

  let sims: any[] = []
  if (incSim && restante > 0 && ns > 0) {
    const off = Math.max(0, offset - nf - np)
    const r: any = await buildSim(false).order(byTitulo ? 'titulo' : 'created_at', { ascending: asc }).range(off, off + restante - 1)
    sims = r.data ?? []
  }

  const folderIds = folderSlice.map((f) => f.id)
  const prodIds = produtos.map((p) => p.id)
  const simIds = sims.map((s) => s.id)
  // Pastas: contagem RECURSIVA (tudo na subárvore, não só o nível direto). Produtos/simulados da página:
  // contagens diretas via 1 query por tipo (tallyChunked = .in()+tally), NUNCA N COUNT por id.
  const [recItensPorPasta, itensPorProd, membrosPorProd, visualSim] = await Promise.all([
    folderIds.length ? contarItensRecursivo(svc, tenantId, folderIds) : Promise.resolve(new Map<string, number>()),
    tallyChunked(svc, 'simulado_produto_modulo_itens', 'produto_id', prodIds, (b) => b.eq('deletado', false)),
    tallyChunked(svc, 'simulado_assinaturas', 'produto_id', prodIds, (b) => b.eq('status', 'ativo')),
    // Capa do simulado SÓ pelo banco (regras.banco_base_id) — NÃO varre questões (era o peso por navegação).
    sims.length
      ? resolverVisualSimulados(svc as any, sims.filter((s: any) => s.regras?.banco_base_id).map((s: any) => ({ id: s.id, regras: s.regras }))).catch(() => new Map<string, VisualSim>())
      : Promise.resolve(new Map<string, VisualSim>()),
  ])

  const rows: LinhaUnificada[] = [
    ...folderSlice.map((f): LinhaUnificada => ({
      kind: 'pasta', id: f.id, nome: f.nome, cor: f.cor ?? null, capa: f.capa_card_url ?? f.capa_url ?? null,
      folder_area: f.folder_area ?? FOLDER_AREA_PRODUTO,
      itens: recItensPorPasta.get(f.id) ?? 0,
      atualizado_em: f.created_at ?? null, criado_em: f.created_at ?? null,
    })),
    ...produtos.map((p): LinhaUnificada => ({
      kind: 'produto', id: p.id, nome: p.nome, slug: p.slug ?? null, tipo: p.tipo, ativo: p.ativo !== false,
      cor: p.cor ?? null, capa: p.capa_url ?? p.logo_url ?? null, itens: itensPorProd.get(p.id) ?? 0, membros: membrosPorProd.get(p.id) ?? 0,
      atualizado_em: p.atualizado_em ?? null, criado_em: p.criado_em ?? null,
    })),
    ...sims.map((s): LinhaUnificada => ({
      kind: 'simulado', id: s.id, nome: s.titulo ?? '(sem título)', status: s.status ?? 'rascunho',
      capa: visualSim.get(s.id)?.capa ?? null,
      itens: 0, atualizado_em: s.created_at ?? null, criado_em: s.created_at ?? null, // questões não contadas aqui (peso)
    })),
  ]
  return { rows, total: nf + np + ns }
}

/**
 * Conta linhas por valor de uma coluna com COUNT no banco (head) por id — nunca baixa as linhas
 * (o tally anterior baixava até 1000 linhas e subcontava produtos com muitos membros).
 * Limitado ao slice da página (ids ≤ perPage). Tolerante a tabela/coluna ausente.
 */
async function contarPorChave(
  svc: any, tabela: string, chave: string, ids: string[],
  extra?: (b: any) => any,
): Promise<Map<string, number>> {
  const m = new Map<string, number>()
  if (!ids.length) return m
  await Promise.all(ids.map(async (id) => {
    try {
      let qq = svc.from(tabela).select(chave, { count: 'exact', head: true }).eq(chave, id)
      if (extra) qq = extra(qq)
      const { count, error } = await qq
      if (!error && count) m.set(id, count)
    } catch { /* tabela/coluna ausente → vazio */ }
  }))
  return m
}

/** Itens RECURSIVOS de cada pasta (subpastas + produtos + simulados em TODA a subárvore).
 *  Carrega a árvore (bounded) + a distribuição do conteúdo por pasta (1 query cada) e rola bottom-up. */
async function contarItensRecursivo(svc: any, tenantId: string, folderIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const [arvore, prodPorPasta, simPorPasta] = await Promise.all([
    fetchAll<any>(() => svc.from('simulado_pastas').select('id, pai_id')
      .eq('tenant_id', tenantId).in('folder_area', [FOLDER_AREA_PRODUTO, FOLDER_AREA_SIMULADO]).eq('deletado', false)
      .order('id', { ascending: true })),
    contarPorChaveTenant(svc, 'simulado_produtos', 'pasta_id', tenantId),
    contarPorChaveTenant(svc, 'simulado_simulados', 'pasta_id', tenantId, (b: any) => b.eq('deletado', false)),
  ])
  const filhos = new Map<string, string[]>()
  for (const f of arvore) if (f.pai_id) { const a = filhos.get(f.pai_id) ?? []; a.push(f.id); filhos.set(f.pai_id, a) }
  const direto = (id: string) => (prodPorPasta.get(id) ?? 0) + (simPorPasta.get(id) ?? 0)
  const memo = new Map<string, number>()
  const rec = (id: string, visto: Set<string>): number => {
    const c = memo.get(id); if (c != null) return c
    if (visto.has(id)) return 0
    visto.add(id)
    let t = direto(id)
    for (const sub of (filhos.get(id) ?? [])) t += 1 + rec(sub, visto) // +1 pela subpasta + tudo dentro dela
    memo.set(id, t); return t
  }
  for (const id of folderIds) out.set(id, rec(id, new Set()))
  return out
}

/** Conta linhas do tenant inteiro agrupando por `chave` (1 query paginada + tally em memória). */
async function contarPorChaveTenant(svc: any, tabela: string, chave: string, tenantId: string, extra?: (b: any) => any): Promise<Map<string, number>> {
  const m = new Map<string, number>()
  try {
    const rows = await fetchAll<any>(() => {
      let q = svc.from(tabela).select(`id, ${chave}`).eq('tenant_id', tenantId)
      if (extra) q = extra(q)
      return q.order('id', { ascending: true })
    })
    for (const r of rows) { const k = r[chave]; if (k) m.set(k, (m.get(k) ?? 0) + 1) }
  } catch { /* tabela/coluna ausente */ }
  return m
}

/** Tally por chave, em chunks (para listas grandes de ids — usado no export). */
async function tallyChunked(svc: any, tabela: string, chave: string, ids: string[], extra?: (b: any) => any): Promise<Map<string, number>> {
  const m = new Map<string, number>()
  if (!ids.length) return m
  try {
    // Pagina por .range() (sem o teto de 1000 linhas) com ordem única por id.
    const rows = await fetchAllByIn<any>(ids, (chunk) => {
      let qq = svc.from(tabela).select(`id, ${chave}`).in(chave, chunk)
      if (extra) qq = extra(qq)
      return qq.order('id', { ascending: true })
    })
    for (const r of rows) { const k = r[chave]; if (k) m.set(k, (m.get(k) ?? 0) + 1) }
  } catch { /* tabela/coluna ausente → vazio */ }
  return m
}

// ── Opções dos filtros do navegador de Produtos ──
export interface OpcoesFiltroProduto { tipos: string[]; grupos: { id: string; nome: string }[] }

/** Tipos de produto distintos + grupos de acesso realmente vinculados a algum produto (do tenant). */
export async function opcoesFiltroProduto(tenantId: string): Promise<OpcoesFiltroProduto> {
  const svc = createAdminClient()
  const tipos = new Set<string>()
  try {
    const { data } = await svc.from('simulado_produtos').select('tipo').eq('tenant_id', tenantId).limit(2000)
    for (const r of ((data ?? []) as any[])) if (r.tipo) tipos.add(r.tipo)
  } catch { /* ignore */ }
  let grupos: { id: string; nome: string }[] = []
  try {
    const { data: vinc } = await svc.from('simulado_produto_itens').select('item_id')
      .eq('tenant_id', tenantId).eq('tipo_item', 'grupo').limit(5000)
    const ids = [...new Set(((vinc ?? []) as any[]).map((r) => r.item_id).filter(Boolean))]
    if (ids.length) {
      const gs: { id: string; nome: string }[] = []
      for (let i = 0; i < ids.length; i += 80) {
        const { data } = await svc.from('simulado_grupos').select('id, nome').eq('tenant_id', tenantId).in('id', ids.slice(i, i + 80))
        for (const g of ((data ?? []) as any[])) gs.push({ id: g.id, nome: g.nome ?? '—' })
      }
      grupos = gs.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    }
  } catch { /* ignore */ }
  return { tipos: [...tipos].sort((a, b) => a.localeCompare(b, 'pt-BR')), grupos }
}

// ── Export (XLSX) do nível atual: TODAS as linhas que casam os filtros (sem paginação) ──
export interface LinhaExport {
  tipo: string; titulo: string; itens: number; situacao: string
  membros: number | ''; criado_em: string | null; atualizado_em: string | null
}

export async function linhasParaExport(
  tenantId: string, paiId: string | null,
  opts: { q: string; sort: string; dir: 'asc' | 'desc' } & FiltrosConteudo,
): Promise<LinhaExport[]> {
  const svc = createAdminClient()
  const asc = opts.dir === 'asc'
  const q = opts.q
  const tipoPasta = opts.tipo === 'pasta'
  const tipoProduto = opts.tipo && opts.tipo !== 'pasta' ? opts.tipo : null
  const incluirPastas = !tipoProduto && !opts.situacao && !opts.grupo
  const incluirProdutos = !tipoPasta
  const grupoIds: string[] | null = opts.grupo ? await produtoIdsDoGrupo(svc, tenantId, opts.grupo) : null
  const semProdutos = grupoIds != null && grupoIds.length === 0

  let folders: any[] = []
  if (incluirPastas) {
    let fq = svc.from('simulado_pastas').select('id, nome, created_at')
      .eq('tenant_id', tenantId).eq('folder_area', FOLDER_AREA_PRODUTO).eq('deletado', false)
    fq = paiId ? fq.eq('pai_id', paiId) : fq.is('pai_id', null)
    if (q) fq = fq.ilike('nome', `%${q}%`)
    const { data } = await fq.order('nome', { ascending: true }).limit(2000)
    folders = (data ?? []) as any[]
  }

  let produtos: any[] = []
  if (incluirProdutos && !semProdutos) {
    const build = (comPasta: boolean) => {
      let pq = svc.from('simulado_produtos').select(P_COLS).eq('tenant_id', tenantId)
      if (comPasta) pq = paiId ? pq.eq('pasta_id', paiId) : pq.is('pasta_id', null)
      if (q) pq = pq.ilike('nome', `%${q}%`)
      return filtrosProduto(pq, opts, tipoProduto, grupoIds).order('nome', { ascending: asc }).limit(5000)
    }
    let r = await build(true)
    if (r.error && /pasta_id|column|does not exist/i.test(r.error.message)) r = paiId ? ({ data: [] } as any) : await build(false)
    produtos = (r.data ?? []) as any[]
  }

  const folderIds = folders.map((f) => f.id)
  const prodIds = produtos.map((p) => p.id)
  const [subPorPai, prodPorPasta, itensPorProd, membrosPorProd] = await Promise.all([
    tallyChunked(svc, 'simulado_pastas', 'pai_id', folderIds, (b) => b.eq('folder_area', FOLDER_AREA_PRODUTO).eq('deletado', false)),
    tallyChunked(svc, 'simulado_produtos', 'pasta_id', folderIds),
    tallyChunked(svc, 'simulado_produto_modulo_itens', 'produto_id', prodIds, (b) => b.eq('deletado', false)),
    tallyChunked(svc, 'simulado_assinaturas', 'produto_id', prodIds, (b) => b.eq('status', 'ativo')),
  ])

  return [
    ...folders.map((f): LinhaExport => ({
      tipo: 'Pasta', titulo: f.nome,
      itens: (subPorPai.get(f.id) ?? 0) + (prodPorPasta.get(f.id) ?? 0),
      situacao: '—', membros: '', criado_em: f.created_at ?? null, atualizado_em: f.created_at ?? null,
    })),
    ...produtos.map((p): LinhaExport => ({
      tipo: p.tipo ?? 'produto', titulo: p.nome, itens: itensPorProd.get(p.id) ?? 0,
      situacao: p.ativo === false ? 'Inativo' : 'Ativo', membros: membrosPorProd.get(p.id) ?? 0,
      criado_em: p.criado_em ?? null, atualizado_em: p.atualizado_em ?? null,
    })),
  ]
}

// ── Currículo ──
function normDisponibilidade(j: any): Disponibilidade {
  if (!j || typeof j !== 'object') return { ...DISPONIBILIDADE_PADRAO }
  return {
    tipo: j.tipo ?? 'na_matricula',
    data: j.data ?? null, dias: typeof j.dias === 'number' ? j.dias : null,
    diaSemana: typeof j.diaSemana === 'number' ? j.diaSemana : null,
    antes: j.antes ?? 'bloqueado_cadeado',
  }
}

/** Filtro de tipo da aba Conteúdos (aplicado NO BANCO). */
export type FiltroCurriculo = 'todos' | 'arquivo' | 'video' | 'outros'
const TIPOS_REF_FILTRO: Record<Exclude<FiltroCurriculo, 'todos'>, string[]> = {
  arquivo: ['documento_biblioteca'], video: ['video_url'], outros: ['simulado', 'quiz', 'link', 'cronograma'],
}

/**
 * Currículo do produto: TODOS os módulos (a árvore precisa deles, bounded por produto) e os itens —
 * estes com busca por título (ilike) e filtro de tipo aplicados no banco. Paginado por .range()
 * (o PostgREST corta em 1000 linhas silenciosamente).
 */
export async function getProdutoCurriculo(
  tenantId: string, produtoId: string, opts: { q?: string; filtro?: FiltroCurriculo } = {},
): Promise<{ modulos: ModuloRow[]; itens: ItemRow[] }> {
  const svc = createAdminClient()
  const q = termo(opts.q)
  const tiposFiltro = opts.filtro && opts.filtro !== 'todos' ? TIPOS_REF_FILTRO[opts.filtro] : null
  try {
    const [mrows, irows] = await Promise.all([
      fetchAll<any>(() => svc.from('simulado_produto_modulos')
        .select('*')
        .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false)
        .order('ordem', { ascending: true }).order('id', { ascending: true }) as any, 1000, 'produto_modulos'),
      fetchAll<any>(() => {
        let iq = svc.from('simulado_produto_modulo_itens')
          .select('id, produto_id, modulo_id, ordem, tipo_ref, subtipo, ref_id, ref_url, titulo, visibilidade, situacao, meta, disponibilidade')
          .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false)
        if (q) iq = iq.ilike('titulo', `%${q}%`)
        if (tiposFiltro) iq = iq.in('tipo_ref', tiposFiltro)
        return iq.order('ordem', { ascending: true }).order('id', { ascending: true }) as any
      }, 1000, 'produto_itens'),
    ])
    const modulos: ModuloRow[] = mrows.map((m: any) => ({
      id: m.id, produto_id: m.produto_id, pai_id: m.pai_id ?? null, titulo: m.titulo,
      imagem_url: m.imagem_url ?? null, ocultar_titulo: !!m.ocultar_titulo, descricao: m.descricao ?? null, ordem: m.ordem ?? 0,
      exibicao: m.exibicao === 'recolhido' ? 'recolhido' : 'aberto', disponibilidade: normDisponibilidade(m.disponibilidade),
    }))
    const itens: ItemRow[] = irows.map((i: any) => ({
      id: i.id, produto_id: i.produto_id, modulo_id: i.modulo_id, ordem: i.ordem ?? 0,
      tipo_ref: (i.tipo_ref ?? 'link') as TipoRef, subtipo: i.subtipo ?? null,
      ref_id: i.ref_id ?? null, ref_url: i.ref_url ?? null, titulo: i.titulo,
      visibilidade: i.visibilidade === 'publico' ? 'publico' : 'privado',
      situacao: i.situacao === 'rascunho' ? 'rascunho' : 'ativo',
      meta: (i.meta ?? {}) as Record<string, unknown>, disponibilidade: normDisponibilidade(i.disponibilidade),
    }))
    return { modulos, itens }
  } catch { return { modulos: [], itens: [] } }
}

function rowItem(i: any): ItemRow {
  return {
    id: i.id, produto_id: i.produto_id, modulo_id: i.modulo_id, ordem: i.ordem ?? 0,
    tipo_ref: (i.tipo_ref ?? 'link') as TipoRef, subtipo: i.subtipo ?? null,
    ref_id: i.ref_id ?? null, ref_url: i.ref_url ?? null, titulo: i.titulo,
    visibilidade: i.visibilidade === 'publico' ? 'publico' : 'privado',
    situacao: i.situacao === 'rascunho' ? 'rascunho' : 'ativo',
    meta: (i.meta ?? {}) as Record<string, unknown>, disponibilidade: normDisponibilidade(i.disponibilidade),
  }
}
function rowModulo(m: any): ModuloRow {
  return {
    id: m.id, produto_id: m.produto_id, pai_id: m.pai_id ?? null, titulo: m.titulo,
    imagem_url: m.imagem_url ?? null, ocultar_titulo: !!m.ocultar_titulo, descricao: m.descricao ?? null, ordem: m.ordem ?? 0,
    exibicao: m.exibicao === 'recolhido' ? 'recolhido' : 'aberto', disponibilidade: normDisponibilidade(m.disponibilidade),
  }
}
const COLS_ITEM = 'id, produto_id, modulo_id, ordem, tipo_ref, subtipo, ref_id, ref_url, titulo, visibilidade, situacao, meta, disponibilidade'

/** Todos os módulos do produto (árvore pequena e limitada) — usado nos seletores/diálogos e p/ montar os cards. */
export async function listarModulosProduto(tenantId: string, produtoId: string): Promise<ModuloRow[]> {
  const svc = createAdminClient()
  try {
    const rows = await fetchAll<any>(() => svc.from('simulado_produto_modulos').select('*')
      .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false)
      .order('ordem', { ascending: true }).order('id', { ascending: true }) as any, 1000, 'produto_modulos')
    return rows.map(rowModulo)
  } catch { return [] }
}

export interface PaginaModulos {
  cards: ModuloCard[]; total: number; page: number
  /** todos os módulos (id/título/pai) p/ diálogos de mover/novo conteúdo */
  modulos: ModuloRow[]
  totalAulas: number; totalModulos: number
  /** cards de TODOS os módulos (sem filtro/paginação) — p/ cabeçalho, irmãos e breadcrumb da visão interna */
  todos: ModuloCard[]
}

/**
 * Cards dos módulos com AGREGADOS (aulas, submódulos, materiais, liberação, rascunho). As aulas são lidas só nas colunas
 * leves e agregadas AQUI — o cliente recebe apenas os cards da página. `paiId` null = módulos de topo; senão, submódulos daquele pai.
 */
export async function moduloCardsProduto(tenantId: string, produtoId: string, o: {
  paiId?: string | null; q?: string; filtro?: FiltroModulos; material?: MaterialChave | 'todos'; ordem?: OrdemModulos; page?: number; pp?: number
}): Promise<PaginaModulos> {
  const svc = createAdminClient()
  try {
    const [modulos, itens] = await Promise.all([
      listarModulosProduto(tenantId, produtoId),
      fetchAll<any>(() => svc.from('simulado_produto_modulo_itens')
        .select('id, modulo_id, tipo_ref, subtipo, titulo, situacao, disponibilidade')
        .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false)
        .order('id', { ascending: true }) as any, 1000, 'produto_itens_agg'),
    ])
    const agora = Date.now()
    type Agg = { aulas: number; materiais: Partial<Record<MaterialChave, number>>; programadas: number; proxData: number | null; rascunhos: number }
    const novoAgg = (): Agg => ({ aulas: 0, materiais: {}, programadas: 0, proxData: null, rascunhos: 0 })
    const direto = new Map<string, Agg>()
    for (const it of itens) {
      const a = direto.get(it.modulo_id) ?? novoAgg(); direto.set(it.modulo_id, a)
      a.aulas++
      const mat = materialDoItem(it.subtipo, (it.tipo_ref ?? 'link') as TipoRef, String(it.titulo ?? ''))
      a.materiais[mat] = (a.materiais[mat] ?? 0) + 1
      if (it.situacao === 'rascunho') a.rascunhos++
      const d = normDisponibilidade(it.disponibilidade)
      if (d.tipo !== 'na_matricula') {
        const t = d.data ? Date.parse(d.data) : NaN
        const liberada = d.tipo === 'data' && Number.isFinite(t) && t <= agora
        if (!liberada) a.programadas++
        if ((d.tipo === 'data' || d.tipo === 'data_e_intervalo') && Number.isFinite(t) && t > agora) a.proxData = a.proxData === null ? t : Math.min(a.proxData, t)
      }
    }
    const filhos = new Map<string, string[]>()
    for (const m of modulos) if (m.pai_id) { const arr = filhos.get(m.pai_id) ?? []; arr.push(m.id); filhos.set(m.pai_id, arr) }
    const rollup = (id: string): Agg => {
      const d = direto.get(id)
      const r: Agg = d ? { ...d, materiais: { ...d.materiais } } : novoAgg()
      for (const f of filhos.get(id) ?? []) {
        const c = rollup(f); r.aulas += c.aulas; r.programadas += c.programadas; r.rascunhos += c.rascunhos
        for (const [k, v] of Object.entries(c.materiais)) r.materiais[k as MaterialChave] = (r.materiais[k as MaterialChave] ?? 0) + (v ?? 0)
        if (c.proxData !== null) r.proxData = r.proxData === null ? c.proxData : Math.min(r.proxData, c.proxData)
      }
      return r
    }
    const todos: ModuloCard[] = modulos.map((m) => {
      const ag = rollup(m.id)
      return {
        id: m.id, pai_id: m.pai_id, titulo: m.titulo, imagem_url: m.imagem_url, ocultar_titulo: !!m.ocultar_titulo, descricao: m.descricao, ordem: m.ordem,
        aulas: ag.aulas, aulasDiretas: direto.get(m.id)?.aulas ?? 0, submodulos: (filhos.get(m.id) ?? []).length,
        materiais: ag.materiais, programadas: ag.programadas, proxData: ag.proxData !== null ? new Date(ag.proxData).toISOString() : null, rascunhos: ag.rascunhos,
      }
    })
    let cards = todos.filter((c) => (c.pai_id ?? null) === (o.paiId ?? null))
    const q = termo(o.q).toLowerCase()
    if (q) cards = cards.filter((c) => c.titulo.toLowerCase().includes(q))
    if (o.filtro === 'com_sub') cards = cards.filter((c) => c.submodulos > 0)
    else if (o.filtro === 'programadas') cards = cards.filter((c) => c.programadas > 0)
    else if (o.filtro === 'rascunho') cards = cards.filter((c) => c.rascunhos > 0)
    if (o.material && o.material !== 'todos') cards = cards.filter((c) => (c.materiais[o.material as MaterialChave] ?? 0) > 0)
    const ordem = o.ordem ?? 'ordem'
    const porOrdem = (a: ModuloCard, b: ModuloCard) => a.ordem - b.ordem || a.id.localeCompare(b.id)
    const nm = (a: ModuloCard, b: ModuloCard) => a.titulo.localeCompare(b.titulo, 'pt-BR', { numeric: true })
    const cmp: Record<string, (a: ModuloCard, b: ModuloCard) => number> = {
      nome: nm, nome_desc: (a, b) => nm(b, a),
      aulas: (a, b) => b.aulas - a.aulas || porOrdem(a, b), aulas_asc: (a, b) => a.aulas - b.aulas || porOrdem(a, b),
      sub: (a, b) => b.submodulos - a.submodulos || porOrdem(a, b), sub_asc: (a, b) => a.submodulos - b.submodulos || porOrdem(a, b),
      rascunhos: (a, b) => b.rascunhos - a.rascunhos || porOrdem(a, b), rascunhos_asc: (a, b) => a.rascunhos - b.rascunhos || porOrdem(a, b),
    }
    cards.sort(cmp[ordem] ?? porOrdem)
    const pp = Math.min(60, Math.max(1, Math.floor(o.pp ?? 12)))
    const total = cards.length
    const page = Math.min(Math.max(1, Math.floor(o.page ?? 1)), Math.max(1, Math.ceil(total / pp)))
    return { cards: cards.slice((page - 1) * pp, page * pp), total, page, modulos, totalAulas: itens.length, totalModulos: modulos.length, todos }
  } catch { return { cards: [], total: 0, page: 1, modulos: [], totalAulas: 0, totalModulos: 0, todos: [] } }
}

export interface PaginaAulas {
  itens: ItemRow[]; total: number; page: number
  /** ids de TODAS as aulas do filtro (p/ "selecionar todas do módulo") — limitado ao módulo */
  ids: string[]
  materiais: Partial<Record<MaterialChave, number>>
}

/** Aulas DIRETAS de um módulo (busca por título no banco, filtro de material, paginado). Só o módulo aberto é carregado. */
export async function aulasDoModulo(tenantId: string, produtoId: string, moduloId: string, o: { q?: string; material?: MaterialChave | 'todos'; page?: number; pp?: number }): Promise<PaginaAulas> {
  const svc = createAdminClient()
  const q = termo(o.q)
  try {
    const rows = await fetchAll<any>(() => {
      let iq = svc.from('simulado_produto_modulo_itens').select(COLS_ITEM)
        .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('modulo_id', moduloId).eq('deletado', false)
      if (q) iq = iq.ilike('titulo', `%${q}%`)
      return iq.order('ordem', { ascending: true }).order('id', { ascending: true }) as any
    }, 1000, 'produto_itens_modulo')
    let itens = rows.map(rowItem)
    const materiais: Partial<Record<MaterialChave, number>> = {}
    for (const it of itens) { const m = materialDoItem(it.subtipo, it.tipo_ref, it.titulo); materiais[m] = (materiais[m] ?? 0) + 1 }
    if (o.material && o.material !== 'todos') itens = itens.filter((it) => materialDoItem(it.subtipo, it.tipo_ref, it.titulo) === o.material)
    const pp = Math.min(100, Math.max(1, Math.floor(o.pp ?? 25)))
    const total = itens.length
    const page = Math.min(Math.max(1, Math.floor(o.page ?? 1)), Math.max(1, Math.ceil(total / pp)))
    return { itens: itens.slice((page - 1) * pp, page * pp), total, page, ids: itens.map((i) => i.id), materiais }
  } catch { return { itens: [], total: 0, page: 1, ids: [], materiais: {} } }
}

/** Busca global de aulas do produto (ilike + count + .range) — resultados limitados; o cliente agrupa pelo módulo de origem. */
export async function buscarAulasProduto(tenantId: string, produtoId: string, q: string, limite = 60): Promise<{ itens: ItemRow[]; total: number }> {
  const svc = createAdminClient()
  const t = termo(q); if (!t) return { itens: [], total: 0 }
  try {
    const { data, count } = await svc.from('simulado_produto_modulo_itens').select(COLS_ITEM, { count: 'exact' })
      .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false).ilike('titulo', `%${t}%`)
      .order('modulo_id', { ascending: true }).order('ordem', { ascending: true }).order('id', { ascending: true }).range(0, limite - 1)
    return { itens: ((data ?? []) as any[]).map(rowItem), total: count ?? 0 }
  } catch { return { itens: [], total: 0 } }
}

function termo(q: string | undefined | null) { return (q ?? '').trim().replace(/[%,()]/g, ' ').trim() }

// ── Instrutores ──
export interface InstrutorRow { id: string; user_id: string | null; nome: string | null; email: string | null }
export async function listarInstrutores(tenantId: string, produtoId: string): Promise<InstrutorRow[]> {
  const svc = createAdminClient()
  try {
    const { data } = await svc.from('simulado_produto_instrutores')
      .select('id, user_id, nome, email').eq('tenant_id', tenantId).eq('produto_id', produtoId)
      .order('ordem', { ascending: true }).order('criado_em', { ascending: true })
    return (data ?? []) as InstrutorRow[]
  } catch { return [] }
}

// ── Resumo (RESUMO rail do designer) — 4 COUNTs no banco (head), sem carregar o currículo ──
export interface ResumoProduto { modulos: number; submodulos: number; conteudos: number; grupos: number }
export async function resumoProduto(tenantId: string, produtoId: string): Promise<ResumoProduto> {
  const svc = createAdminClient()
  const cnt = async (tabela: string, f: (q: any) => any): Promise<number> => {
    try {
      const { count } = await f(svc.from(tabela).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('produto_id', produtoId))
      return count ?? 0
    } catch { return 0 }
  }
  const [modulos, submodulos, conteudos, grupos] = await Promise.all([
    cnt('simulado_produto_modulos', (q) => q.eq('deletado', false).is('pai_id', null)),
    cnt('simulado_produto_modulos', (q) => q.eq('deletado', false).not('pai_id', 'is', null)),
    cnt('simulado_produto_modulo_itens', (q) => q.eq('deletado', false)),
    cnt('simulado_produto_itens', (q) => q.eq('tipo_item', 'grupo')),
  ])
  return { modulos, submodulos, conteudos, grupos }
}

// ═════════ Lazy / busca server-side (Vitrine, Grupos, seletor de simulado) ═════════
export type RecursoTipo = 'simulado' | 'pasta' | 'cronograma' | 'grupo'
export interface RecursoBusca { id: string; nome: string; area?: string | null }
export interface PaginaRecursos { rows: RecursoBusca[]; total: number }

const CFG_RECURSO: Record<RecursoTipo, { tabela: string; col: string; sel: string }> = {
  simulado: { tabela: 'simulado_simulados', col: 'titulo', sel: 'id, titulo' },
  pasta: { tabela: 'simulado_pastas', col: 'nome', sel: 'id, nome, folder_area' },
  cronograma: { tabela: 'simulado_cronogramas', col: 'nome', sel: 'id, nome' },
  grupo: { tabela: 'simulado_grupos', col: 'nome', sel: 'id, nome' },
}

/** Busca paginada de candidatos (ilike + .range + count) — substitui o "listão" de ~1700 linhas. */
export async function buscarRecursos(
  tenantId: string, tipo: RecursoTipo, q: string, page = 1, perPage = 20, soIds?: string[],
): Promise<PaginaRecursos> {
  if (soIds && soIds.length === 0) return { rows: [], total: 0 }
  const svc = createAdminClient()
  const t = termo(q)
  const cfg = CFG_RECURSO[tipo]
  const from = (Math.max(1, page) - 1) * perPage
  try {
    let qq = svc.from(cfg.tabela).select(cfg.sel, { count: 'exact' }).eq('tenant_id', tenantId).eq('deletado', false)
    if (t) qq = qq.ilike(cfg.col, `%${t}%`)
    if (soIds) qq = qq.in('id', soIds.slice(0, 200))
    const { data, count, error } = await qq.order(cfg.col, { ascending: true }).order('id', { ascending: true }).range(from, from + perPage - 1)
    if (error) return { rows: [], total: 0 }
    return {
      rows: ((data ?? []) as any[]).map((r) => ({ id: r.id, nome: r[cfg.col] ?? '—', area: r.folder_area ?? null })),
      total: count ?? 0,
    }
  } catch { return { rows: [], total: 0 } }
}

/** Resolve nomes de ids já escolhidos (em lotes) — só os selecionados, nunca a lista inteira. */
export async function nomesDeRecursos(tenantId: string, tipo: RecursoTipo, ids: string[]): Promise<Record<string, RecursoBusca>> {
  const out: Record<string, RecursoBusca> = {}
  const uniq = [...new Set(ids.filter(Boolean))]
  if (!uniq.length) return out
  const svc = createAdminClient()
  const cfg = CFG_RECURSO[tipo]
  try {
    const rows = await fetchAllByIn<any>(uniq, (chunk) =>
      svc.from(cfg.tabela).select(cfg.sel).eq('tenant_id', tenantId).in('id', chunk).order('id', { ascending: true }) as any)
    for (const r of rows) out[r.id] = { id: r.id, nome: r[cfg.col] ?? '—', area: r.folder_area ?? null }
  } catch { /* ignora */ }
  return out
}

/** Grupos de acesso vinculados ao produto (ids + nomes): só os do produto, não todos os grupos do tenant. */
export async function gruposDoProduto(tenantId: string, produtoId: string): Promise<{ id: string; nome: string; membros: number | null }[]> {
  const svc = createAdminClient()
  try {
    const vinc = await fetchAll<any>(() => svc.from('simulado_produto_itens').select('item_id')
      .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('tipo_item', 'grupo').order('item_id', { ascending: true }) as any, 1000, 'produto_grupos')
    const ids = vinc.map((r) => r.item_id as string)
    const agora = new Date().toISOString()
    const [nomes, contagens] = await Promise.all([
      nomesDeRecursos(tenantId, 'grupo', ids),
      // Membros com participação válida (sem prazo ou não vencida) = quem recebe o produto pelo grupo.
      Promise.all(ids.map(async (id) => {
        const { count, error } = await svc.from('simulado_grupo_membros').select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).eq('grupo_id', id).or(`expira_em.is.null,expira_em.gt.${agora}`)
        return error ? null : (count ?? 0)
      })),
    ])
    return ids.map((id, i) => ({ id, nome: nomes[id]?.nome ?? '(grupo removido)', membros: contagens[i] }))
  } catch { return [] }
}

// ═════════ Carga INICIAL leve do editor de Produto (só a aba Informações + cabeçalho) ═════════
export interface ProdutoEditorLeve {
  produto: ProdutoLeve
  criadoEm: string | null
  atualizadoEm: string | null
  pastaId: string | null
  mesmoNome: { id: string; nome: string }[]
}

const PROD_COLS = 'id, nome, slug, tipo, descricao, tier, validade_tipo, validade_dias, validade_data, ativo, cor, cor_secundaria, tema, logo_url, capa_url, banner_url, banner_mobile_url, gamificacao, ordem'

/** 1 linha do produto (+datas/pasta) + vitrine + homônimos, em paralelo. Sem fontes/itens/membros/currículo. */
export async function getProdutoEditorLeve(tenantId: string, id: string): Promise<ProdutoEditorLeve | null> {
  const svc = createAdminClient()
  // `acesso_bloqueado` (migr 20261104120000) entra no SELECT principal; sem a coluna o fallback (PROD_COLS)
  // responde e o campo cai em false — editor abre normal antes da migração.
  let r: any = await svc.from('simulado_produtos').select(`${PROD_COLS}, criado_em, atualizado_em, pasta_id, acesso_bloqueado`).eq('tenant_id', tenantId).eq('id', id).maybeSingle()
  if (r.error) r = await svc.from('simulado_produtos').select(PROD_COLS).eq('tenant_id', tenantId).eq('id', id).maybeSingle() // colunas novas ausentes
  const p = r.data as any
  if (!p) return null
  const [secoes, homonimos] = await Promise.all([
    svc.from('simulado_produto_secoes').select('id, produto_id, ordem, tipo, nome, tamanho, ordenacao, config, ativo')
      .eq('tenant_id', tenantId).eq('produto_id', id).order('ordem', { ascending: true }).limit(200),
    svc.from('simulado_produtos').select('id, nome').eq('tenant_id', tenantId).eq('nome', p.nome).neq('id', id).limit(20),
  ])
  const { criado_em, atualizado_em, pasta_id, ...resto } = p
  // Formato de exibição do conteúdo: coluna nova (migração 20261104000000). Leitura TOLERANTE — sem
  // a coluna cai em 'netflix' (não quebra o editor antes da migração).
  let vitrineLayout: Produto['vitrine_layout'] = 'netflix'
  try {
    const vl: any = await svc.from('simulado_produtos').select('vitrine_layout').eq('tenant_id', tenantId).eq('id', id).maybeSingle()
    if (!vl.error && vl.data?.vitrine_layout) vitrineLayout = vl.data.vitrine_layout
  } catch { /* coluna ausente → netflix */ }
  // Formato da página do módulo (migr 20261113070000) — leitura tolerante.
  let moduloLayout: Produto['modulo_layout'] = 'cards_lista'
  try {
    const ml: any = await svc.from('simulado_produtos').select('modulo_layout').eq('tenant_id', tenantId).eq('id', id).maybeSingle()
    if (!ml.error && ehModuloLayout(ml.data?.modulo_layout)) moduloLayout = ml.data.modulo_layout
  } catch { /* coluna ausente → cards_lista */ }
  return {
    produto: { ...(resto as Produto), vitrine_layout: vitrineLayout, modulo_layout: moduloLayout, acesso_bloqueado: !!(resto as any).acesso_bloqueado, secoes: ((secoes.data ?? []) as ProdutoSecao[]) },
    criadoEm: criado_em ?? null, atualizadoEm: atualizado_em ?? null, pastaId: pasta_id ?? null,
    mesmoNome: ((homonimos.data ?? []) as { id: string; nome: string }[]),
  }
}

/** Breadcrumb subindo pelos pai_id (1 SELECT por nível, profundidade ≤ 12) — sem carregar a árvore inteira. */
export async function breadcrumbDaPasta(tenantId: string, pastaId: string | null): Promise<PastaProdutoFlat[]> {
  const svc = createAdminClient()
  const chain: PastaProdutoFlat[] = []
  const visto = new Set<string>()
  let cur = pastaId
  try {
    while (cur && !visto.has(cur) && chain.length < 12) {
      visto.add(cur)
      const { data } = await svc.from('simulado_pastas').select('id, nome, pai_id, cor').eq('tenant_id', tenantId).eq('id', cur).maybeSingle()
      if (!data) break
      const d = data as any
      chain.unshift({ id: d.id, nome: d.nome, pai_id: d.pai_id ?? null, cor: d.cor ?? null })
      cur = d.pai_id ?? null
    }
  } catch { /* ignora */ }
  return chain
}
