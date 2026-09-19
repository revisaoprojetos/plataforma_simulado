import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAdapter } from '@/lib/integracoes/registry'
import { processarEvento } from '@/lib/integracoes/orquestrador'
import { resolverProviderCfg } from '@/lib/integracoes/config'
import type { Provider } from '@/lib/integracoes/tipos'

export const dynamic = 'force-dynamic'

// Eventos travados em `processando` há mais que isto voltam a ser elegíveis (o tick que os pegou morreu).
const LOCK_TTL_MIN = 15

/**
 * Reprocessa eventos de webhook (simulado_integracao_eventos) que ficaram `recebido`
 * (o webhook logou mas não concluiu) ou deram `erro` — resiliência para a Guru.
 * Protegido por CRON_SECRET; chamado pelo worker. Idempotente (lock por status).
 * Só pega eventos recentes (48h) para não repetir eternamente falhas permanentes.
 */
function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return h === segredo
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  const svc = createAdminClient()

  // 0) Recupera eventos presos: `processando` com `locked_at` velho → volta p/ `erro` (reelegível).
  // Tolerante à coluna `locked_at` ausente (pré-migração) — nesse caso só não há recuperação.
  try {
    const corte = new Date(Date.now() - LOCK_TTL_MIN * 60_000).toISOString()
    await svc.from('simulado_integracao_eventos').update({ status: 'erro', erro: 'lock expirado (tick anterior interrompido)' }).eq('status', 'processando').lt('locked_at', corte)
  } catch { /* coluna locked_at ausente → sem recuperação até migrar */ }

  const desde = new Date(Date.now() - 48 * 3600_000).toISOString()
  const { data: eventos } = await svc
    .from('simulado_integracao_eventos')
    .select('id, tenant_id, provider, payload, status')
    .in('status', ['recebido', 'erro'])
    .gte('recebido_em', desde)
    .order('recebido_em', { ascending: true })
    .limit(50)

  let processados = 0, erros = 0, ignorados = 0
  for (const ev of (eventos ?? []) as any[]) {
    // Lock: assume só se ainda estiver recebido/erro (evita corrida entre réplicas). Carimba locked_at
    // p/ a recuperação de lock preso; tolerante se a coluna ainda não foi migrada.
    let lockRes = await svc.from('simulado_integracao_eventos')
      .update({ status: 'processando', locked_at: new Date().toISOString() }).eq('id', ev.id).in('status', ['recebido', 'erro']).select('id')
    if (lockRes.error && /locked_at|column/i.test(lockRes.error.message)) {
      lockRes = await svc.from('simulado_integracao_eventos').update({ status: 'processando' }).eq('id', ev.id).in('status', ['recebido', 'erro']).select('id')
    }
    if (!lockRes.data?.length) continue

    try {
      const adapter = getAdapter(ev.provider as Provider)
      // Resolve a cfg COM o mapa dinâmico do tenant — reprocessar com cfg vazia perderia o mapa_json
      // e normalizaria pelos padrões, podendo marcar como "ignorado" um evento que o webhook processou.
      const cfg = (await resolverProviderCfg(ev.tenant_id, ev.provider as Provider, { ignorarAtivo: true })) ?? { provider: ev.provider, baseUrl: '', credenciais: {} }
      const evento = adapter?.parseWebhook ? await adapter.parseWebhook(ev.payload, {}, cfg) : null
      if (!evento) {
        await svc.from('simulado_integracao_eventos').update({ status: 'ignorado', processado_em: new Date().toISOString() }).eq('id', ev.id)
        ignorados++; continue
      }
      const r = await processarEvento(ev.tenant_id, ev.provider as Provider, evento)
      await svc.from('simulado_integracao_eventos')
        .update({ status: r.ok ? 'processado' : 'erro', erro: r.error ?? null, processado_em: new Date().toISOString() }).eq('id', ev.id)
      if (r.ok) processados++; else erros++
    } catch (e: any) {
      await svc.from('simulado_integracao_eventos').update({ status: 'erro', erro: e?.message ?? 'Falha inesperada.' }).eq('id', ev.id)
      erros++
    }
  }

  return NextResponse.json({ ok: true, processados, erros, ignorados })
}
