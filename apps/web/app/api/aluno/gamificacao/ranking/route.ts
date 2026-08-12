import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getGamConfig } from '@/lib/gamificacao'
import { ligaParaXp } from '@/lib/gamificacao/niveis'
import { leaderboardLiga, rankingPeriodo, inicioDaSemanaISO, inicioDoMesISO } from '@/lib/gamificacao/leitura'

// GET /api/aluno/gamificacao/ranking?escopo=total|semana|mes — leaderboard.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false }, { status: 401 })
  const escopo = req.nextUrl.searchParams.get('escopo') ?? 'total'
  try {
    const svc = await createServiceClient()
    const config = await getGamConfig(svc, sessao.tenantId)
    if (!config?.ativo) return NextResponse.json({ ok: true, itens: [], liga: null })

    if (escopo === 'semana' || escopo === 'mes') {
      const desde = escopo === 'semana' ? inicioDaSemanaISO() : inicioDoMesISO()
      const itens = await rankingPeriodo(svc, sessao.tenantId, desde, sessao.estudanteId)
      return NextResponse.json({ ok: true, itens, escopo })
    }
    // total: dentro da liga (tier) do aluno
    const { data: row } = await svc.from('simulado_gamificacao_estudante').select('xp_total, liga').eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).maybeSingle()
    const liga = row?.liga ?? ligaParaXp(row?.xp_total ?? 0, config.ligas).id
    const itens = await leaderboardLiga(svc, sessao.tenantId, liga, sessao.estudanteId)
    return NextResponse.json({ ok: true, itens, liga, escopo: 'total' })
  } catch {
    return NextResponse.json({ ok: true, itens: [] })
  }
}
