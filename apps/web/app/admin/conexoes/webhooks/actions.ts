'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

type WebhookInput = { nome: string; url: string; eventos: string[]; secret?: string; ativo?: boolean; enviosSimultaneos?: number; filtroSimulados?: string[] }

/** Webhooks carregam segredo HMAC e apontam para URLs externas → exigem permissão de configuração. */
async function podeGerenciar(): Promise<boolean> {
  return checkPermission('configuracoes:manage')
}

function valida(data: WebhookInput): string | null {
  if (!data.nome?.trim()) return 'Informe um nome.'
  if (!data.url?.trim()) return 'Informe a URL de destino.'
  if (!/^https?:\/\//i.test(data.url.trim())) return 'URL inválida — use http:// ou https://.'
  return null
}

export async function criarWebhook(data: WebhookInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!(await podeGerenciar())) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const err = valida(data)
  if (err) return { ok: false, error: err }

  const svc = await createServiceClient()
  const base = {
    tenant_id: tenantId,
    nome: data.nome.trim(),
    url: data.url.trim(),
    eventos: data.eventos ?? [],
    secret: data.secret?.trim() || null,
    ativo: data.ativo ?? true,
  }
  const extra = { envios_simultaneos: data.enviosSimultaneos ?? 5, filtro_simulados: data.filtroSimulados ?? [] }
  let { data: row, error } = await svc.from('simulado_webhook_saida').insert({ ...base, ...extra }).select('id').single()
  if (error && /envios_simultaneos|filtro_simulados|column/i.test(error.message)) {
    ({ data: row, error } = await svc.from('simulado_webhook_saida').insert(base).select('id').single())
  }
  if (error || !row) return { ok: false, error: error?.message ?? 'Erro ao salvar' }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_webhook_saida', entidadeId: row.id, depois: { nome: data.nome, url: data.url, eventos: data.eventos } })
  revalidatePath('/admin/conexoes/webhooks')
  return { ok: true, id: row.id }
}

export async function atualizarWebhook(id: string, data: WebhookInput): Promise<{ ok: boolean; error?: string }> {
  if (!(await podeGerenciar())) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const err = valida(data)
  if (err) return { ok: false, error: err }

  const svc = await createServiceClient()
  const base = {
    nome: data.nome.trim(),
    url: data.url.trim(),
    eventos: data.eventos ?? [],
    secret: data.secret?.trim() || null,
    ativo: data.ativo ?? true,
  }
  const extra = { envios_simultaneos: data.enviosSimultaneos ?? 5, filtro_simulados: data.filtroSimulados ?? [] }
  let { error } = await svc.from('simulado_webhook_saida').update({ ...base, ...extra }).eq('id', id).eq('tenant_id', tenantId)
  if (error && /envios_simultaneos|filtro_simulados|column/i.test(error.message)) {
    ({ error } = await svc.from('simulado_webhook_saida').update(base).eq('id', id).eq('tenant_id', tenantId))
  }
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_webhook_saida', entidadeId: id, depois: { nome: data.nome, url: data.url, eventos: data.eventos } })
  revalidatePath('/admin/conexoes/webhooks')
  return { ok: true }
}

export async function toggleWebhook(id: string, ativo: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!(await podeGerenciar())) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = await createServiceClient()
  const { error } = await svc.from('simulado_webhook_saida').update({ ativo }).eq('id', id).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/conexoes/webhooks')
  return { ok: true }
}

export async function excluirWebhook(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await podeGerenciar())) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = await createServiceClient()
  const { error } = await svc.from('simulado_webhook_saida').delete().eq('id', id).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_webhook_saida', entidadeId: id })
  revalidatePath('/admin/conexoes/webhooks')
  return { ok: true }
}
