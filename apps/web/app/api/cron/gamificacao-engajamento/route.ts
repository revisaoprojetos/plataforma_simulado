import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { diaLocal, diaAnterior } from '@/lib/gamificacao/datas'
import { resolverEngajamento } from '@/lib/gamificacao/engajamento-tipos'
import { dispararEngajamento } from '@/lib/gamificacao/engajamento'

/**
 * POST /api/cron/gamificacao-engajamento — dispara o webhook de INATIVIDADE: aluno que parou de entrar
 * exatamente `inativo.dias` dia(s) depois da última atividade (chamada para voltar). Sequência/marcos
 * disparam em tempo real no registrarAtividade. Idempotente pelo log. Protegido por CRON_SECRET.
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
    const { data: configs } = await svc
      .from('simulado_gamificacao_config')
      .select('tenant_id, timezone, ativo, xp_regras')
      .eq('ativo', true)

    let enviados = 0
    for (const c of (configs ?? []) as any[]) {
      const eng = resolverEngajamento(c.xp_regras?.engajamento)
      if (!eng.inativo.ativo) continue
      const dias = Math.max(1, eng.inativo.dias ?? 1)

      // Alvo = hoje - `dias`: quem teve a última atividade nesse dia está inativo há exatamente `dias`.
      let alvo = diaLocal(c.timezone)
      for (let i = 0; i < dias; i++) alvo = diaAnterior(alvo)

      const { data: alunos } = await svc
        .from('simulado_gamificacao_estudante')
        .select('estudante_id, streak_atual, streak_maior, ultimo_dia_ativo')
        .eq('tenant_id', c.tenant_id)
        .eq('ultimo_dia_ativo', alvo)
        .limit(2000)

      for (const a of (alunos ?? []) as any[]) {
        const ok = await dispararEngajamento(svc, {
          tenantId: c.tenant_id,
          estudanteId: a.estudante_id,
          tipo: 'inativo',
          ref: `inativo-${a.ultimo_dia_ativo}`,
          gatilho: eng.inativo,
          streakAtual: a.streak_atual ?? 0,
          streakMaior: a.streak_maior ?? 0,
          diasInativo: dias,
        })
        if (ok) enviados++
      }
    }
    return NextResponse.json({ ok: true, enviados })
  } catch (e: any) {
    console.error('[cron gamificacao-engajamento] erro:', e?.message)
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
