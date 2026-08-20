'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { cifrar, detectarProvedor, mascarar, carregarConfigIA, MODELOS_PADRAO, PROVEDOR_LABEL, type Provedor } from '@/lib/ia/config'

async function gate() {
  const access = await getCurrentAccess()
  const ok = !!access.tenantId && (access.isAdmin || accessCan(access, 'configuracoes:manage') || accessCan(access, 'configuracoes:view'))
  return { access, ok }
}

export interface StatusIA { configurado: boolean; provider?: Provedor; providerLabel?: string; modelo?: string; mascara?: string; testadaEm?: string | null }

/** Estado atual da config de IA do tenant (sem expor a chave). */
export async function statusConfigIA(): Promise<StatusIA> {
  const { access, ok } = await gate(); if (!ok) return { configurado: false }
  const svc = createAdminClient()
  try {
    const { data } = await svc.from('simulado_ia_config').select('provider, modelo, api_key_mascara, testada_em, ativo').eq('tenant_id', access.tenantId).maybeSingle()
    if (!data || data.ativo === false) return { configurado: false }
    const provider = data.provider as Provedor
    return { configurado: true, provider, providerLabel: PROVEDOR_LABEL[provider], modelo: data.modelo, mascara: data.api_key_mascara ?? '', testadaEm: data.testada_em }
  } catch { return { configurado: false } }
}

/** Salva a chave: DETECTA o provedor pelo formato (ou usa o escolhido manualmente),
 * criptografa e faz upsert (1 por tenant). */
export async function salvarConfigIA(chave: string, providerManual?: Provedor | null, modeloOverride?: string): Promise<{ ok: boolean; error?: string; provider?: Provedor; providerLabel?: string; modelo?: string; mascara?: string }> {
  const { access, ok } = await gate(); if (!ok) return { ok: false, error: 'Sem permissão.' }
  const key = (chave || '').trim()
  if (!key) return { ok: false, error: 'Cole a chave de API.' }
  const valido = (p: any): p is Provedor => p === 'anthropic' || p === 'openai' || p === 'gemini'
  const provider = valido(providerManual) ? providerManual : detectarProvedor(key)
  if (!provider) return { ok: false, error: 'Não foi possível identificar o provedor. Escolha manualmente (OpenAI / Anthropic / Gemini).' }
  const modelo = (modeloOverride || '').trim() || MODELOS_PADRAO[provider]
  const svc = createAdminClient()
  const row = { tenant_id: access.tenantId, provider, modelo, api_key_cipher: cifrar(key), api_key_mascara: mascarar(key), ativo: true, atualizado_em: new Date().toISOString() }
  const { error } = await svc.from('simulado_ia_config').upsert(row, { onConflict: 'tenant_id' })
  if (error) return { ok: false, error: /simulado_ia_config|relation|does not exist|schema cache/i.test(error.message) ? 'Rode a migração 20260820000004_ia_config.sql.' : error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_ia_config', entidadeId: access.tenantId!, depois: { provider, modelo, mascara: mascarar(key) } }).catch(() => {})
  revalidatePath('/admin/transcricao')
  return { ok: true, provider, providerLabel: PROVEDOR_LABEL[provider], modelo, mascara: mascarar(key) }
}

/** Remove a config de IA do tenant. */
export async function removerConfigIA(): Promise<{ ok: boolean; error?: string }> {
  const { access, ok } = await gate(); if (!ok) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_ia_config').delete().eq('tenant_id', access.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_ia_config', entidadeId: access.tenantId! }).catch(() => {})
  revalidatePath('/admin/transcricao')
  return { ok: true }
}

/** Testa a chave contra o provedor (endpoint leve de modelos). Grava testada_em se OK. */
export async function testarConfigIA(): Promise<{ ok: boolean; error?: string }> {
  const { access, ok } = await gate(); if (!ok) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const cfg = await carregarConfigIA(svc, access.tenantId!)
  if (!cfg) return { ok: false, error: 'Nenhuma chave configurada.' }
  try {
    let r: Response
    if (cfg.provider === 'anthropic') r = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' } })
    else if (cfg.provider === 'openai') r = await fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${cfg.apiKey}` } })
    else r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cfg.apiKey)}`)
    if (!r.ok) { const j = await r.json().catch(() => ({})); return { ok: false, error: (j as any)?.error?.message || `Chave inválida (${r.status}).` } }
    await svc.from('simulado_ia_config').update({ testada_em: new Date().toISOString() }).eq('tenant_id', access.tenantId)
    revalidatePath('/admin/transcricao')
    return { ok: true }
  } catch { return { ok: false, error: 'Falha ao contatar o provedor.' } }
}
