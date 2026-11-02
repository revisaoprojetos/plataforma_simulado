import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// TRILHAS (learning path) do Estúdio — camada de dados (I/O). É NOVO (ver docs/estudio-conteudo-implementacao.md
// §2.8, Etapa 4). "trilha" em lib/leitura/trilha.ts / lib/aluno/trilhas.ts / lib/cronograma é OUTRA coisa.
// Uma trilha aqui = sequência ordenada de PRODUTOS (cursos/extensivos) com liberação relativa à matrícula.
// O service client (createAdminClient) e o tenantId vêm do chamador. Migração: 20261031051000_trilhas.sql.

const T_TRILHA = 'simulado_trilhas'
const T_ITEM = 'simulado_trilha_itens'
const T_PRODUTO = 'simulado_produtos'

export const SCHEMA_AUSENTE = /relation .* does not exist|could not find the table|schema cache|does not exist|column .* does not exist/i

export type Visibilidade = 'publica' | 'privada' | 'nao_listada'
export type OrdemModo = 'manual' | 'data'

export interface Trilha {
  id: string
  codigo: number | null
  nome: string
  slug: string | null
  descricao: string | null
  visibilidade: Visibilidade
  trilha_anterior_id: string | null
  bloquear_ordem: boolean
  bloquear_acesso_anterior: boolean
  ordem_modo: OrdemModo
  banner_url: string | null
  banner_tipo: string | null
  conquista_url: string | null
  criado_em: string
}
export interface TrilhaLista extends Trilha { itens: number }
export interface TrilhaItem {
  id: string
  produto_id: string
  ordem: number
  liberacao_offset_dias: number | null
  produto_nome: string
  produto_cor: string | null
}
export interface TrilhaDetalhe extends Trilha {
  itensLista: TrilhaItem[]
  anteriorNome: string | null
}
export interface ProdutoOpcao { id: string; nome: string; tipo: string | null; cor: string | null; pasta_nome: string | null }

const T_COLS = 'id, codigo, nome, slug, descricao, visibilidade, trilha_anterior_id, bloquear_ordem, bloquear_acesso_anterior, ordem_modo, banner_url, banner_tipo, conquista_url, criado_em'

// ───────────────────────────── Lista paginada (server-driven) ─────────────────────────────
/** Conta itens (produtos) por trilha, em chunks (listas grandes de ids). */
async function contarItens(svc: SupabaseClient, tenantId: string, ids: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>()
  for (let i = 0; i < ids.length; i += 80) {
    const { data } = await svc.from(T_ITEM).select('trilha_id').eq('tenant_id', tenantId).in('trilha_id', ids.slice(i, i + 80))
    for (const r of (data ?? []) as any[]) m.set(r.trilha_id, (m.get(r.trilha_id) ?? 0) + 1)
  }
  return m
}

