'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'

export type FuncaoEtiqueta = 'anular' | 'avisar' | 'desconsiderar'
export type Etiqueta = { id: string; nome: string; cor: string | null; funcao?: FuncaoEtiqueta | null; total?: number }

const FUNC = (v: unknown): FuncaoEtiqueta | null => (v === 'anular' || v === 'avisar' || v === 'desconsiderar' ? v : null)

async function guard(perm: string) {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

// Detecta a função de uma etiqueta pelo NOME (para dar função automática às que o admin já criou).
const PADRAO_MATCH: { re: RegExp; funcao: FuncaoEtiqueta }[] = [
  { re: /anulad/i, funcao: 'anular' },
  { re: /desatualizad/i, funcao: 'anular' },
  { re: /(gabarito.*revis|em revis|sob an[aá]lise)/i, funcao: 'avisar' },
  { re: /desconsiderad/i, funcao: 'desconsiderar' },
]
// Etiquetas a CRIAR quando aquela função ainda não existe em nenhuma tag do tenant.
const PADRAO_CRIAR: { nome: string; cor: string; funcao: FuncaoEtiqueta }[] = [
  { nome: 'Questão anulada', cor: '#ef4444', funcao: 'anular' },
  { nome: 'Gabarito em revisão', cor: '#0ea5e9', funcao: 'avisar' },
  { nome: 'Questão desconsiderada', cor: '#64748b', funcao: 'desconsiderar' },
]

/**
 * Backfill de função por PADRÃO nas etiquetas existentes SEM função (ex.: a "Anulada" que o
 * admin já criou vira 'anular') + cria a tag padrão de cada função que ainda não existe.
 * Tolerante: se a coluna `funcao` ainda não foi migrada, não faz nada.
 */
async function seedPadrao(svc: ReturnType<typeof createAdminClient>, tenantId: string) {
  const { data, error } = await svc.from('simulado_etiquetas').select('id, nome, funcao').eq('tenant_id', tenantId)
  if (error) return // coluna `funcao` ausente (migração pendente) ou tabela ausente
  const lista = (data ?? []) as { id: string; nome: string; funcao: string | null }[]
  const funcDe = (nome: string) => PADRAO_MATCH.find((x) => x.re.test(nome))?.funcao ?? null
  // 1) dá função às que estão sem função e casam com um padrão (não sobrescreve o que o admin definiu).
  for (const e of lista) { if (!e.funcao) { const f = funcDe(e.nome); if (f) await svc.from('simulado_etiquetas').update({ funcao: f }).eq('id', e.id) } }
  // 2) garante UMA etiqueta por função (cria só se aquela função ainda não está representada).
  const representadas = new Set<string>()
  for (const e of lista) { const f = FUNC(e.funcao) ?? funcDe(e.nome); if (f) representadas.add(f) }
  const criar = PADRAO_CRIAR.filter((p) => !representadas.has(p.funcao))
  if (criar.length) await svc.from('simulado_etiquetas').upsert(criar.map((p) => ({ tenant_id: tenantId, nome: p.nome, cor: p.cor, funcao: p.funcao })), { onConflict: 'tenant_id,nome', ignoreDuplicates: true })
}

/** Lista as etiquetas do tenant (com a contagem de questões vinculadas) + garante a padrão. */
export async function listarEtiquetas(): Promise<{ ok: boolean; itens?: Etiqueta[]; error?: string }> {
  const g = await guard('questoes:view'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  await seedPadrao(svc, g.tenantId)
  let res: { data: any[] | null; error: any } = await svc.from('simulado_etiquetas').select('id, nome, cor, funcao').eq('tenant_id', g.tenantId).order('nome')
  if (res.error && /funcao|column/i.test(String(res.error.message))) res = await svc.from('simulado_etiquetas').select('id, nome, cor').eq('tenant_id', g.tenantId).order('nome')
  if (res.error) return { ok: false, error: res.error.message }
  const data = res.data
  const ids = (data ?? []).map((e: any) => e.id as string)
  const totalPorEt = new Map<string, number>()
  if (ids.length) {
    const { data: links } = await svc.from('simulado_questao_etiquetas').select('etiqueta_id').eq('tenant_id', g.tenantId).in('etiqueta_id', ids)
    for (const l of (links ?? []) as any[]) totalPorEt.set(l.etiqueta_id, (totalPorEt.get(l.etiqueta_id) ?? 0) + 1)
  }
  const itens = (data ?? []).map((e: any) => ({ id: e.id, nome: e.nome, cor: e.cor ?? null, funcao: FUNC(e.funcao), total: totalPorEt.get(e.id) ?? 0 }))
  return { ok: true, itens }
}

export async function criarEtiqueta(nome: string, cor: string, funcao?: string | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('questoes:update'); if (!g.ok) return { ok: false, error: g.error }
  const n = nome.trim(); if (!n) return { ok: false, error: 'Informe um nome.' }
  const svc = createAdminClient()
  const base: Record<string, unknown> = { tenant_id: g.tenantId, nome: n, cor: cor || null }
  let res = await svc.from('simulado_etiquetas').insert({ ...base, funcao: FUNC(funcao) }).select('id').single()
  if (res.error && /funcao|column/i.test(String(res.error.message))) res = await svc.from('simulado_etiquetas').insert(base).select('id').single()
  if (res.error) return { ok: false, error: /duplicate|unique/i.test(res.error.message) ? 'Já existe uma etiqueta com esse nome.' : res.error.message }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_etiquetas', entidadeId: (res.data as any).id, depois: { nome: n, cor, funcao: FUNC(funcao) }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/etiquetas')
  return { ok: true, id: (res.data as any).id }
}

export async function atualizarEtiqueta(id: string, nome: string, cor: string, funcao?: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('questoes:update'); if (!g.ok) return { ok: false, error: g.error }
  const n = nome.trim(); if (!n) return { ok: false, error: 'Informe um nome.' }
  const svc = createAdminClient()
  const base: Record<string, unknown> = { nome: n, cor: cor || null }
  let res = await svc.from('simulado_etiquetas').update({ ...base, funcao: FUNC(funcao) }).eq('id', id).eq('tenant_id', g.tenantId)
  if (res.error && /funcao|column/i.test(String(res.error.message))) res = await svc.from('simulado_etiquetas').update(base).eq('id', id).eq('tenant_id', g.tenantId)
  if (res.error) return { ok: false, error: /duplicate|unique/i.test(res.error.message) ? 'Já existe uma etiqueta com esse nome.' : res.error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_etiquetas', entidadeId: id, depois: { nome: n, cor, funcao: FUNC(funcao) }, atorId: g.atorId, tenantId: g.tenantId })
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
