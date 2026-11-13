import 'server-only'
import { resolverProviderCfg } from '@/lib/integracoes/config'
import { estritoAtivo } from '@/lib/integracoes/webhook-seguranca'
import type { Provider } from '@/lib/integracoes/tipos'

/** Segredo (tenant → env fallback) e flag estrita do webhook de um provedor. Nunca lança. */
export async function segredoWebhookDoTenant(tenantId: string, provider: Provider): Promise<{ segredo: string; estrito: boolean }> {
  const cfg = await resolverProviderCfg(tenantId, provider, { ignorarAtivo: true }).catch(() => null)
  const envKey = provider === 'guru' ? 'GURU_WEBHOOK_SECRET' : 'CURSEDUCA_WEBHOOK_SECRET'
  return {
    segredo: cfg?.credenciais?.webhook_secret || process.env[envKey] || '',
    estrito: estritoAtivo(cfg?.credenciais),
  }
}