export async function listarTrilhas(
  svc: SupabaseClient, tenantId: string,
  opts: { q?: string; sort?: string; dir?: 'asc' | 'desc'; page?: number; perPage?: number } = {},
): Promise<{ rows: TrilhaLista[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1)
  const perPage = Math.max(1, Math.min(50, opts.perPage ?? 5))
  const sortItens = opts.sort === 'itens'
  const sort = ['codigo', 'nome', 'visibilidade', 'criado_em'].includes(opts.sort ?? '') ? opts.sort! : 'codigo'
  const asc = opts.dir === 'asc'
  const q = (opts.q ?? '').trim()

  // Ordenar por "Cursos ativos": a contagem vive em outra tabela → ordena no servidor (ids → contagem → fatia).
  if (sortItens) {
    let all = svc.from(T_TRILHA).select('id', { count: 'exact' }).eq('tenant_id', tenantId).eq('deletado', false).order('id', { ascending: true }).limit(2000)
    if (q) all = all.ilike('nome', `%${q}%`)
    const { data: idsData, count, error: e1 } = await all
    if (e1) throw new Error(e1.message)
    const todos = ((idsData ?? []) as any[]).map((r) => r.id as string)
    const cont = await contarItens(svc, tenantId, todos)
    todos.sort((x, y) => ((cont.get(x) ?? 0) - (cont.get(y) ?? 0)) * (asc ? 1 : -1) || (x < y ? -1 : 1))
    const pageIds = todos.slice((page - 1) * perPage, page * perPage)
    if (!pageIds.length) return { rows: [], total: count ?? todos.length }
    const { data, error } = await svc.from(T_TRILHA).select(T_COLS).eq('tenant_id', tenantId).in('id', pageIds)
    if (error) throw new Error(error.message)
    const byId = new Map(((data ?? []) as Trilha[]).map((t) => [t.id, t]))
    const rows = pageIds.map((id) => byId.get(id)).filter(Boolean).map((t) => ({ ...(t as Trilha), itens: cont.get((t as Trilha).id) ?? 0 }))
    return { rows, total: count ?? todos.length }
  }

  let query = svc.from(T_TRILHA).select(T_COLS, { count: 'exact' })
    .eq('tenant_id', tenantId).eq('deletado', false)
    .order(sort, { ascending: asc }).order('id', { ascending: true })
    .range((page - 1) * perPage, page * perPage - 1)
  if (q) query = query.ilike('nome', `%${q}%`)
  const { data, count, error } = await query
  if (error) throw new Error(error.message)
  const trilhas = (data ?? []) as Trilha[]
  const itensPorTrilha = trilhas.length ? await contarItens(svc, tenantId, trilhas.map((t) => t.id)) : new Map<string, number>()
  return { rows: trilhas.map((t) => ({ ...t, itens: itensPorTrilha.get(t.id) ?? 0 })), total: count ?? 0 }
}

