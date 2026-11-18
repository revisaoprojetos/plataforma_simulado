'use server'

// EXCEÇÃO CONTROLADA ao bloqueio de documento/pasta em uso (ver migração 20261118110000): SOMENTE super-admin,
// com MOTIVO obrigatório. A RPC security definer registra quem/quando/motivo/antes/depois em
// simulado_bloqueio_overrides e libera o trigger apenas dentro da própria transação. Nunca faz delete físico.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, isSuperAdmin } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MOTIVO_MIN = 10

async function guardSuper() {
  if (!(await isSuperAdmin())) return { ok: false as const, error: 'Somente super-admin pode forçar esta ação.' }
  const access = await getCurrentAccess()
  if (!access.tenantId || !access.userId) return { ok: false as const, error: 'Tenant/sessão não resolvidos.' }
  return { ok: true as const, tenantId: access.tenantId, userId: access.userId }
}

/** O usuário atual pode forçar (é super-admin)? Usado só para exibir o botão. */
export async function podeForcarBloqueio(): Promise<boolean> {
  return isSuperAdmin()
}

export async function forcarAcaoDocumentos(input: {
  docIds: string[]; acao: 'lixeira' | 'mover' | 'despublicar' | 'categoria'; valor?: string | null; motivo: string
}): Promise<{ ok: boolean; error?: string; afetados?: number }> {
  const g = await guardSuper(); if (!g.ok) return g
  const motivo = (input.motivo ?? '').trim()
  if (motivo.length < MOTIVO_MIN) return { ok: false, error: `Informe o motivo (mínimo ${MOTIVO_MIN} caracteres).` }
  const ids = [...new Set((input.docIds ?? []).filter((x) => UUID.test(x)))].slice(0, 200)
  if (!ids.length) return { ok: false, error: 'Nenhum documento informado.' }
  if (!['lixeira', 'mover', 'despublicar', 'categoria'].includes(input.acao)) return { ok: false, error: 'Ação inválida.' }
  const { data, error } = await (createAdminClient() as any).rpc('executar_override_documentos', {
    p_motivo: motivo, p_ator: g.userId, p_tenant: g.tenantId, p_docs: ids, p_acao: input.acao, p_valor: input.valor ?? null,
  })
  if (error) return { ok: false, error: /does not exist|schema cache/i.test(error.message) ? 'Rode a migração 20261118110000 (bloqueio de documentos).' : error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_conteudo_documentos', entidadeId: ids.length === 1 ? ids[0] : null, tenantId: g.tenantId, atorId: g.userId,
    depois: { override_bloqueio: true, acao: input.acao, valor: input.valor ?? null, motivo, ids } }).catch(() => {})
  revalidatePath('/admin/biblioteca')
  return { ok: true, afetados: Number(data ?? 0) }
}

export async function forcarAcaoPasta(input: {
  pastaId: string; acao: 'lixeira' | 'mover' | 'tipo' | 'disciplina'; valor?: string | null; motivo: string
}): Promise<{ ok: boolean; error?: string }> {
  const g = await guardSuper(); if (!g.ok) return g
  const motivo = (input.motivo ?? '').trim()
  if (motivo.length < MOTIVO_MIN) return { ok: false, error: `Informe o motivo (mínimo ${MOTIVO_MIN} caracteres).` }
  if (!UUID.test(input.pastaId ?? '')) return { ok: false, error: 'Pasta inválida.' }
  if (!['lixeira', 'mover', 'tipo', 'disciplina'].includes(input.acao)) return { ok: false, error: 'Ação inválida.' }
  const { error } = await (createAdminClient() as any).rpc('executar_override_pasta', {
    p_motivo: motivo, p_ator: g.userId, p_tenant: g.tenantId, p_pasta: input.pastaId, p_acao: input.acao, p_valor: input.valor ?? null,
  })
  if (error) return { ok: false, error: /does not exist|schema cache/i.test(error.message) ? 'Rode a migração 20261118110000 (bloqueio de documentos).' : error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: input.pastaId, tenantId: g.tenantId, atorId: g.userId,
    depois: { override_bloqueio: true, acao: input.acao, valor: input.valor ?? null, motivo } }).catch(() => {})
  revalidatePath('/admin/biblioteca')
  return { ok: true }
}
