import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { avaliarEngajamentoLeituraInatividade } from '@/lib/gamificacao/engajamento-leitura'

/**
 * POST /api/cron/leitura-engajamento — dispara o webhook de INATIVIDADE da LEITURA (Lei Seca): aluno
 * que parou de concluir aula NO módulo exatamente `inativo.dias` dia(s) atrás. Sequência/marcos da
 * leitura disparam em tempo real ao concluir aula/quiz. Idempotente pelo log. Protegido por CRON_SECRET.
 */
export const dynamic = 'force-dynamic'

function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return h === segredo
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  try {
    const svc = createAdminClient()
    // Por tenant com gamificação ativa: cada WEBHOOK que assina leitura.inativo avalia SUAS regras
    // (dias próprios) e SEUS módulos, e dispara na sua URL. Idempotente pelo log.
    const { data: configs } = await svc
      .from('simulado_gamificacao_config')
      .select('tenant_id, timezone, ativo')
      .eq('ativo', true)

    let enviados = 0
    for (const c of (configs ?? []) as any[]) {
      enviados += await avaliarEngajamentoLeituraInatividade(svc, c.tenant_id, c.timezone || 'America/Sao_Paulo')
    }
    return NextResponse.json({ ok: true, enviados })
  } catch (e: any) {
    console.error('[cron leitura-engajamento] erro:', e?.message)
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