/** TODAS as trilhas que casam a busca/ordenação (sem paginação) — alimenta o export XLSX. */
export async function listarTrilhasParaExport(
  svc: SupabaseClient, tenantId: string, opts: { q?: string; sort?: string; dir?: 'asc' | 'desc' } = {},
): Promise<TrilhaLista[]> {
  const sortItens = opts.sort === 'itens'
  const sort = ['codigo', 'nome', 'visibilidade', 'criado_em'].includes(opts.sort ?? '') ? opts.sort! : 'codigo'
  const asc = opts.dir === 'asc'
  let query = svc.from(T_TRILHA).select(T_COLS).eq('tenant_id', tenantId).eq('deletado', false)
    .order(sortItens ? 'codigo' : sort, { ascending: sortItens ? false : asc }).order('id', { ascending: true }).limit(5000)
  const q = (opts.q ?? '').trim()
  if (q) query = query.ilike('nome', `%${q}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const trilhas = (data ?? []) as Trilha[]
  const cont = await contarItens(svc, tenantId, trilhas.map((t) => t.id))
  const rows = trilhas.map((t) => ({ ...t, itens: cont.get(t.id) ?? 0 }))
  if (sortItens) rows.sort((x, y) => (x.itens - y.itens) * (asc ? 1 : -1))
  return rows
}

/** Trilha + itens (com nome do produto) + nome da trilha anterior. null se não existe no tenant. */
export async function getTrilha(svc: SupabaseClient, tenantId: string, id: string): Promise<TrilhaDetalhe | null> {
  const { data: t, error } = await svc.from(T_TRILHA).select(T_COLS).eq('tenant_id', tenantId).eq('id', id).eq('deletado', false).maybeSingle()
  if (error) throw new Error(error.message)
  if (!t) return null
  const itensLista = await listarItensTrilha(svc, tenantId, id)
  let anteriorNome: string | null = null
  if ((t as Trilha).trilha_anterior_id) {
    const { data: ant } = await svc.from(T_TRILHA).select('nome').eq('tenant_id', tenantId).eq('id', (t as Trilha).trilha_anterior_id).maybeSingle()
    anteriorNome = (ant?.nome as string | undefined) ?? null
  }
  return { ...(t as Trilha), itensLista, anteriorNome }
}

export async function listarItensTrilha(svc: SupabaseClient, tenantId: string, trilhaId: string): Promise<TrilhaItem[]> {
  const { data: itens } = await svc.from(T_ITEM).select('id, produto_id, ordem, liberacao_offset_dias')
    .eq('tenant_id', tenantId).eq('trilha_id', trilhaId).order('ordem', { ascending: true }).order('id', { ascending: true })
  const lista = (itens ?? []) as any[]
  const prodIds = [...new Set(lista.map((i) => i.produto_id).filter(Boolean))]
  const nomes = new Map<string, string>()
  const cores = new Map<string, string | null>()
  if (prodIds.length) {
    let pr: any = await svc.from(T_PRODUTO).select('id, nome, cor').eq('tenant_id', tenantId).in('id', prodIds)
    if (pr.error) pr = await svc.from(T_PRODUTO).select('id, nome').eq('tenant_id', tenantId).in('id', prodIds)
    for (const p of (pr.data ?? []) as any[]) { nomes.set(p.id, p.nome); cores.set(p.id, p.cor ?? null) }
  }
  return lista.map((i) => ({ id: i.id, produto_id: i.produto_id, ordem: i.ordem ?? 0, liberacao_offset_dias: i.liberacao_offset_dias ?? null, produto_nome: nomes.get(i.produto_id) ?? '(produto removido)', produto_cor: cores.get(i.produto_id) ?? null }))
}

/** Produtos do tenant para o seletor "Adicionar conteúdo" (com cor e pasta reais). */
export async function listarProdutosParaTrilha(svc: SupabaseClient, tenantId: string): Promise<ProdutoOpcao[]> {
  let res: any = await svc.from(T_PRODUTO).select('id, nome, tipo, cor, pasta_id').eq('tenant_id', tenantId).order('nome', { ascending: true }).limit(1000)
  if (res.error) res = await svc.from(T_PRODUTO).select('id, nome, tipo').eq('tenant_id', tenantId).order('nome', { ascending: true }).limit(1000)
  if (res.error) res = await svc.from(T_PRODUTO).select('id, nome').eq('tenant_id', tenantId).order('nome', { ascending: true }).limit(1000)
  const lista = (res.data ?? []) as any[]
  const pastaIds = [...new Set(lista.map((p) => p.pasta_id).filter(Boolean))] as string[]
  const pastas = new Map<string, string>()
  for (let i = 0; i < pastaIds.length; i += 80) {
    const { data } = await svc.from('simulado_pastas').select('id, nome').eq('tenant_id', tenantId).in('id', pastaIds.slice(i, i + 80))
    for (const p of (data ?? []) as any[]) pastas.set(p.id, p.nome)
  }
  return lista.map((p) => ({ id: p.id, nome: p.nome, tipo: p.tipo ?? null, cor: p.cor ?? null, pasta_nome: p.pasta_id ? (pastas.get(p.pasta_id) ?? null) : null }))
}

function gerarSlug(nome: string): string {
  const base = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return (base || 'trilha') + '-' + Math.random().toString(16).slice(2, 7)
}

export async function criarTrilha(
  svc: SupabaseClient,
  input: { tenantId: string; nome: string; descricao?: string | null; visibilidade?: Visibilidade; criadoPor?: string | null },
): Promise<{ id: string } | { erro: string }> {
  const nome = (input.nome ?? '').trim()
  if (!input.tenantId) return { erro: 'tenant obrigatório' }
  if (!nome) return { erro: 'Informe o nome da trilha.' }
  const { data, error } = await svc.from(T_TRILHA).insert({
    tenant_id: input.tenantId, nome, slug: gerarSlug(nome), descricao: input.descricao?.trim() || null,
    visibilidade: input.visibilidade ?? 'publica', criado_por: input.criadoPor ?? null,
  }).select('id').single()
  if (error || !data) return { erro: error?.message || 'falha ao criar' }
  return { id: data.id }
}

/** Atualiza a trilha — tolerante a colunas ausentes (dropa a coluna que a base migrada não tiver). */
export async function atualizarTrilha(
  svc: SupabaseClient, tenantId: string, id: string,
  patch: Partial<Pick<Trilha, 'nome' | 'descricao' | 'visibilidade' | 'trilha_anterior_id' | 'bloquear_ordem' | 'bloquear_acesso_anterior' | 'ordem_modo' | 'banner_url' | 'banner_tipo' | 'conquista_url'>> & { regerarSlug?: boolean },
): Promise<{ ok: boolean; erro?: string }> {
  const upd: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if (patch.nome != null) { const n = patch.nome.trim(); if (!n) return { ok: false, erro: 'Informe o nome da trilha.' }; upd.nome = n; if (patch.regerarSlug) upd.slug = gerarSlug(n) }
  if (patch.descricao !== undefined) upd.descricao = patch.descricao?.trim() || null
  if (patch.visibilidade != null) upd.visibilidade = patch.visibilidade
  if (patch.trilha_anterior_id !== undefined) upd.trilha_anterior_id = patch.trilha_anterior_id || null
  if (patch.bloquear_ordem != null) upd.bloquear_ordem = patch.bloquear_ordem
  if (patch.bloquear_acesso_anterior != null) upd.bloquear_acesso_anterior = patch.bloquear_acesso_anterior
  if (patch.ordem_modo != null) upd.ordem_modo = patch.ordem_modo
  if (patch.banner_url !== undefined) upd.banner_url = patch.banner_url || null
  if (patch.banner_tipo != null) upd.banner_tipo = patch.banner_tipo
  if (patch.conquista_url !== undefined) upd.conquista_url = patch.conquista_url || null
  // Tenta e dropa a coluna faltante (base migrada pode não ter todas).
  for (let t = 0; t < 12 && Object.keys(upd).length > 1; t++) {
    const { error } = await svc.from(T_TRILHA).update(upd).eq('tenant_id', tenantId).eq('id', id)
    if (!error) return { ok: true }
    const m = /column "?([a-z_]+)"? .* does not exist|could not find the '([a-z_]+)' column/i.exec(error.message)
    const col = m?.[1] || m?.[2]
    if (col && col in upd) { delete upd[col]; continue }
    return { ok: false, erro: error.message }
  }
  return { ok: true }
}

/** Soft delete (Lixeira). simulado_trilhas tem deletado/deletado_em/deletado_por. */
export async function excluirTrilha(svc: SupabaseClient, tenantId: string, id: string, deletadoPor?: string | null): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await svc.from(T_TRILHA).update({ deletado: true, deletado_em: new Date().toISOString(), deletado_por: deletadoPor ?? null }).eq('tenant_id', tenantId).eq('id', id)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

export async function duplicarTrilha(svc: SupabaseClient, tenantId: string, id: string, criadoPor?: string | null): Promise<{ id: string } | { erro: string }> {
  const origem = await getTrilha(svc, tenantId, id)
  if (!origem) return { erro: 'Trilha não encontrada.' }
  const novo = await criarTrilha(svc, { tenantId, nome: `${origem.nome} (cópia)`, descricao: origem.descricao, visibilidade: origem.visibilidade, criadoPor })
  if ('erro' in novo) return novo
  await atualizarTrilha(svc, tenantId, novo.id, {
    bloquear_ordem: origem.bloquear_ordem, bloquear_acesso_anterior: origem.bloquear_acesso_anterior,
    ordem_modo: origem.ordem_modo, banner_url: origem.banner_url, banner_tipo: origem.banner_tipo ?? 'imagem', conquista_url: origem.conquista_url,
  })
  if (origem.itensLista.length) {
    await salvarItensTrilha(svc, tenantId, novo.id, origem.itensLista.map((i) => ({ produto_id: i.produto_id, ordem: i.ordem, liberacao_offset_dias: i.liberacao_offset_dias })))
  }
  return { id: novo.id }
}

/** Substitui o conjunto de itens da trilha (produtos + ordem + liberação). */
export async function salvarItensTrilha(
  svc: SupabaseClient, tenantId: string, trilhaId: string,
  itens: { produto_id: string; ordem: number; liberacao_offset_dias: number | null }[],
): Promise<{ ok: boolean; erro?: string }> {
  await svc.from(T_ITEM).delete().eq('tenant_id', tenantId).eq('trilha_id', trilhaId)
  const seen = new Set<string>()
  const rows = itens.filter((i) => i.produto_id && !seen.has(i.produto_id) && (seen.add(i.produto_id), true)).map((i, idx) => ({
    tenant_id: tenantId, trilha_id: trilhaId, produto_id: i.produto_id, ordem: i.ordem ?? idx,
    liberacao_offset_dias: i.liberacao_offset_dias ?? null,
  }))
  if (rows.length) { const { error } = await svc.from(T_ITEM).insert(rows); if (error) return { ok: false, erro: error.message } }
  return { ok: true }
}
