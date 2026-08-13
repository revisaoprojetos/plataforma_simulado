import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { diaLocal, diaAnterior } from '@/lib/gamificacao/datas'

// POST /api/cron/gamificacao-streak — zera a sequência de quem não teve atividade "ontem".
// Cosmético (o registrarAtividade já autocorrige na próxima atividade), mantém o streak exibido
// honesto antes do aluno voltar. Protegido por CRON_SECRET. Roda por tenant (fuso próprio).
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
    const { data: configs } = await svc.from('simulado_gamificacao_config').select('tenant_id, timezone, ativo, xp_regras').eq('ativo', true)
    let zerados = 0
    for (const c of (configs ?? []) as any[]) {
      const tol = Math.max(0, c.xp_regras?.streak?.tolerancia_dias ?? 0)
      // Limite = hoje - (1 + tolerância). Sem atividade desde então → sequência quebrada.
      let limite = diaAnterior(diaLocal(c.timezone))
      for (let i = 0; i < tol; i++) limite = diaAnterior(limite)
      const { data: upd } = await svc
        .from('simulado_gamificacao_estudante')
        .update({ streak_atual: 0, atualizado_em: new Date().toISOString() })
        .eq('tenant_id', c.tenant_id)
        .gt('streak_atual', 0)
        .lt('ultimo_dia_ativo', limite)
        .select('id')
      zerados += upd?.length ?? 0
    }
    return NextResponse.json({ ok: true, zerados })
  } catch (e: any) {
    console.error('[cron gamificacao-streak] erro:', e?.message)
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
