'use server'

// Biblioteca do Desafio: blocos HTML (Conteúdos) + Tags (selos), em PASTAS/SUBPASTAS. Espelha o padrão
// dos modelos-caderno: pastas reusam simulado_pastas (folder_area), itens em simulado_biblioteca_itens.
// Global por tenant. App via service role (createAdminClient); permissão 'leitura:view'.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { softDelete } from '@/lib/soft-delete'
import { hospedarBase64 } from '@/lib/storage/hospedar-base64'
import { SELOS } from '@/lib/leitura/selos'

const TABELA = 'simulado_biblioteca_itens'
export type Tipo = 'conteudo' | 'tag'
const AREA: Record<Tipo, string> = { conteudo: 'biblioteca', tag: 'biblioteca_tag' }

export type BibItem = { id: string; tipo: string; nome: string; descricao: string | null; html: string; slug: string | null; pasta_id: string | null; atualizado_em: string | null }
export type BibPasta = { id: string; nome: string; pai_id: string | null; cor: string | null }

async function guard() {
  if (!(await checkPermission('leitura:view'))) return { ok: false as const, error: 'Sem permissão.' }
  const a = await getCurrentAccess()
  if (!a.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: a.tenantId, atorId: a.userId ?? null }
}

/** Carrega itens + pastas de um tipo (conteudo|tag). */
export async function carregarBiblioteca(tipo: Tipo): Promise<{ ok: boolean; itens: BibItem[]; pastas: BibPasta[]; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, itens: [], pastas: [], error: g.error }
  try {
    const svc = (createAdminClient() as any)
    const itens = await fetchAll<BibItem>(() => svc
      .from(TABELA)
      .select('id, tipo, nome, descricao, html, slug, pasta_id, atualizado_em')
      .eq('tenant_id', g.tenantId).eq('tipo', tipo).eq('deletado', false).order('nome', { ascending: true }))
    const pastasAll = await fetchAll<BibPasta & { is_folder?: boolean; folder_area?: string }>(() => svc
      .from('simulado_pastas')
      .select('id, nome, pai_id, cor, is_folder, folder_area')
      .eq('tenant_id', g.tenantId).eq('deletado', false).order('nome', { ascending: true }))
    const pastas = pastasAll.filter((p) => p.is_folder && p.folder_area === AREA[tipo]).map((p) => ({ id: p.id, nome: p.nome, pai_id: p.pai_id, cor: p.cor }))
    return { ok: true, itens, pastas }
  } catch {
    return { ok: false, itens: [], pastas: [], error: 'Biblioteca não migrada (rode a migração 20261012000000).' }
  }
}

/** Cria OU atualiza um item (bloco de conteúdo ou tag). */
export async function salvarItem(tipo: Tipo, patch: { id?: string; nome: string; descricao?: string; html: string; slug?: string; pastaId?: string | null }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = (createAdminClient() as any)
  const nome = (patch.nome ?? '').trim() || 'Sem nome'
  const base = { nome, descricao: (patch.descricao ?? '').trim() || null, html: patch.html ?? '', slug: (patch.slug ?? '').trim() || null, atualizado_em: new Date().toISOString() }
  if (patch.id) {
    const { error } = await svc.from(TABELA).update(base).eq('id', patch.id).eq('tenant_id', g.tenantId)
    if (error) return { ok: false, error: error.message }
    await registrarAudit({ operacao: 'UPDATE', entidade: TABELA, entidadeId: patch.id, depois: { nome } })
    revalidatePath('/admin/leitura/biblioteca')
    return { ok: true, id: patch.id }
  }
  const { data, error } = await svc.from(TABELA).insert({ ...base, tenant_id: g.tenantId, tipo, pasta_id: patch.pastaId ?? null, criado_por: g.atorId }).select('id').single()
  if (error || !data) return { ok: false, error: error?.message ?? 'Erro ao criar item.' }
  await registrarAudit({ operacao: 'INSERT', entidade: TABELA, entidadeId: data.id, depois: { nome, tipo } })
  revalidatePath('/admin/leitura/biblioteca')
  return { ok: true, id: data.id }
}

/** Sobe uma imagem (data URL base64) para o storage e devolve a URL pública — usada no editor do item. */
export async function uploadImagemBib(dataUrl: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const v = (dataUrl ?? '').trim()
  if (!v.startsWith('data:image')) return { ok: false, error: 'Envie um arquivo de imagem.' }
  try {
    const url = await hospedarBase64(v, createAdminClient() as any, { tenantId: g.tenantId, criadoPor: g.atorId })
    if (!url || url.startsWith('data:')) return { ok: false, error: 'Falha ao hospedar a imagem (storage indisponível).' }
    return { ok: true, url }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Erro ao subir a imagem.' }
  }
}

