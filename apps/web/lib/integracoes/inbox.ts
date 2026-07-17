import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import type { Provider } from '@/lib/integracoes/tipos'

/**
 * Registra no inbox CRU (simulado_webhook_inbox) toda requisição que bate na URL do webhook.
 * NUNCA lança: falha de log não pode derrubar o webhook. Se a tabela ainda não existe
 * (migration pendente), simplesmente ignora.
 */
export async function registrarInbox(dados: {
  provider: Provider
  metodo: string
  token?: string | null
  tenantId?: string | null
  ip?: string | null
  headers?: Record<string, string>
  query?: Record<string, string>
  raw?: string
  status: number
  resultado: string
}): Promise<void> {
  try {
    let body_json: unknown = null
    if (dados.raw) { try { body_json = JSON.parse(dados.raw) } catch { body_json = null } }
    const svc = createAdminClient()
    await svc.from('simulado_webhook_inbox').insert({
      tenant_id: dados.tenantId ?? null,
      provider: dados.provider,
      metodo: dados.metodo,
      token: dados.token ?? null,
      ip: dados.ip ?? null,
      headers: dados.headers ?? {},
      query: dados.query ?? {},
      body_raw: dados.raw ?? null,
      body_json,
      status_resp: dados.status,
      resultado: dados.resultado,
    })
  } catch { /* tabela pode não existir ainda / erro de log é não-fatal */ }
}
