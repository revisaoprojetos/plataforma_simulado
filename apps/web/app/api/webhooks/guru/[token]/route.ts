import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAdapter } from '@/lib/integracoes/registry'
import { resolverProviderCfg } from '@/lib/integracoes/config'
import { processarEvento } from '@/lib/integracoes/orquestrador'
import { dentroDoLimite } from '@/lib/integracoes/ratelimit'

/**
 * Webhook de entrada da Guru (digitalmanager.guru) — §6.2 do PLANO-INTEGRACOES.md.
 * URL por tenant: /api/webhooks/guru/<webhook_token>. O token resolve o tenant
 * (simulado_integracao_config.webhook_token) sem depender de sessão.
 *
 * Fluxo: valida assinatura → parseWebhook (adaptador) → grava evento IDEMPOTENTE
 * (event_id UNIQUE) → aplica no domínio (conceder/revogar) → responde 200 rápido.
 * Reentrega da Guru com mesmo event_id não reprocessa (idempotência).
 */
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const raw = await req.text()
  const headers = Object.fromEntries(req.headers.entries())

  const svc = createAdminClient()

  // 1) Resolve o tenant pelo token único.
  const { data: cfgRow } = await svc
    .from('simulado_integracao_config')
    .select('tenant_id, ativo')
    .eq('provider', 'guru').eq('webhook_token', token).maybeSingle()
  if (!cfgRow) return NextResponse.json({ error: 'token inválido' }, { status: 404 })
  if (!(cfgRow as any).ativo) return NextResponse.json({ error: 'integração pausada' }, { status: 403 })
  const tenantId = (cfgRow as any).tenant_id as string

  // Rate-limit por token (não-bloqueante): protege contra flood de um token vazado.
  if (!(await dentroDoLimite('guru', token, 300, 60_000))) {
    return NextResponse.json({ error: 'rate limit' }, { status: 429 })
  }

  const adapter = getAdapter('guru')
  if (!adapter?.parseWebhook) return NextResponse.json({ error: 'provedor sem parser' }, { status: 501 })

  let payload: unknown
  try { payload = raw ? JSON.parse(raw) : {} } catch { return NextResponse.json({ error: 'payload inválido' }, { status: 400 }) }

  // Ping de teste (botão "enviar evento de teste"): confirma URL+token sem efeito colateral.
  if ((payload as any)?.__test === true) return NextResponse.json({ ok: true, teste: true, tenant: tenantId })

  const cfg = await resolverProviderCfg(tenantId, 'guru')

  // 2) Valida: a Guru manda o api_token da conta no corpo → confere com o configurado.
  const segredo = cfg?.credenciais?.api_token || cfg?.credenciais?.webhook_secret || process.env.GURU_WEBHOOK_SECRET || ''
  if (segredo && adapter.validarWebhook && !adapter.validarWebhook(raw, headers, segredo)) {
    return NextResponse.json({ error: 'assinatura inválida (api_token)' }, { status: 401 })
  }

  // 3) Normaliza o evento.
  let evento
  try { evento = await adapter.parseWebhook(payload, headers, cfg ?? { provider: 'guru', baseUrl: '', credenciais: {} }) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }
  if (!evento) return NextResponse.json({ ok: true, ignorado: true }) // evento irrelevante

  // 4) Idempotência: grava o evento (event_id UNIQUE). Se já existe → 200 sem reprocessar.
  //    Guarda headers + query da requisição (para o pop-up de detalhe, estilo n8n).
  const query = Object.fromEntries(new URL(req.url).searchParams.entries())
  const base = { tenant_id: tenantId, provider: 'guru', event_id: evento.eventId, tipo: evento.tipo, status: 'recebido', payload }
  let insErr: any
  ;({ error: insErr } = await svc.from('simulado_integracao_eventos').insert({ ...base, headers: { headers, query } }))
  if (insErr && /headers|column|schema cache/i.test(insErr.message ?? '')) {
    ;({ error: insErr } = await svc.from('simulado_integracao_eventos').insert(base)) // coluna headers ainda não migrada
  }
  if (insErr) {
    if (/duplicate|unique|23505/i.test(insErr.message)) return NextResponse.json({ ok: true, jaRecebido: true })
    // falha ao gravar o log não deve impedir o processamento; segue.
  }

  // 5) Aplica no domínio (conceder/revogar) e marca o evento.
  try {
    const r = await processarEvento(tenantId, 'guru', evento)
    await svc.from('simulado_integracao_eventos')
      .update({ status: r.ok ? 'processado' : 'erro', erro: r.error ?? null, processado_em: new Date().toISOString() })
      .eq('provider', 'guru').eq('event_id', evento.eventId)
    return NextResponse.json({ ok: true, resultado: r })
  } catch (e) {
    await svc.from('simulado_integracao_eventos')
      .update({ status: 'erro', erro: (e as Error).message, processado_em: new Date().toISOString() })
      .eq('provider', 'guru').eq('event_id', evento.eventId)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
