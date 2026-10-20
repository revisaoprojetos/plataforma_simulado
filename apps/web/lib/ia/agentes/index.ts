import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { carregarConfigIA, type ConfigIA } from '../config'

export * from './niveis'
export * from './cliente'
export * from './orquestrador'

/** Resolve a ConfigIA a usar: config do tenant (chave cifrada) OU a env global ANTHROPIC_API_KEY.
 *  O `modelo` aqui é só fallback — no motor de agentes cada NÍVEL escolhe o seu (modeloDoNivel). */
export async function resolverConfigIA(svc: SupabaseClient | null, tenantId: string | null | undefined): Promise<ConfigIA | null> {
  if (svc && tenantId) { const c = await carregarConfigIA(svc, tenantId); if (c) return c }
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'anthropic', modelo: process.env.IA_CORRECAO_MODELO || 'claude-opus-4-8', apiKey: process.env.ANTHROPIC_API_KEY, mascara: '' }
  return null
}
