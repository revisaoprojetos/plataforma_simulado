import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { descriptografar, criptografar } from '@/lib/crypto'
import type { Provider, ProviderCfg } from '@/lib/integracoes/tipos'

/**
 * Resolve a config de um provedor para um tenant (tabela simulado_integracao_config).
 * Credenciais ficam criptografadas em repouso (enc:v1:...) por campo dentro do jsonb
 * `credenciais`; aqui devolvemos JÁ DESCRIPTOGRAFADAS para uso. Fallback ao .env só para o
 * tenant designado por <PROVIDER>_ENV_TENANT_ID (mesma política da Curseduca — evita que uma
 * empresa use por engano a conta global de outra).
 *
 * Multi-empresa: NÃO aplica .env global automaticamente a qualquer tenant.
 */

const BASE_PADRAO: Record<Provider, string> = {
  curseduca: 'https://prof.curseduca.pro',
  guru: 'https://digitalmanager.guru',
}

/** Config do .env para um provedor (fallback), se o tenant for o designado. */
export function cfgDoEnv(provider: Provider, tenantId: string): ProviderCfg | null {
  const P = provider.toUpperCase()
  const alvo = process.env[`${P}_ENV_TENANT_ID`]
  if (!alvo || alvo !== tenantId) return null
  const base = process.env[`${P}_BASE_URL`] || BASE_PADRAO[provider]
  if (provider === 'curseduca') {
    const api_key = process.env.CURSEDUCA_API_KEY || ''
    const usuario = process.env.CURSEDUCA_USER || ''
    const senha = process.env.CURSEDUCA_PASS || ''
    if (!(api_key && usuario && senha)) return null
    return { provider, baseUrl: base, credenciais: { api_key, usuario, senha } }
  }
  // guru
  const api_token = process.env.GURU_API_TOKEN || ''
  if (!api_token) return null
  return { provider, baseUrl: base, credenciais: { api_token } }
}

/** Config do tenant (descriptografada) ou fallback .env. Null se não configurado/ativo. */
export async function resolverProviderCfg(tenantId: string, provider: Provider, opts?: { ignorarAtivo?: boolean }): Promise<ProviderCfg | null> {
  try {
    const svc = createAdminClient()
    // mapa_json pode não existir ainda (migration pendente) → busca tolerante.
    let data: any
    const r = await svc.from('simulado_integracao_config').select('base_url, credenciais, ativo, mapa_json').eq('tenant_id', tenantId).eq('provider', provider).maybeSingle()
    if (r.error && /mapa_json|column/i.test(r.error.message)) {
      const r2 = await svc.from('simulado_integracao_config').select('base_url, credenciais, ativo').eq('tenant_id', tenantId).eq('provider', provider).maybeSingle()
      data = r2.data
    } else data = r.data
    const d = data as any
    // ignorarAtivo: permite TESTAR a conexão com a credencial salva antes de ativar a integração.
    if (d && (opts?.ignorarAtivo || d.ativo) && d.credenciais && typeof d.credenciais === 'object') {
      const cred: Record<string, string> = {}
      for (const [k, v] of Object.entries(d.credenciais as Record<string, string>)) cred[k] = descriptografar(v) ?? ''
      const mapa = (d.mapa_json && typeof d.mapa_json === 'object') ? (d.mapa_json as Record<string, string>) : undefined
      // considera configurado só se tiver ao menos uma credencial não vazia
      if (Object.values(cred).some((v) => v)) return { provider, baseUrl: d.base_url || BASE_PADRAO[provider], credenciais: cred, mapa }
    }
  } catch { /* tabela pode não existir ainda → tenta env */ }
  return cfgDoEnv(provider, tenantId)
}

/** Criptografa cada campo de credencial para gravar em repouso. */
export function criptografarCredenciais(cred: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(cred)) out[k] = criptografar(v) ?? ''
  return out
}
