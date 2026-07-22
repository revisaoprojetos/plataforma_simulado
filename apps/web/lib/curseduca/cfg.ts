import 'server-only'
import { resolverProviderCfg } from '@/lib/integracoes/config'
import { resolverCfg } from '@/lib/curseduca/import-core'
import type { CurseducaCfg } from '@/lib/curseduca/client'

/**
 * Resolve as credenciais Curseduca de um tenant, preferindo o SISTEMA NOVO
 * (integracao_config) e caindo para o LEGADO (simulado_curseduca_config / .env designado).
 *
 * Usado tanto pelo webhook quanto pelo cron de jobs — antes o webhook usava o resolver novo
 * e o cron só o legado, então um job enfileirado por um tenant configurado só no sistema novo
 * falhava no cron. Este resolver único elimina essa divergência.
 */
export async function resolverCfgCurseduca(tenantId: string): Promise<CurseducaCfg | null> {
  const pcfg = await resolverProviderCfg(tenantId, 'curseduca', { ignorarAtivo: true })
  const c = pcfg?.credenciais
  if (c?.api_key && c?.usuario && c?.senha) return { base: pcfg!.baseUrl, apiKey: c.api_key, user: c.usuario, pass: c.senha }
  return resolverCfg(tenantId)
}
