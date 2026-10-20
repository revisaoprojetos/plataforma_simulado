import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/server'

// Drenador do OUTBOX (A6/Fase 7). O evento já é gravado na mutação (reconciliacao/documentos); aqui ele
// é consumido de forma assíncrona e idempotente. Protegido por segredo de cron (header x-cron-secret ou
// ?secret=) — pode ser chamado por um cron do VPS ou pelo worker BullMQ. Marca processado_em ao fim.
// Ganchos por tipo (notificação/IA) ficam centralizados aqui, fora do caminho da request do usuário.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function autorizado(req: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET || process.env.CONTEUDO_CRON_SECRET
  if (!esperado) return false // fail-closed quando não configurado
  const dado = req.headers.get('x-cron-secret') || '' // só por header (não vaza em log/referrer como ?secret=)
  const a = Buffer.from(dado), b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function tratar(tipo: string, _payload: any): Promise<void> {
  // Ganchos futuros: 'anotacao.reconciliar' c/ revisao → fila de revisão/alinhamento por IA;
  // 'aviso.criado' → notificação in-app ao aluno; 'documento.*' → invalidação de cache.
  switch (tipo) {
    case 'documento.importado':
    case 'documento.atualizado':
    case 'anotacao.reconciliar':
    case 'aviso.criado':
    default:
      return // no-op idempotente por ora; o efeito principal já ocorreu na transação de origem
  }
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  const limite = Math.min(Number(new URL(req.url).searchParams.get('limite')) || 100, 500)
  const svc = createAdminClient()
  const { data: eventos, error } = await svc.from('simulado_conteudo_outbox')
    .select('id, tipo, payload').is('processado_em', null).order('criado_em', { ascending: true }).limit(limite)
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  let ok = 0
  for (const ev of eventos ?? []) {
    try { await tratar(ev.tipo, ev.payload); await svc.from('simulado_conteudo_outbox').update({ processado_em: new Date().toISOString() }).eq('id', ev.id); ok++ }
    catch (e) { console.error('[outbox] evento', ev.id, (e as Error).message) }
  }
  return NextResponse.json({ ok: true, processados: ok, total: (eventos ?? []).length })
}
