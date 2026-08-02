import 'server-only'
import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Autenticação por API key (para integrações/API pública). O cliente manda
 * `Authorization: Bearer <chave>`; guardamos só o SHA256 da chave (nunca a chave em claro).
 * Valida: chave existe, não revogada, não expirada e — se `escopo` for pedido — tem o escopo.
 * Best-effort: carimba `ultimo_uso`. Retorna o tenant + escopos, ou um erro tipado.
 */
export type ApiKeyOk = { ok: true; tenantId: string; escopos: string[]; keyId: string; nome: string | null }
export type ApiKeyErro = { ok: false; status: 401 | 403; error: string }

function extrairChave(req: Request): string | null {
  const auth = req.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (m) return m[1].trim()
  // Alternativa: header dedicado (alguns clientes não usam Authorization).
  return req.headers.get('x-api-key')?.trim() || null
}

export async function validarApiKey(req: Request, escopo?: string): Promise<ApiKeyOk | ApiKeyErro> {
  const chave = extrairChave(req)
  if (!chave) return { ok: false, status: 401, error: 'API key ausente. Use Authorization: Bearer <chave>.' }

  const keyHash = createHash('sha256').update(chave).digest('hex')
  const svc = createAdminClient()
  const { data, error } = await svc
    .from('simulado_api_keys')
    .select('id, tenant_id, escopos, revogada, expira_em, nome')
    .eq('key_hash', keyHash)
    .maybeSingle()

  if (error || !data) return { ok: false, status: 401, error: 'API key inválida.' }
  if ((data as any).revogada) return { ok: false, status: 401, error: 'API key revogada.' }
  const expira = (data as any).expira_em ? new Date((data as any).expira_em) : null
  if (expira && expira < new Date()) return { ok: false, status: 401, error: 'API key expirada.' }

  const escopos: string[] = Array.isArray((data as any).escopos) ? (data as any).escopos : []
  if (escopo && !escopos.includes(escopo)) {
    return { ok: false, status: 403, error: `API key sem o escopo necessário: ${escopo}.` }
  }

  // Carimba último uso (não bloqueia se a coluna/atualização falhar).
  try { await svc.from('simulado_api_keys').update({ ultimo_uso: new Date().toISOString() }).eq('id', (data as any).id) } catch { /* best-effort */ }

  return { ok: true, tenantId: (data as any).tenant_id, escopos, keyId: (data as any).id, nome: (data as any).nome ?? null }
}
