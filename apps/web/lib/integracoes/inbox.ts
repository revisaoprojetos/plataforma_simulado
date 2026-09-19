import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import type { Provider } from '@/lib/integracoes/tipos'

// Headers que NÃO devem ser persistidos em claro (contêm credenciais/segredos que a origem manda).
const HEADERS_SENSIVEIS = /^(authorization|cookie|x-.*-secret|x-guru-signature|x-webhook-secret|x-api-key|api_key|api_token)$/i
// Chaves de segredo dentro do CORPO (a Guru manda o Account Token no body como `api_token`).
const CHAVES_SEGREDO = new Set(['api_token', 'token', 'secret', 'webhook_secret', 'password', 'senha', 'api_key'])

function redigirHeaders(h?: Record<string, string>): Record<string, string> {
  if (!h) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(h)) out[k] = HEADERS_SENSIVEIS.test(k) ? '«redigido»' : v
  return out
}

/** Redige recursivamente chaves de segredo em qualquer objeto/array (para o body_json exibido). */
function redigirCorpo(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redigirCorpo)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = CHAVES_SEGREDO.has(k.toLowerCase()) ? '«redigido»' : redigirCorpo(val)
    }
    return out
  }
  return v
}

/**
 * Registra no inbox CRU (simulado_webhook_inbox) toda requisição que bate na URL do webhook.
 * NUNCA lança: falha de log não pode derrubar o webhook. Se a tabela ainda não existe
 * (migration pendente), simplesmente ignora.
 */
export async function registrarInbox(dados: {
  provider: Provider | string
  fonte?: string | null
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
    if (dados.raw) { try { body_json = redigirCorpo(JSON.parse(dados.raw)) } catch { body_json = null } }
    // body_raw redigido: mascara o valor do api_token/token no JSON cru (a Guru manda o Account Token aí).
    const body_raw = dados.raw ? dados.raw.replace(/("(?:api_token|token|secret|webhook_secret|api_key|senha|password)"\s*:\s*")[^"]*(")/gi, '$1«redigido»$2') : null
    const svc = createAdminClient()
    const linha: Record<string, unknown> = {
      tenant_id: dados.tenantId ?? null,
      provider: dados.provider,
      fonte: dados.fonte ?? dados.provider,
      metodo: dados.metodo,
      token: dados.token ?? null,
      ip: dados.ip ?? null,
      headers: redigirHeaders(dados.headers),
      query: dados.query ?? {},
      body_raw,
      body_json,
      status_resp: dados.status,
      resultado: dados.resultado,
    }
    const { error } = await svc.from('simulado_webhook_inbox').insert(linha)
    // Coluna `fonte` pode não existir ainda (migration 3 pendente) → regrava sem ela.
    if (error && /fonte|column|schema cache/i.test(error.message ?? '')) {
      delete linha.fonte
      await svc.from('simulado_webhook_inbox').insert(linha)
    }
  } catch { /* tabela pode não existir ainda / erro de log é não-fatal */ }
}
