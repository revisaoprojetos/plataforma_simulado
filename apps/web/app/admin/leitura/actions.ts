'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'

export type Documento = {
  id: string
  titulo: string
  descricao: string | null
  cor: string | null
  icone: string | null
  capa_url: string | null
  pasta_id: string | null
  versao: number
  publicado: boolean
  desafio_ativo: boolean
  desafio_exige_fim: boolean
  desafio_tempo_min: number | null
  artigos?: number
}

async function guard(perm: string) {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

/** Cria um documento vazio (rascunho) — o conteúdo HTML entra no editor. */
export async function criarDocumento(titulo: string, pastaId?: string | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('leitura:create'); if (!g.ok) return { ok: false, error: g.error }
  const t = (titulo ?? '').trim() || 'Novo documento'
  const svc = createAdminClient()
  const { data, error } = await svc
    .from('simulado_documentos')
    .insert({ tenant_id: g.tenantId, titulo: t, pasta_id: pastaId ?? null, criado_por: g.atorId })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_documentos', entidadeId: (data as any).id, depois: { titulo: t }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/leitura')
  return { ok: true, id: (data as any).id }
}

export async function atualizarDocumento(
  id: string,
  patch: Partial<Pick<Documento, 'titulo' | 'descricao' | 'cor' | 'icone' | 'capa_url' | 'publicado' | 'desafio_ativo' | 'desafio_exige_fim' | 'desafio_tempo_min' | 'pasta_id'>>,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const dados: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  for (const k of ['titulo', 'descricao', 'cor', 'icone', 'capa_url', 'publicado', 'desafio_ativo', 'desafio_exige_fim', 'desafio_tempo_min', 'pasta_id'] as const) {
    if (k in patch) dados[k] = (patch as any)[k]
  }
  if (typeof dados.titulo === 'string') dados.titulo = (dados.titulo as string).trim() || 'Documento'
  const { error } = await svc.from('simulado_documentos').update(dados).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_documentos', entidadeId: id, depois: dados, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/leitura'); revalidatePath(`/admin/leitura/${id}`)
  return { ok: true }
}

export async function publicarDocumento(id: string, publicado: boolean): Promise<{ ok: boolean; error?: string }> {
  return atualizarDocumento(id, { publicado })
}

/** Soft-delete (some das listagens; a lixeira restaura). */
export async function excluirDocumento(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:delete'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_documentos').update({ deletado: true, atualizado_em: new Date().toISOString() }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_documentos', entidadeId: id, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/leitura')
  return { ok: true }
}

/** Duplica o documento + a versão vigente do conteúdo. */
export async function duplicarDocumento(id: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('leitura:create'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: orig } = await svc.from('simulado_documentos').select('*').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  if (!orig) return { ok: false, error: 'Documento não encontrado.' }
  const { data: novo, error } = await svc.from('simulado_documentos').insert({
    tenant_id: g.tenantId, titulo: `${(orig as any).titulo} (cópia)`, descricao: (orig as any).descricao,
    cor: (orig as any).cor, icone: (orig as any).icone, capa_url: (orig as any).capa_url, pasta_id: (orig as any).pasta_id,
    versao: 1, publicado: false, desafio_ativo: (orig as any).desafio_ativo, desafio_exige_fim: (orig as any).desafio_exige_fim,
    desafio_tempo_min: (orig as any).desafio_tempo_min, criado_por: g.atorId,
  }).select('id').single()
  if (error) return { ok: false, error: error.message }
  const novoId = (novo as any).id
  // Copia a versão vigente do conteúdo (se houver).
  const { data: cont } = await svc.from('simulado_documento_conteudos').select('html, texto_hash, artigos').eq('documento_id', id).eq('versao', (orig as any).versao).maybeSingle()
  if (cont) await svc.from('simulado_documento_conteudos').insert({ tenant_id: g.tenantId, documento_id: novoId, versao: 1, html: (cont as any).html, texto_hash: (cont as any).texto_hash, artigos: (cont as any).artigos })
  revalidatePath('/admin/leitura')
  return { ok: true, id: novoId }
}

// ── Atribuição (grupos + estudantes). SEM atribuição = liberado a todos. ────────

