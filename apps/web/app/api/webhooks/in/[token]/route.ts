import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { dentroDoLimite } from '@/lib/integracoes/ratelimit'
import { registrarInbox } from '@/lib/integracoes/inbox'
import { avaliarWebhook } from '@/lib/integracoes/webhook-seguranca'
import { segredoWebhookDoTenant } from '@/lib/integracoes/webhook-config'
import { getAdapter } from '@/lib/integracoes/registry'

/**
 * Receptor GENÉRICO de webhooks (multi-fonte) — /api/webhooks/in/<token>?fonte=<nome>.
 *
 * Aceita requisições de QUALQUER origem (Hotmart, Kiwify, Eduzz, n8n, Zapier, etc.),
 * não só Guru/Curseduca. O <token> identifica o tenant (qualquer webhook_token do tenant
 * em simulado_integracao_config). A `?fonte=` rotula a origem para a aba "Recebidos".
 *
 * É um RECEPTOR PURO: registra tudo no inbox e responde 200. O processamento por fonte
 * (conceder/revogar acesso) fica nos endpoints dedicados de cada provedor.
 */
export const dynamic = 'force-dynamic'

async function resolverTenant(token: string): Promise<{ tenantId: string | null; provider: string | null }> {
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_integracao_config').select('tenant_id, provider').eq('webhook_token', token).limit(1).maybeSingle()
  return { tenantId: (data as any)?.tenant_id ?? null, provider: (data as any)?.provider ?? null }
}

function metaReq(req: Request) {
  const headers = Object.fromEntries(req.headers.entries())
  const query = Object.fromEntries(new URL(req.url).searchParams.entries())
  const ip = headers['x-forwarded-for']?.split(',')[0]?.trim() || headers['x-real-ip'] || null
  const fonte = (query.fonte || query.source || '').toString().trim().slice(0, 60) || null
  return { headers, query, ip, fonte }
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { headers, query, ip, fonte } = metaReq(req)
  const { tenantId, provider } = await resolverTenant(token)
  const prov = fonte || provider || 'generico'
  await registrarInbox({ provider: prov, fonte: prov, metodo: 'GET', token, tenantId, ip, headers, query, status: 200, resultado: tenantId ? 'ping (GET)' : 'ping — token não reconhecido' })
  return NextResponse.json({ ok: true, endpoint: 'webhook-in', fonte: prov, reconhecido: !!tenantId, dica: 'Envie um POST com o corpo do evento. Use ?fonte=<nome> para rotular a origem.' })
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const raw = await req.text()
  const { headers, query, ip, fonte } = metaReq(req)
  const { tenantId, provider } = await resolverTenant(token)
  const prov = fonte || provider || 'generico'

  // Token inválido: ainda registra (com tenant null) para você ver tentativas, mas responde 404.
  if (!tenantId) {
    await registrarInbox({ provider: prov, fonte: prov, metodo: 'POST', token, tenantId: null, ip, headers, query, raw, status: 404, resultado: 'token não reconhecido' })
    return NextResponse.json({ error: 'token inválido' }, { status: 404 })
  }

  // Rate-limit por token (não-bloqueante) contra flood.
  if (!(await dentroDoLimite('webhook-in', token, 600, 60_000))) {
    await registrarInbox({ provider: prov, fonte: prov, metodo: 'POST', token, tenantId, ip, headers, query, raw, status: 429, resultado: 'rate limit' })
    return NextResponse.json({ error: 'rate limit' }, { status: 429 })
  }

  // Autenticidade (compatível): com segredo do provedor configurado → exige HMAC/segredo; sem segredo → aceita com AVISO
  // (a menos que `webhook_estrito`). Guru: também aceita o Account Token do corpo (formato nativo dele).
  const provCfg = (provider === 'guru' || provider === 'curseduca') ? provider : null
  let aviso = ''
  if (provCfg) {
    const seg = await segredoWebhookDoTenant(tenantId, provCfg)
    const v = avaliarWebhook({ raw, headers, segredo: seg.segredo, estrito: seg.estrito, validarCustom: getAdapter(provCfg)?.validarWebhook })
    if (!v.ok) {
      await registrarInbox({ provider: prov, fonte: prov, metodo: 'POST', token, tenantId, ip, headers, query, raw, status: 401, resultado: `webhook rejeitado: ${v.motivo}` })
      return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
    }
    if (v.aviso) aviso = ` [${v.aviso}]`
  }

  await registrarInbox({ provider: prov, fonte: prov, metodo: 'POST', token, tenantId, ip, headers, query, raw, status: 200, resultado: `recebido${aviso}` })
  return NextResponse.json({ ok: true, recebido: true, fonte: prov })
}
