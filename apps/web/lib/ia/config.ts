import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// Config de transcrição/correção por IA de VISÃO, POR TENANT. A chave é um SEGREDO de
// saída (usada p/ chamar o provedor) → guardada CRIPTOGRAFADA (AES-256-GCM) e nunca
// enviada ao browser. O provedor é DETECTADO a partir do formato da chave (adaptativo).

export type Provedor = 'anthropic' | 'openai' | 'gemini'
export interface ConfigIA { provider: Provedor; modelo: string; apiKey: string; mascara: string }

// Chave de cifra derivada de um segredo do servidor (nunca vai ao client). Prefere
// IA_CONFIG_SECRET; cai no service-role key (sempre presente no server) p/ não exigir env novo.
const SEGREDO = process.env.IA_CONFIG_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || 'simulado-dev-fallback-secret'
const CHAVE = scryptSync(SEGREDO, 'simulado_ia_config.v1', 32)

/** Cifra um texto → "iv:tag:ciphertext" (base64). */
export function cifrar(texto: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', CHAVE, iv)
  const enc = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  const tag = c.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}
/** Decifra "iv:tag:ciphertext" → texto (''; se corrompido/segredo mudou). */
export function decifrar(blob: string): string {
  try {
    const [ivB, tagB, encB] = String(blob).split(':')
    if (!ivB || !tagB || !encB) return ''
    const d = createDecipheriv('aes-256-gcm', CHAVE, Buffer.from(ivB, 'base64'))
    d.setAuthTag(Buffer.from(tagB, 'base64'))
    return Buffer.concat([d.update(Buffer.from(encB, 'base64')), d.final()]).toString('utf8')
  } catch { return '' }
}

export const MODELOS_PADRAO: Record<Provedor, string> = {
  anthropic: process.env.IA_CORRECAO_MODELO || 'claude-opus-4-8',
  openai: 'gpt-4o',
  gemini: 'gemini-1.5-pro',
}
export const PROVEDOR_LABEL: Record<Provedor, string> = {
  anthropic: 'Claude (Anthropic)', openai: 'GPT (OpenAI)', gemini: 'Gemini (Google)',
}

/** Detecta o provedor pelo FORMATO da chave (adaptativo). null = não reconhecido. */
export function detectarProvedor(key: string): Provedor | null {
  const k = (key || '').trim()
  if (/^sk-ant-/i.test(k)) return 'anthropic'
  if (/^AIza/i.test(k)) return 'gemini'          // chaves Google/Gemini começam com "AIza"
  if (/^AQ\.[\w-]+/i.test(k)) return 'gemini'     // chaves efêmeras do Gemini (formato AQ.…)
  if (/^sk-/i.test(k)) return 'openai'            // sk-…, sk-proj-…
  return null
}
/** Máscara p/ a UI: mostra só o começo e o fim. */
export function mascarar(key: string): string {
  const k = (key || '').trim()
  if (k.length <= 10) return k ? `${k.slice(0, 3)}…` : ''
  return `${k.slice(0, 6)}…${k.slice(-4)}`
}

/** Config de IA do tenant (DESCRIPTOGRAFADA) — server-only. Tolerante à tabela ausente. */
export async function carregarConfigIA(svc: SupabaseClient, tenantId: string): Promise<ConfigIA | null> {
  try {
    const { data } = await svc.from('simulado_ia_config')
      .select('provider, modelo, api_key_cipher, api_key_mascara, ativo')
      .eq('tenant_id', tenantId).maybeSingle()
    if (!data || data.ativo === false) return null
    const apiKey = decifrar(data.api_key_cipher)
    if (!apiKey) return null
    return { provider: data.provider as Provedor, modelo: data.modelo, apiKey, mascara: data.api_key_mascara ?? '' }
  } catch { return null }
}

/** Há IA disponível p/ o tenant? (config do tenant OU a env global ANTHROPIC_API_KEY). */
export async function iaDisponivel(svc: SupabaseClient, tenantId: string | null | undefined): Promise<boolean> {
  if (process.env.ANTHROPIC_API_KEY) return true
  if (!tenantId) return false
  return !!(await carregarConfigIA(svc, tenantId))
}
