import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { computarResumoAoVivo } from '@/lib/simulado/ao-vivo'
import { criarSubscriber, canalAoVivo } from '@/lib/realtime/pubsub'

export const dynamic = 'force-dynamic'

/**
 * SSE do painel "Ao Vivo" (Fase 2). Envia um snapshot inicial, depois reemite o resumo
 * sempre que algo muda (sinal via Redis pub/sub — entrar/finalizar/auto-encerrar), com
 * debounce; um recálculo-base a cada 10s serve de rede de segurança (sem Redis). Heartbeat
 * a cada 25s mantém a conexão viva (abaixo do read_timeout do proxy).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ simuladoId: string }> }) {
  const { simuladoId } = await params

  // Auth: mesma regra do painel (permissão simulados:view + simulado do tenant).
  const access = await getCurrentAccess()
  if (!accessCan(access, 'simulados:view')) return new Response('Sem permissão.', { status: 403 })
  const svc = createAdminClient()
  const { data: sim } = await svc.from('simulado_simulados').select('tenant_id').eq('id', simuladoId).maybeSingle()
  if (!sim) return new Response('Simulado não encontrado.', { status: 404 })
  if (access.tenantId && (sim as any).tenant_id && (sim as any).tenant_id !== access.tenantId) return new Response('Sem acesso.', { status: 403 })

  const inicial = await computarResumoAoVivo(svc, simuladoId)

  const encoder = new TextEncoder()
  const sub = criarSubscriber()

  const stream = new ReadableStream({
    start(controller) {
      let fechado = false
      let ultimoEnvio = 0
      let pendente = false

      const enviar = (data: unknown) => {
        if (fechado) return
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch { /* stream fechado */ }
      }
      enviar(inicial)

      // Recalcula com debounce de 2s (rajada de eventos = 1 recálculo).
      const recompute = async () => {
        const agora = Date.now()
        if (agora - ultimoEnvio < 2000) { pendente = true; return }
        ultimoEnvio = agora; pendente = false
        try { enviar(await computarResumoAoVivo(svc, simuladoId)) } catch { /* melhor manter a conexão */ }
      }

      if (sub) {
        sub.subscribe(canalAoVivo(simuladoId)).catch(() => {})
        sub.on('message', () => { void recompute() })
      }

      const hb = setInterval(() => { if (!fechado) { try { controller.enqueue(encoder.encode(': ping\n\n')) } catch { /* */ } } }, 25_000)
      const flush = setInterval(() => { if (pendente) void recompute() }, 2_500)
      const baseline = setInterval(() => { void recompute() }, 10_000) // rede de segurança

      const cleanup = () => {
        if (fechado) return
        fechado = true
        clearInterval(hb); clearInterval(flush); clearInterval(baseline)
        try { sub?.disconnect() } catch { /* */ }
        try { controller.close() } catch { /* */ }
      }
      req.signal.addEventListener('abort', cleanup)
    },
    cancel() {
      try { sub?.disconnect() } catch { /* */ }
    },
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
