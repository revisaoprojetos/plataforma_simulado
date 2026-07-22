import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { computarOnlinePorSimulado } from '@/lib/simulado/ao-vivo'
import { criarSubscriber, canalAoVivo } from '@/lib/realtime/pubsub'

export const dynamic = 'force-dynamic'

/**
 * SSE do "fazendo agora" do BOARD (Fase 2, follow-up). Uma conexão para vários simulados:
 * `?ids=id1,id2,...`. Assina os canais `aovivo:{id}` (os mesmos que os publishers já emitem
 * em entrar/finalizar/auto-encerrar) e reemite o mapa { simuladoId: online } com debounce +
 * baseline de 10s + heartbeat. Sem Redis, a UI cai no polling.
 */
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  const tenantId = access.tenantId
  if (!accessCan(access, 'simulados:view') || !tenantId) return new Response('Sem permissão.', { status: 403 })

  const ids = [...new Set((new URL(req.url).searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 100)
  if (!ids.length) return new Response('ids obrigatório', { status: 400 })

  const svc = createAdminClient()
  // computarOnlinePorSimulado filtra por tenant_id → ids de outro tenant retornam 0 (sem vazamento).
  const inicial = await computarOnlinePorSimulado(svc, tenantId, ids)

  const encoder = new TextEncoder()
  const sub = criarSubscriber()

  const stream = new ReadableStream({
    start(controller) {
      let fechado = false, ultimoEnvio = 0, pendente = false
      const enviar = (d: unknown) => { if (fechado) return; try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`)) } catch { /* */ } }
      enviar(inicial)

      const recompute = async () => {
        const agora = Date.now()
        if (agora - ultimoEnvio < 2000) { pendente = true; return }
        ultimoEnvio = agora; pendente = false
        try { enviar(await computarOnlinePorSimulado(svc, tenantId, ids)) } catch { /* mantém a conexão */ }
      }

      if (sub) {
        sub.subscribe(...ids.map(canalAoVivo)).catch(() => {})
        sub.on('message', () => { void recompute() })
      }

      const hb = setInterval(() => { if (!fechado) { try { controller.enqueue(encoder.encode(': ping\n\n')) } catch { /* */ } } }, 25_000)
      const flush = setInterval(() => { if (pendente) void recompute() }, 2_500)
      const baseline = setInterval(() => { void recompute() }, 10_000)

      const cleanup = () => {
        if (fechado) return
        fechado = true
        clearInterval(hb); clearInterval(flush); clearInterval(baseline)
        try { sub?.disconnect() } catch { /* */ }
        try { controller.close() } catch { /* */ }
      }
      req.signal.addEventListener('abort', cleanup)
    },
    cancel() { try { sub?.disconnect() } catch { /* */ } },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
