'use server'

// TRILHAS (Estúdio de Conteúdo) — server actions com o padrão de segurança admin: checkPermission
// (trilhas:*) + service role + tenant/ator da SESSÃO. É NOVO (ver lib/trilhas/trilhas.ts). Tolerante à
// migração 20261031051000 ausente (mostra aviso em vez de quebrar). Toda escrita chama registrarAudit.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import {
  listarTrilhas, getTrilha, criarTrilha, atualizarTrilha, excluirTrilha, duplicarTrilha,
  salvarItensTrilha, listarProdutosParaTrilha, SCHEMA_AUSENTE,
  type TrilhaLista, type TrilhaDetalhe, type Visibilidade, type OrdemModo, type ProdutoOpcao,
} from '@/lib/trilhas/trilhas'

const T_TRILHA = 'simulado_trilhas'
const AVISO_MIGRACAO = 'As trilhas ficam disponíveis após aplicar a migração 20261031051000_trilhas.'

async function guard(acao: 'view' | 'create' | 'update') {
  const perm = acao === 'view' ? 'trilhas:view' : acao === 'create' ? 'trilhas:create' : 'trilhas:update'
  const access = await getCurrentAccess()
  const ok = access.isAdmin || access.permissions.includes(perm) || access.permissions.includes('trilhas:manage')
  if (!ok) return { ok: false as const, error: 'Sem permissão.' }
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido — recarregue a página.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

function erroDe(e: any, fallback: string): string {
  const msg = e?.message || e?.erro || ''
  return SCHEMA_AUSENTE.test(msg) ? AVISO_MIGRACAO : (msg || fallback)
}

// ───────────────────────────── Leitura ─────────────────────────────
export async function listarTrilhasAction(
  opts: { q?: string; sort?: string; dir?: 'asc' | 'desc'; page?: number; perPage?: number } = {},
): Promise<{ ok: boolean; error?: string; aviso?: string; rows: TrilhaLista[]; total: number }> {
  const g = await guard('view'); if (!g.ok) return { ok: false, error: g.error, rows: [], total: 0 }
  try {
    const { rows, total } = await listarTrilhas(createAdminClient(), g.tenantId, opts)
    return { ok: true, rows, total }
  } catch (e: any) {
    if (SCHEMA_AUSENTE.test(e?.message || '')) return { ok: true, rows: [], total: 0, aviso: AVISO_MIGRACAO }
    return { ok: false, error: e?.message || 'Falha ao listar trilhas.', rows: [], total: 0 }
  }
}

export async function getTrilhaAction(id: string): Promise<{ ok: boolean; error?: string; aviso?: string; trilha?: TrilhaDetalhe }> {
  const g = await guard('view'); if (!g.ok) return { ok: false, error: g.error }
  try {
    const trilha = await getTrilha(createAdminClient(), g.tenantId, id)
    if (!trilha) return { ok: false, error: 'Trilha não encontrada.' }
    return { ok: true, trilha }
  } catch (e: any) {
    if (SCHEMA_AUSENTE.test(e?.message || '')) return { ok: true, aviso: AVISO_MIGRACAO }
    return { ok: false, error: e?.message || 'Falha ao carregar a trilha.' }
  }
}

/** Produtos do tenant + outras trilhas (p/ "trilha anterior"). */
export async function listarOpcoesTrilhaAction(excluirId?: string): Promise<{ ok: boolean; produtos: ProdutoOpcao[]; trilhas: { id: string; nome: string }[] }> {
  const g = await guard('view'); if (!g.ok) return { ok: false, produtos: [], trilhas: [] }
  const svc = createAdminClient()
  let produtos: ProdutoOpcao[] = []
  try { produtos = await listarProdutosParaTrilha(svc, g.tenantId) } catch { produtos = [] }
  let trilhas: { id: string; nome: string }[] = []
  try {
    let q = svc.from(T_TRILHA).select('id, nome').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome')
    if (excluirId) q = q.neq('id', excluirId)
    const { data } = await q
    trilhas = ((data ?? []) as any[]).map((r) => ({ id: r.id, nome: r.nome }))
  } catch { trilhas = [] }
  return { ok: true, produtos, trilhas }
}

// ───────────────────────────── CRUD ─────────────────────────────
export async function criarTrilhaAction(input: { nome: string; descricao?: string | null; visibilidade?: Visibilidade }): Promise<{ ok: boolean; error?: string; id?: string }> {
  const g = await guard('create'); if (!g.ok) return g
  const r = await criarTrilha(createAdminClient(), { tenantId: g.tenantId, ...input, criadoPor: g.atorId })
  if ('erro' in r) return { ok: false, error: erroDe(r, 'Falha ao criar a trilha.') }
  await registrarAudit({ operacao: 'INSERT', entidade: T_TRILHA, entidadeId: r.id, depois: { nome: input.nome }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/conteudos/trilhas')
  return { ok: true, id: r.id }
}

type TrilhaPatch = {
  nome?: string; descricao?: string | null; visibilidade?: Visibilidade; trilha_anterior_id?: string | null
  bloquear_ordem?: boolean; bloquear_acesso_anterior?: boolean; ordem_modo?: OrdemModo
  banner_url?: string | null; banner_tipo?: string; conquista_url?: string | null; regerarSlug?: boolean
}
export async function atualizarTrilhaAction(id: string, patch: TrilhaPatch): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const r = await atualizarTrilha(createAdminClient(), g.tenantId, id, patch)
  if (!r.ok) return { ok: false, error: erroDe(r, 'Falha ao salvar a trilha.') }
  await registrarAudit({ operacao: 'UPDATE', entidade: T_TRILHA, entidadeId: id, depois: patch as Record<string, unknown>, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/conteudos/trilhas')
  return { ok: true }
}

export async function excluirTrilhaAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const r = await excluirTrilha(createAdminClient(), g.tenantId, id, g.atorId)
  if (!r.ok) return { ok: false, error: erroDe(r, 'Falha ao excluir.') }
  await registrarAudit({ operacao: 'DELETE', entidade: T_TRILHA, entidadeId: id, antes: { id }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/conteudos/trilhas')
  return { ok: true }
}

export async function excluirTrilhasLoteAction(ids: string[]): Promise<{ ok: boolean; error?: string; excluidos: number }> {
  const g = await guard('update'); if (!g.ok) return { ...g, excluidos: 0 }
  const svc = createAdminClient()
  let n = 0
  for (const id of [...new Set((ids ?? []).filter(Boolean))]) {
    const r = await excluirTrilha(svc, g.tenantId, id, g.atorId)
    if (r.ok) { n++; await registrarAudit({ operacao: 'DELETE', entidade: T_TRILHA, entidadeId: id, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {}) }
  }
  revalidatePath('/admin/conteudos/trilhas')
  return { ok: true, excluidos: n }
}

export async function duplicarTrilhaAction(id: string): Promise<{ ok: boolean; error?: string; id?: string }> {
  const g = await guard('create'); if (!g.ok) return g
  const r = await duplicarTrilha(createAdminClient(), g.tenantId, id, g.atorId)
  if ('erro' in r) return { ok: false, error: erroDe(r, 'Falha ao duplicar.') }
  await registrarAudit({ operacao: 'INSERT', entidade: T_TRILHA, entidadeId: r.id, depois: { duplicado_de: id }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/conteudos/trilhas')
  return { ok: true, id: r.id }
}

// ───────────────────────────── Itens (conteúdos da trilha) ─────────────────────────────
export async function salvarItensTrilhaAction(
  trilhaId: string,
  itens: { produto_id: string; ordem: number; liberacao_offset_dias: number | null }[],
  ordemModo?: OrdemModo,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const r = await salvarItensTrilha(svc, g.tenantId, trilhaId, itens)
  if (!r.ok) return { ok: false, error: erroDe(r, 'Falha ao salvar os conteúdos.') }
  if (ordemModo) await atualizarTrilha(svc, g.tenantId, trilhaId, { ordem_modo: ordemModo })
  await registrarAudit({ operacao: 'UPDATE', entidade: T_TRILHA, entidadeId: trilhaId, depois: { itens: itens.length, ordem_modo: ordemModo }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/conteudos/trilhas')
  return { ok: true }
}
