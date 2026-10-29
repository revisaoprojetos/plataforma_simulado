import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Novidade, NovidadeComLeitura, CategoriaNovidade } from './tipos'

// NOVIDADES — camada de dados (I/O). Changelog por tenant + estado "lida" por aluno. Tipos puros em ./tipos.
// Migração: supabase/migrations/20261028000000_novidades.sql. RLS por tenant_id.

export type { Novidade, NovidadeComLeitura, CategoriaNovidade, NovidadeKind } from './tipos'
export { CATEGORIAS, CAT_LABEL, CAT_KIND } from './tipos'

const T = 'simulado_novidades'
const T_L = 'simulado_novidade_leituras'
const SEL = 'id, categoria, titulo, descricao, destaque, cover_url, cta_label, cta_url, cta2_label, cta2_url, publicado_em'
const SEL_ADMIN = 'id, categoria, titulo, descricao, destaque, cover_url, cta_label, cta_url, cta2_label, cta2_url, publicado_em, ativo, criado_em'

// ───────────────────────────── Aluno ─────────────────────────────

/** Novidades ativas do tenant + se o aluno já leu cada uma (mais recentes primeiro). */
export async function listarNovidadesAluno(
  svc: SupabaseClient, tenantId: string, estudanteId: string,
): Promise<NovidadeComLeitura[]> {
  if (!tenantId) return []
  const rows = await fetchAll<Novidade>(() => svc.from(T).select(SEL)
    .eq('tenant_id', tenantId).eq('ativo', true)
    .order('publicado_em', { ascending: false }).order('id', { ascending: false }))
  const lista = rows ?? []
  const ids = lista.map((r) => r.id)
  const lidas = new Set<string>()
  if (estudanteId && ids.length) {
    const { data } = await svc.from(T_L).select('novidade_id')
      .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).in('novidade_id', ids)
    for (const r of (data ?? []) as { novidade_id: string }[]) lidas.add(r.novidade_id)
  }
  return lista.map((r) => ({ ...r, lida: lidas.has(r.id) }))
}

export async function marcarLida(
  svc: SupabaseClient, tenantId: string, estudanteId: string, novidadeId: string,
): Promise<{ ok: boolean; erro?: string }> {
  if (!tenantId || !estudanteId || !novidadeId) return { ok: false, erro: 'parâmetros inválidos' }
  const { error } = await svc.from(T_L).upsert(
    { tenant_id: tenantId, estudante_id: estudanteId, novidade_id: novidadeId, lida_em: new Date().toISOString() },
    { onConflict: 'estudante_id,novidade_id' },
  )
  return error ? { ok: false, erro: error.message } : { ok: true }
}

/** Marca TODAS as novidades ativas como lidas para o aluno (upsert em lote). */
export async function marcarTodasLidas(
  svc: SupabaseClient, tenantId: string, estudanteId: string,
): Promise<{ ok: boolean; erro?: string }> {
  if (!tenantId || !estudanteId) return { ok: false, erro: 'parâmetros inválidos' }
  const rows = await fetchAll<{ id: string }>(() => svc.from(T).select('id').eq('tenant_id', tenantId).eq('ativo', true).order('id', { ascending: true }))
  const ids = (rows ?? []).map((r) => r.id)
  if (!ids.length) return { ok: true }
  const agora = new Date().toISOString()
  const payload = ids.map((novidade_id) => ({ tenant_id: tenantId, estudante_id: estudanteId, novidade_id, lida_em: agora }))
  const { error } = await svc.from(T_L).upsert(payload, { onConflict: 'estudante_id,novidade_id' })
  return error ? { ok: false, erro: error.message } : { ok: true }
}

// ───────────────────────────── Admin ─────────────────────────────

export async function listarNovidadesAdmin(
  svc: SupabaseClient, tenantId: string,
): Promise<(Novidade & { ativo: boolean; criado_em: string })[]> {
  if (!tenantId) return []
  const rows = await fetchAll<Novidade & { ativo: boolean; criado_em: string }>(() => svc.from(T)
    .select(SEL_ADMIN).eq('tenant_id', tenantId)
    .order('publicado_em', { ascending: false }).order('id', { ascending: false }))
  return rows ?? []
}

export async function criarNovidade(
  svc: SupabaseClient,
  input: { tenantId: string; categoria: CategoriaNovidade; titulo: string; descricao?: string | null; destaque?: boolean; coverUrl?: string | null; ctaLabel?: string | null; ctaUrl?: string | null; cta2Label?: string | null; cta2Url?: string | null; publicadoEm?: string | null; criadoPor?: string | null },
): Promise<{ id: string } | { erro: string }> {
  const titulo = input.titulo?.trim()
  if (!input.tenantId) return { erro: 'tenant inválido' }
  if (!titulo) return { erro: 'título é obrigatório' }
  const { data, error } = await svc.from(T).insert({
    tenant_id: input.tenantId, categoria: input.categoria, titulo, descricao: input.descricao ?? null,
    destaque: !!input.destaque, cover_url: input.coverUrl ?? null,
    cta_label: input.ctaLabel ?? null, cta_url: input.ctaUrl ?? null,
    cta2_label: input.cta2Label ?? null, cta2_url: input.cta2Url ?? null,
    publicado_em: input.publicadoEm ?? new Date().toISOString(), criado_por: input.criadoPor ?? null,
  }).select('id').single()
  if (error || !data) return { erro: error?.message || 'falha ao criar' }
  return { id: data.id }
}

export async function atualizarNovidade(
  svc: SupabaseClient, tenantId: string, id: string,
  patch: Partial<{ categoria: CategoriaNovidade; titulo: string; descricao: string | null; destaque: boolean; coverUrl: string | null; ctaLabel: string | null; ctaUrl: string | null; cta2Label: string | null; cta2Url: string | null; publicadoEm: string; ativo: boolean }>,
): Promise<{ ok: boolean; erro?: string }> {
  if (!tenantId || !id) return { ok: false, erro: 'parâmetros inválidos' }
  const upd: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if (patch.categoria != null) upd.categoria = patch.categoria
  if (patch.titulo != null) upd.titulo = patch.titulo.trim()
  if (patch.descricao !== undefined) upd.descricao = patch.descricao
  if (patch.destaque != null) upd.destaque = patch.destaque
  if (patch.coverUrl !== undefined) upd.cover_url = patch.coverUrl
  if (patch.ctaLabel !== undefined) upd.cta_label = patch.ctaLabel
  if (patch.ctaUrl !== undefined) upd.cta_url = patch.ctaUrl
  if (patch.cta2Label !== undefined) upd.cta2_label = patch.cta2Label
  if (patch.cta2Url !== undefined) upd.cta2_url = patch.cta2Url
  if (patch.publicadoEm != null) upd.publicado_em = patch.publicadoEm
  if (patch.ativo != null) upd.ativo = patch.ativo
  const { error } = await svc.from(T).update(upd).eq('tenant_id', tenantId).eq('id', id)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

export async function removerNovidade(
  svc: SupabaseClient, tenantId: string, id: string,
): Promise<{ ok: boolean; erro?: string }> {
  if (!tenantId || !id) return { ok: false, erro: 'parâmetros inválidos' }
  const { error } = await svc.from(T).delete().eq('tenant_id', tenantId).eq('id', id)
  return error ? { ok: false, erro: error.message } : { ok: true }
}
