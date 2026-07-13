'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { registrarAudit } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

type Passo = { id: string; tipo: string; nome: string; config: Record<string, unknown> }
type AutomacaoInput = { nome: string; gatilho: string | null; passos: Passo[]; ativo?: boolean }

export async function salvarAutomacao(id: string | null, data: AutomacaoInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  if (!data.nome?.trim()) return { ok: false, error: 'Informe um nome.' }

  const svc = await createServiceClient()
  const payload = { nome: data.nome.trim(), gatilho: data.gatilho ?? null, passos: data.passos ?? [], ativo: data.ativo ?? true }

  if (id) {
    const { error } = await svc.from('simulado_automacoes').update(payload).eq('id', id).eq('tenant_id', tenantId)
    if (error) return { ok: false, error: error.message }
    await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_automacoes', entidadeId: id, depois: { nome: payload.nome, gatilho: payload.gatilho, passos: payload.passos.length } })
    revalidatePath('/admin/conexoes/webhooks')
    return { ok: true, id }
  }

  const { data: row, error } = await svc.from('simulado_automacoes').insert({ tenant_id: tenantId, ...payload }).select('id').single()
  if (error || !row) return { ok: false, error: error?.message ?? 'Erro ao salvar' }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_automacoes', entidadeId: row.id, depois: { nome: payload.nome, gatilho: payload.gatilho } })
  revalidatePath('/admin/conexoes/webhooks')
  return { ok: true, id: row.id }
}

export async function toggleAutomacao(id: string, ativo: boolean): Promise<{ ok: boolean; error?: string }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = await createServiceClient()
  const { error } = await svc.from('simulado_automacoes').update({ ativo }).eq('id', id).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/conexoes/webhooks')
  return { ok: true }
}

export async function excluirAutomacao(id: string): Promise<{ ok: boolean; error?: string }> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = await createServiceClient()
  const { error } = await svc.from('simulado_automacoes').delete().eq('id', id).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_automacoes', entidadeId: id })
  revalidatePath('/admin/conexoes/webhooks')
  return { ok: true }
}
