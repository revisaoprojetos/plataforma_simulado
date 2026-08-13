import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getGamConfig } from '@/lib/gamificacao'
import { ligaParaXp } from '@/lib/gamificacao/niveis'
import { leaderboardLiga, rankingPeriodo, posicaoNaLiga, top10ComVoce, inicioDaSemanaISO, inicioDoMesISO } from '@/lib/gamificacao/leitura'

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
      // Busca a lista completa (limite alto) p/ achar a posição real do aluno e recortar top 9 + você.
      const todos = await rankingPeriodo(svc, sessao.tenantId, desde, sessao.estudanteId, 5000)
      const itens = top10ComVoce(todos, sessao.estudanteId)
      return NextResponse.json({ ok: true, itens, escopo })
    }
    // total: dentro da liga (tier) do aluno — top 10; se o aluno não estiver nele, top 9 + você.
    const { data: row } = await svc.from('simulado_gamificacao_estudante').select('xp_total, liga').eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).maybeSingle()
    const liga = row?.liga ?? ligaParaXp(row?.xp_total ?? 0, config.ligas).id
    const top = await leaderboardLiga(svc, sessao.tenantId, liga, sessao.estudanteId, 10)
    let itens = top
    if (top.length >= 10 && !top.some((t) => t.eu) && row) {
      const pos = await posicaoNaLiga(svc, sessao.tenantId, liga, row.xp_total ?? 0)
      itens = [...top.slice(0, 9), { estudanteId: sessao.estudanteId, nome: sessao.nome, xp: row.xp_total ?? 0, posicao: pos, eu: true }]
    }
    return NextResponse.json({ ok: true, itens, liga, escopo: 'total' })
  } catch {
    return NextResponse.json({ ok: true, itens: [] })
  }
}