/** Grupos atribuídos + todos os grupos do tenant (p/ o seletor). */
export async function carregarAtribuicao(documentoId: string): Promise<{ ok: boolean; grupos?: { id: string; nome: string; cor: string | null; atribuido: boolean }[]; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: todos } = await svc.from('simulado_grupos').select('id, nome, cor').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome')
  const { data: atrib } = await svc.from('simulado_documento_grupos').select('grupo_id').eq('documento_id', documentoId)
  const set = new Set((atrib ?? []).map((r: any) => r.grupo_id))
  return { ok: true, grupos: (todos ?? []).map((x: any) => ({ id: x.id, nome: x.nome, cor: x.cor ?? null, atribuido: set.has(x.id) })) }
}

/** Define os grupos atribuídos (substitui o conjunto atual). */
export async function definirGruposDocumento(documentoId: string, grupoIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const ids = [...new Set((grupoIds ?? []).filter(Boolean))]
  await svc.from('simulado_documento_grupos').delete().eq('documento_id', documentoId).eq('tenant_id', g.tenantId)
  if (ids.length) {
    const { error } = await svc.from('simulado_documento_grupos').insert(ids.map((grupo_id) => ({ tenant_id: g.tenantId, documento_id: documentoId, grupo_id })))
    if (error) return { ok: false, error: error.message }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_documento_grupos', entidadeId: documentoId, depois: { grupos: ids.length }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath(`/admin/leitura/${documentoId}`)
  return { ok: true }
}

// ── Anotações BASE (pré-definidas do admin) — vêm no documento p/ todos os alunos ──

export type AnotacaoBase = { id: string; inicio: number; fim: number; exact: string; prefix: string; suffix: string; cor: string; nota: string | null }

/** Lista as anotações base da versão vigente do documento. */
export async function listarAnotacoesBase(documentoId: string, versao: number): Promise<{ ok: boolean; itens?: AnotacaoBase[]; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_documento_anotacoes_base')
    .select('id, inicio_char, fim_char, exact, prefix, suffix, cor, nota')
    .eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq('documento_versao', versao).eq('deletado', false)
  if (error) return { ok: false, error: error.message }
  return { ok: true, itens: (data ?? []).map((a: any) => ({ id: a.id, inicio: a.inicio_char, fim: a.fim_char, exact: a.exact, prefix: a.prefix ?? '', suffix: a.suffix ?? '', cor: a.cor, nota: a.nota ?? null })) }
}

export async function criarAnotacaoBase(documentoId: string, versao: number, a: { inicio: number; fim: number; exact: string; prefix: string; suffix: string; cor: string; nota?: string | null }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_documento_anotacoes_base').insert({
    tenant_id: g.tenantId, documento_id: documentoId, documento_versao: versao,
    inicio_char: a.inicio, fim_char: a.fim, exact: String(a.exact).slice(0, 4000), prefix: a.prefix ?? null, suffix: a.suffix ?? null, cor: a.cor, nota: a.nota || null,
  }).select('id').single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: (data as any).id }
}

export async function atualizarAnotacaoBase(id: string, patch: { cor?: string; nota?: string | null }): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const dados: Record<string, unknown> = {}
  if ('cor' in patch) dados.cor = patch.cor
  if ('nota' in patch) dados.nota = patch.nota || null
  const { error } = await svc.from('simulado_documento_anotacoes_base').update(dados).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function excluirAnotacaoBase(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_documento_anotacoes_base').update({ deletado: true }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Lista de documentos do admin (grade), com a contagem de artigos da versão vigente. */
export async function listarDocumentosAdmin(): Promise<{ ok: boolean; itens?: Documento[]; error?: string }> {
  const g = await guard('leitura:view'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const docs = await fetchAll<any>(() =>
    svc.from('simulado_documentos').select('*').eq('tenant_id', g.tenantId).eq('deletado', false).order('atualizado_em', { ascending: false }))
  const ids = docs.map((d) => d.id)
  const artigosPorDoc = new Map<string, number>()
  if (ids.length) {
    const { data: cont } = await svc.from('simulado_documento_conteudos').select('documento_id, versao, artigos').in('documento_id', ids)
    const versaoDoc = new Map(docs.map((d) => [d.id, d.versao]))
    for (const c of (cont ?? []) as any[]) if (c.versao === versaoDoc.get(c.documento_id)) artigosPorDoc.set(c.documento_id, c.artigos ?? 0)
  }
  return { ok: true, itens: docs.map((d) => ({ ...d, artigos: artigosPorDoc.get(d.id) ?? 0 })) }
}
