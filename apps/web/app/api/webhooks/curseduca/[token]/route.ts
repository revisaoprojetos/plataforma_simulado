import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolverProviderCfg } from '@/lib/integracoes/config'
import { resolverCfg, executarImport } from '@/lib/curseduca/import-core'
import { dentroDoLimite } from '@/lib/integracoes/ratelimit'
import { registrarInbox } from '@/lib/integracoes/inbox'
import type { CurseducaCfg } from '@/lib/curseduca/client'

/**
 * Webhook de SINCRONIZAÇÃO da Curseduca por TENANT (igual ao padrão da Guru):
 * URL /api/webhooks/curseduca/<webhook_token>. O token resolve o tenant (sem env-secret).
 *
 * Curseduca é PULL: o POST dispara um import/sincronização dos grupos informados —
 * n8n/Curseduca chama isto quando um membro entra/sai. TODA requisição é logada no inbox
 * (aba Recebidos, fonte "curseduca"). Corpo: { grupos:[<idGrupo>], destino?, sincronizar? }.
 */
export const dynamic = 'force-dynamic'

async function resolverTenant(token: string) {
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_integracao_config').select('tenant_id, ativo').eq('provider', 'curseduca').eq('webhook_token', token).maybeSingle()
  return { tenantId: (data as any)?.tenant_id ?? null, ativo: (data as any)?.ativo ?? false }
}

/** Monta o CurseducaCfg a partir do sistema novo (integracao_config) ou legado (resolverCfg+env). */
async function cfgDoTenant(tenantId: string): Promise<CurseducaCfg | null> {
  const pcfg = await resolverProviderCfg(tenantId, 'curseduca', { ignorarAtivo: true })
  const c = pcfg?.credenciais
  if (c?.api_key && c?.usuario && c?.senha) return { base: pcfg!.baseUrl, apiKey: c.api_key, user: c.usuario, pass: c.senha }
  return resolverCfg(tenantId) // fallback: simulado_curseduca_config (legado) → .env designado
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const headers = Object.fromEntries(req.headers.entries())
  const query = Object.fromEntries(new URL(req.url).searchParams.entries())
  const ip = headers['x-forwarded-for']?.split(',')[0]?.trim() || null
  const { tenantId } = await resolverTenant(token)
  await registrarInbox({ provider: 'curseduca', fonte: 'curseduca', metodo: 'GET', token, tenantId, ip, headers, query, status: 200, resultado: tenantId ? 'ping (GET)' : 'ping — token inválido' })
  return NextResponse.json({ ok: true, endpoint: 'curseduca-sync', reconhecido: !!tenantId, dica: 'POST { grupos:[ids], sincronizar? } para importar/sincronizar.' })
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const raw = await req.text()
  const headers = Object.fromEntries(req.headers.entries())
  const query = Object.fromEntries(new URL(req.url).searchParams.entries())
  const ip = headers['x-forwarded-for']?.split(',')[0]?.trim() || null
  let tenantId: string | null = null

  const finish = async (status: number, body: any, resultado: string) => {
    await registrarInbox({ provider: 'curseduca', fonte: 'curseduca', metodo: 'POST', token, tenantId, ip, headers, query, raw, status, resultado })
    return NextResponse.json(body, { status })
  }

  const t = await resolverTenant(token)
  if (!t.tenantId) return finish(404, { ok: false, message: 'token inválido' }, 'token inválido')
  const tid: string = t.tenantId
  tenantId = tid
  if (!t.ativo) return finish(403, { ok: false, message: 'integração pausada' }, 'integração pausada (ative para sincronizar)')

  if (!(await dentroDoLimite('curseduca-sync', token, 120, 60_000))) return finish(429, { ok: false, message: 'rate limit' }, 'rate limit')

  let body: any
  try { body = raw ? JSON.parse(raw) : {} } catch { return finish(400, { ok: false, message: 'JSON inválido' }, 'payload não é JSON válido') }

  const grupos = Array.isArray(body?.grupos) ? body.grupos.map(Number).filter((n: number) => Number.isFinite(n)) : []
  if (!grupos.length) return finish(400, { ok: false, message: 'Informe grupos[] (ids dos grupos Curseduca a sincronizar).' }, 'sem grupos[] no corpo')

  const cfg = await cfgDoTenant(tid)
  if (!cfg) return finish(400, { ok: false, message: 'Credenciais Curseduca não configuradas (Integrações → Curseduca).' }, 'credenciais Curseduca ausentes')

  try {
    const resultado = await executarImport({ tenantId: tid, cfg }, grupos, body?.destino ?? { tipo: 'nenhum' }, !!body?.sincronizar, Number.MAX_SAFE_INTEGER)
    return finish(200, { ok: true, resultado }, `sincronizado: ${grupos.length} grupo(s)`)
  } catch (e: any) {
    return finish(500, { ok: false, message: e?.message ?? 'Falha na importação.' }, `erro: ${e?.message ?? 'import'}`)
  }
}