export async function moverItem(id: string, pastaId: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const { error } = await (createAdminClient() as any).from(TABELA).update({ pasta_id: pastaId, atualizado_em: new Date().toISOString() }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/leitura/biblioteca')
  return { ok: true }
}

export async function excluirItem(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const { error } = await (createAdminClient() as any).from(TABELA).update({ deletado: true, deletado_em: new Date().toISOString(), deletado_por: g.atorId }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: TABELA, entidadeId: id, depois: { deletado: true } })
  revalidatePath('/admin/leitura/biblioteca')
  return { ok: true }
}

/** Seed: cria a pasta "Selos" (Tags) + os 14 selos padrão como tags. Idempotente (pula slugs já criados). */
export async function importarSelosPadrao(): Promise<{ ok: boolean; criados?: number; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = (createAdminClient() as any)
  // pasta "Selos" (biblioteca_tag) — acha ou cria
  const { data: ja } = await svc.from('simulado_pastas').select('id').eq('tenant_id', g.tenantId).eq('folder_area', 'biblioteca_tag').eq('is_folder', true).eq('deletado', false).eq('nome', 'Selos').limit(1)
  let pastaId: string | null = ja?.[0]?.id ?? null
  if (!pastaId) {
    const { data } = await svc.from('simulado_pastas').insert({ tenant_id: g.tenantId, nome: 'Selos', is_folder: true, pai_id: null, folder_area: 'biblioteca_tag' }).select('id').single()
    pastaId = data?.id ?? null
  }
  const { data: itens } = await svc.from(TABELA).select('slug').eq('tenant_id', g.tenantId).eq('tipo', 'tag').eq('deletado', false)
  const jaSlugs = new Set((itens ?? []).map((r: any) => r.slug).filter(Boolean))
  const rows = Object.entries(SELOS)
    .filter(([slug]) => !jaSlugs.has(slug))
    .map(([slug, def]) => ({ tenant_id: g.tenantId, tipo: 'tag', pasta_id: pastaId, nome: def.nome, slug, html: `<span data-selo="${slug}"></span>`, descricao: `Selo "${def.nome}"`, criado_por: g.atorId }))
  if (rows.length) { const { error } = await svc.from(TABELA).insert(rows); if (error) return { ok: false, error: error.message } }
  await registrarAudit({ operacao: 'INSERT', entidade: TABELA, entidadeId: pastaId ?? '', depois: { seedSelos: rows.length } })
  revalidatePath('/admin/leitura/biblioteca')
  return { ok: true, criados: rows.length }
}

// ── Pastas (folder_area = 'biblioteca' | 'biblioteca_tag') ───────────────────────────────────────
export async function criarPastaBib(tipo: Tipo, nome: string, paiId?: string | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = (createAdminClient() as any)
  const titulo = (nome ?? '').trim() || 'Nova pasta'
  const base = { tenant_id: g.tenantId, nome: titulo, is_folder: true, pai_id: paiId ?? null }
  let { data, error } = await svc.from('simulado_pastas').insert({ ...base, folder_area: AREA[tipo] }).select('id').single()
  if (error && /folder_area/i.test(error.message)) ({ data, error } = await svc.from('simulado_pastas').insert(base).select('id').single())
  if (error || !data) return { ok: false, error: error?.message ?? 'Erro ao criar pasta.' }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_pastas', entidadeId: data.id, depois: { nome: titulo, pasta: true, area: AREA[tipo] } })
  revalidatePath('/admin/leitura/biblioteca')
  return { ok: true, id: data.id }
}

export async function renomearPastaBib(id: string, nome: string, cor?: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = (createAdminClient() as any)
  const titulo = (nome ?? '').trim() || 'Pasta'
  const up: Record<string, unknown> = { nome: titulo }
  if (cor !== undefined) up.cor = cor
  const { error } = await svc.from('simulado_pastas').update(up).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: id, depois: { nome: titulo } })
  revalidatePath('/admin/leitura/biblioteca')
  return { ok: true }
}

export async function moverPastaBib(id: string, paiId: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  if (id === paiId) return { ok: false, error: 'Pasta não pode ser pai de si mesma.' }
  const { error } = await (createAdminClient() as any).from('simulado_pastas').update({ pai_id: paiId }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/leitura/biblioteca')
  return { ok: true }
}

export async function excluirPastaBib(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = (createAdminClient() as any)
  // Sobe as subpastas e solta os itens pra raiz (não apaga conteúdo junto).
  try { await svc.from('simulado_pastas').update({ pai_id: null }).eq('pai_id', id).eq('tenant_id', g.tenantId) } catch { /* ignore */ }
  try { await svc.from(TABELA).update({ pasta_id: null }).eq('pasta_id', id).eq('tenant_id', g.tenantId) } catch { /* ignore */ }
  const { error } = await softDelete('simulado_pastas', id)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_pastas', entidadeId: id, depois: { deletado: true, pasta: true } })
  revalidatePath('/admin/leitura/biblioteca')
  return { ok: true }
}
