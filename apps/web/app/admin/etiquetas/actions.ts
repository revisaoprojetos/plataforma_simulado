'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'

export type Etiqueta = { id: string; nome: string; cor: string | null; total?: number }

async function guard(perm: string) {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

/** Garante a etiqueta padrão "Questão desatualizada" no tenant (idempotente por nome). */
async function seedPadrao(svc: ReturnType<typeof createAdminClient>, tenantId: string) {
  await svc.from('simulado_etiquetas').upsert(
    { tenant_id: tenantId, nome: 'Questão desatualizada', cor: '#f59e0b' },
    { onConflict: 'tenant_id,nome', ignoreDuplicates: true },
  )
}

/** Lista as etiquetas do tenant (com a contagem de questões vinculadas) + garante a padrão. */
export async function listarEtiquetas(): Promise<{ ok: boolean; itens?: Etiqueta[]; error?: string }> {
  const g = await guard('questoes:view'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  await seedPadrao(svc, g.tenantId)
  const { data, error } = await svc.from('simulado_etiquetas').select('id, nome, cor').eq('tenant_id', g.tenantId).order('nome')
  if (error) return { ok: false, error: error.message }
  const ids = (data ?? []).map((e: any) => e.id as string)
  const totalPorEt = new Map<string, number>()
  if (ids.length) {
    const { data: links } = await svc.from('simulado_questao_etiquetas').select('etiqueta_id').eq('tenant_id', g.tenantId).in('etiqueta_id', ids)
    for (const l of (links ?? []) as any[]) totalPorEt.set(l.etiqueta_id, (totalPorEt.get(l.etiqueta_id) ?? 0) + 1)
  }
  const itens = (data ?? []).map((e: any) => ({ id: e.id, nome: e.nome, cor: e.cor ?? null, total: totalPorEt.get(e.id) ?? 0 }))
  return { ok: true, itens }
}

export async function criarEtiqueta(nome: string, cor: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('questoes:update'); if (!g.ok) return { ok: false, error: g.error }
  const n = nome.trim(); if (!n) return { ok: false, error: 'Informe um nome.' }
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_etiquetas').insert({ tenant_id: g.tenantId, nome: n, cor: cor || null }).select('id').single()
  if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Já existe uma etiqueta com esse nome.' : error.message }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_etiquetas', entidadeId: (data as any).id, depois: { nome: n, cor }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/etiquetas')
  return { ok: true, id: (data as any).id }
}

export async function atualizarEtiqueta(id: string, nome: string, cor: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('questoes:update'); if (!g.ok) return { ok: false, error: g.error }
  const n = nome.trim(); if (!n) return { ok: false, error: 'Informe um nome.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_etiquetas').update({ nome: n, cor: cor || null }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Já existe uma etiqueta com esse nome.' : error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_etiquetas', entidadeId: id, depois: { nome: n, cor }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/etiquetas')
  return { ok: true }
}

export async function excluirEtiqueta(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('questoes:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  // Remove os vínculos e a etiqueta (hard delete — a tabela não tem coluna de soft-delete).
  await svc.from('simulado_questao_etiquetas').delete().eq('tenant_id', g.tenantId).eq('etiqueta_id', id)
  const { error } = await svc.from('simulado_etiquetas').delete().eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_etiquetas', entidadeId: id, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/etiquetas')
  return { ok: true }
}

/** Todas as etiquetas do tenant + as ativas na questão (para o seletor no editor). */
export async function etiquetasDaQuestao(questaoId: string): Promise<{ ok: boolean; todas?: Etiqueta[]; ativas?: string[]; error?: string }> {
  const g = await guard('questoes:view'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  await seedPadrao(svc, g.tenantId)
  const [{ data: todas }, { data: links }] = await Promise.all([
    svc.from('simulado_etiquetas').select('id, nome, cor').eq('tenant_id', g.tenantId).order('nome'),
    svc.from('simulado_questao_etiquetas').select('etiqueta_id').eq('tenant_id', g.tenantId).eq('questao_id', questaoId),
  ])
  return {
    ok: true,
    todas: (todas ?? []).map((e: any) => ({ id: e.id, nome: e.nome, cor: e.cor ?? null })),
    ativas: (links ?? []).map((l: any) => l.etiqueta_id as string),
  }
}

export async function aplicarEtiqueta(questaoId: string, etiquetaId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('questoes:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_questao_etiquetas').upsert(
    { tenant_id: g.tenantId, questao_id: questaoId, etiqueta_id: etiquetaId },
    { onConflict: 'questao_id,etiqueta_id', ignoreDuplicates: true },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function removerEtiquetaDaQuestao(questaoId: string, etiquetaId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('questoes:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_questao_etiquetas').delete().eq('tenant_id', g.tenantId).eq('questao_id', questaoId).eq('etiqueta_id', etiquetaId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
