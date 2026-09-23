'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { criptografar, descriptografar } from '@/lib/crypto'
import { revalidatePath } from 'next/cache'
import { montarCorpoWebhook, dadosExemploWebhook, enviarWebhookHttp } from '@/lib/webhooks/envelope'

// `secret` semântica no UPDATE: undefined = MANTER o atual (o client não reenvia o segredo, que nunca
// chega ao browser); string vazia = limpar; string = novo segredo (guardado CRIPTOGRAFADO).
type WebhookInput = { nome: string; url: string; eventos: string[]; secret?: string; ativo?: boolean; enviosSimultaneos?: number; filtroSimulados?: string[]; engajamentoRegras?: Record<string, unknown> }

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
    secret: criptografar(data.secret?.trim() || null), // CRIPTOGRAFADO em repouso (AES-256-GCM)
    ativo: data.ativo ?? true,
  }
  const extra = { envios_simultaneos: data.enviosSimultaneos ?? 5, filtro_simulados: data.filtroSimulados ?? [], engajamento_regras: data.engajamentoRegras ?? {} }
  let { data: row, error } = await svc.from('simulado_webhook_saida').insert({ ...base, ...extra }).select('id').single()
  if (error && /envios_simultaneos|filtro_simulados|engajamento_regras|column/i.test(error.message)) {
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
  const base: Record<string, unknown> = {
    nome: data.nome.trim(),
    url: data.url.trim(),
    eventos: data.eventos ?? [],
    ativo: data.ativo ?? true,
  }
  // undefined = manter o segredo atual; senão grava o novo CRIPTOGRAFADO ('' limpa).
  if (data.secret !== undefined) base.secret = criptografar(data.secret.trim() || null)
  const extra = { envios_simultaneos: data.enviosSimultaneos ?? 5, filtro_simulados: data.filtroSimulados ?? [], engajamento_regras: data.engajamentoRegras ?? {} }
  let { error } = await svc.from('simulado_webhook_saida').update({ ...base, ...extra }).eq('id', id).eq('tenant_id', tenantId)
  if (error && /envios_simultaneos|filtro_simulados|engajamento_regras|column/i.test(error.message)) {
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

/**
 * Envia um POST de TESTE para o webhook (payload de exemplo do evento, assinado igual ao real) e
 * retorna o resultado HTTP — sem gravar nada. Usa a URL/segredo salvos; `evento` default = 1º assinado.
 */
export async function testarWebhook(id: string, evento?: string): Promise<{ ok: boolean; status?: number | null; ms?: number; evento?: string; error?: string }> {
  if (!(await podeGerenciar())) return { ok: false, error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = await createServiceClient()
  const { data: wh } = await svc.from('simulado_webhook_saida').select('url, secret, eventos').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!wh?.url) return { ok: false, error: 'Webhook não encontrado.' }
  const ev = evento || (Array.isArray(wh.eventos) && wh.eventos[0]) || 'estudante.finalizou'
  const { data: tnt } = await svc.from('simulado_tenants').select('nome, slug').eq('id', tenantId).maybeSingle()
  const corpo = JSON.stringify(montarCorpoWebhook(ev, { id: tenantId, nome: (tnt as any)?.nome ?? null, slug: (tnt as any)?.slug ?? null }, tenantId, dadosExemploWebhook(ev), new Date().toISOString()))
  const r = await enviarWebhookHttp(wh.url, ev, corpo, descriptografar(wh.secret))
  // Registra o resultado do teste no status do webhook (visível na lista) e audita.
  await svc.from('simulado_webhook_saida').update({ ultimo_status: `teste: ${r.texto}`, ultimo_envio: new Date().toISOString() }).eq('id', id).eq('tenant_id', tenantId)
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_webhook_saida', entidadeId: id, depois: { teste: r.texto, evento: ev } })
  revalidatePath('/admin/conexoes/webhooks')
  return { ok: r.ok, status: r.status, ms: r.ms, evento: ev, error: r.ok ? undefined : r.texto }
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
