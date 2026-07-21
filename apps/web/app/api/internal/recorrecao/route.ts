import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { executarRecorrecao, type RecorrecaoJob } from '@/lib/simulado/recorrecao'

export const dynamic = 'force-dynamic'

/**
 * Rota INTERNA de re-correção (chamada só pelo worker BullMQ, protegida por CRON_SECRET).
 * Roda a lógica canônica de recorrecao.ts — a permissão já foi validada na server action
 * antes de enfileirar. Mesmo padrão dos crons (/api/cron/*).
 */
function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return h === segredo
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 })
  let job: RecorrecaoJob
  try { job = (await req.json()) as RecorrecaoJob } catch { return NextResponse.json({ ok: false, error: 'Payload inválido.' }, { status: 400 }) }
  if (!job?.tenantId || !job?.simuladoId || !job?.questaoId || !job?.tipo) {
    return NextResponse.json({ ok: false, error: 'Campos obrigatórios ausentes.' }, { status: 400 })
  }
  try {
    const svc = createAdminClient()
    const r = await executarRecorrecao(svc, job)
    // jaAplicado (idempotência) conta como sucesso p/ o worker não retentar à toa.
    return NextResponse.json(r, { status: r.ok || r.jaAplicado ? 200 : 400 })
  } catch (e: any) {
    console.error('[internal recorrecao] erro:', e?.message)
    return NextResponse.json({ ok: false, error: e?.message ?? 'Falha.' }, { status: 500 })
  }
}
