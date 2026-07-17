import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAdapter } from '@/lib/integracoes/registry'
import { resolverProviderCfg } from '@/lib/integracoes/config'
import { processarEvento } from '@/lib/integracoes/orquestrador'
import { dentroDoLimite } from '@/lib/integracoes/ratelimit'
import { registrarInbox } from '@/lib/integracoes/inbox'

/**
 * Webhook de entrada da Guru (digitalmanager.guru) — §6.2 do PLANO-INTEGRACOES.md.
 * URL por tenant: /api/webhooks/guru/<webhook_token>. O token resolve o tenant
 * (simulado_integracao_config.webhook_token) sem depender de sessão.
 *
 * Fluxo: valida assinatura → parseWebhook (adaptador) → grava evento IDEMPOTENTE
 * (event_id UNIQUE) → aplica no domínio (conceder/revogar) → responde 200 rápido.
 * Reentrega da Guru com mesmo event_id não reprocessa (idempotência).
 *
 * TODA requisição (inclusive as que falham) é registrada no INBOX cru
 * (simulado_webhook_inbox) para inspeção na aba "Recebidos" — estilo n8n.
 */
export const dynamic = 'force-dynamic'

// GET: a Guru (ou você, no navegador) pode "pingar" a URL para conferir. Responde vivo e loga.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const headers = Object.fromEntries(req.headers.entries())
  const query = Object.fromEntries(new URL(req.url).searchParams.entries())
  const ip = headers['x-forwarded-for']?.split(',')[0]?.trim() || headers['x-real-ip'] || null
  const svc = createAdminClient()
  const { data: cfgRow } = await svc.from('simulado_integracao_config').select('tenant_id').eq('provider', 'guru').eq('webhook_token', token).maybeSingle()
  const tenantId = (cfgRow as any)?.tenant_id ?? null
  await registrarInbox({ provider: 'guru', fonte: 'guru', metodo: 'GET', token, tenantId, ip, headers, query, status: 200, resultado: tenantId ? 'ping (GET)' : 'ping — token inválido' })
  return NextResponse.json({ ok: true, endpoint: 'guru-webhook', reconhecido: !!tenantId, dica: 'Cadastre esta URL na Guru e envie um evento POST de compra/assinatura.' })
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const raw = await req.text()
  const headers = Object.fromEntries(req.headers.entries())
  const query = Object.fromEntries(new URL(req.url).searchParams.entries())
  const ip = headers['x-forwarded-for']?.split(',')[0]?.trim() || headers['x-real-ip'] || null

  const svc = createAdminClient()
  let tenantId: string | null = null

  // Loga a requisição CRUA + responde. Usado em todos os pontos de saída.
  const finish = async (status: number, body: any, resultado: string) => {
    await registrarInbox({ provider: 'guru', fonte: 'guru', metodo: 'POST', token, tenantId, ip, headers, query, raw, status, resultado })
    return NextResponse.json(body, { status })
  }

  // 1) Resolve o tenant pelo token único.
  const { data: cfgRow } = await svc
    .from('simulado_integracao_config')
    .select('tenant_id, ativo')
    .eq('provider', 'guru').eq('webhook_token', token).maybeSingle()
  if (!cfgRow) return finish(404, { error: 'token inválido' }, 'token inválido')
  tenantId = (cfgRow as any).tenant_id as string
  if (!(cfgRow as any).ativo) return finish(403, { error: 'integração pausada' }, 'integração pausada (ative para processar)')

  // Rate-limit por token (não-bloqueante): protege contra flood de um token vazado.
  if (!(await dentroDoLimite('guru', token, 300, 60_000))) {
    return finish(429, { error: 'rate limit' }, 'rate limit')
  }

  const adapter = getAdapter('guru')
  if (!adapter?.parseWebhook) return finish(501, { error: 'provedor sem parser' }, 'provedor sem parser')

  let payload: unknown
  try { payload = raw ? JSON.parse(raw) : {} } catch { return finish(400, { error: 'payload inválido' }, 'payload não é JSON válido') }

  // Ping de teste (botão "enviar evento de teste"): confirma URL+token sem efeito colateral.
  if ((payload as any)?.__test === true) return finish(200, { ok: true, teste: true, tenant: tenantId }, 'ping de teste')

  const cfg = await resolverProviderCfg(tenantId, 'guru', { ignorarAtivo: true })

  // 2) Valida a assinatura SÓ se o Account Token do webhook estiver configurado (webhook_secret).
  //    ATENÇÃO: o `api_token` que a Guru envia no CORPO é o ACCOUNT TOKEN (token da conta),
  //    DIFERENTE do User Token da API. Por isso NÃO validamos contra o User Token (daria 401
  //    sempre). Sem Account Token configurado, a segurança fica no token único da URL.
  const segredo = cfg?.credenciais?.webhook_secret || process.env.GURU_WEBHOOK_SECRET || ''
  if (segredo && adapter.validarWebhook && !adapter.validarWebhook(raw, headers, segredo)) {
    return finish(401, { error: 'assinatura inválida (api_token)' }, 'assinatura inválida (Account Token do corpo não confere)')
  }

  // 3) Normaliza o evento.
  let evento
  try { evento = await adapter.parseWebhook(payload, headers, cfg ?? { provider: 'guru', baseUrl: '', credenciais: {} }) }
  catch (e) { return finish(400, { error: (e as Error).message }, `erro no parse: ${(e as Error).message}`) }
  if (!evento) return finish(200, { ok: true, ignorado: true }, 'evento sem efeito no acesso (ignorado)')

  // 4) Idempotência: grava o evento (event_id UNIQUE). Se já existe → 200 sem reprocessar.
  const base = { tenant_id: tenantId, provider: 'guru', event_id: evento.eventId, tipo: evento.tipo, status: 'recebido', payload }
  let insErr: any
  ;({ error: insErr } = await svc.from('simulado_integracao_eventos').insert({ ...base, headers: { headers, query } }))
  if (insErr && /headers|column|schema cache/i.test(insErr.message ?? '')) {
    ;({ error: insErr } = await svc.from('simulado_integracao_eventos').insert(base)) // coluna headers ainda não migrada
  }
  if (insErr) {
    if (/duplicate|unique|23505/i.test(insErr.message)) return finish(200, { ok: true, jaRecebido: true }, 'evento repetido (já recebido)')
    // falha ao gravar o log de eventos não deve impedir o processamento; segue.
  }

  // 5) Aplica no domínio (conceder/revogar) e marca o evento.
  try {
    const r = await processarEvento(tenantId, 'guru', evento)
    await svc.from('simulado_integracao_eventos')
      .update({ status: r.ok ? 'processado' : 'erro', erro: r.error ?? null, processado_em: new Date().toISOString() })
      .eq('provider', 'guru').eq('event_id', evento.eventId)
    return finish(r.ok ? 200 : 500, { ok: r.ok, resultado: r }, r.ok ? `processado: ${evento.tipo}` : `erro ao aplicar: ${r.error ?? ''}`)
  } catch (e) {
    await svc.from('simulado_integracao_eventos')
      .update({ status: 'erro', erro: (e as Error).message, processado_em: new Date().toISOString() })
      .eq('provider', 'guru').eq('event_id', evento.eventId)
    return finish(500, { error: (e as Error).message }, `exceção: ${(e as Error).message}`)
  }
}
