import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAdapter } from '@/lib/integracoes/registry'
import { processarEvento } from '@/lib/integracoes/orquestrador'
import type { Provider } from '@/lib/integracoes/tipos'

export const dynamic = 'force-dynamic'

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
    // Lock: assume só se ainda estiver recebido/erro (evita corrida entre réplicas).
    const { data: lock } = await svc.from('simulado_integracao_eventos')
      .update({ status: 'processando' }).eq('id', ev.id).in('status', ['recebido', 'erro']).select('id')
    if (!lock?.length) continue

    try {
      const adapter = getAdapter(ev.provider as Provider)
      const evento = adapter?.parseWebhook ? await adapter.parseWebhook(ev.payload, {}, { provider: ev.provider, baseUrl: '', credenciais: {} }) : null
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
