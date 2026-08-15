import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getGamConfig } from '@/lib/gamificacao'
import { ligaParaXp } from '@/lib/gamificacao/niveis'
import { leaderboardLiga, leaderboardGeral, rankingPeriodo, posicaoNaLiga, posicaoGeral, top10ComVoce, inicioDaSemanaISO, inicioDoMesISO } from '@/lib/gamificacao/leitura'

// GET /api/aluno/gamificacao/ranking
//  - modo antigo: ?escopo=total|semana|mes (usado no hero da Início)
//  - modo liga: ?ambito=liga|geral (ranking da tela de Ligas por XP total — sem temporada, + barra)
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false }, { status: 401 })
  const escopo = req.nextUrl.searchParams.get('escopo') ?? 'total'
  const ambito = req.nextUrl.searchParams.get('ambito') // presença = modo Ligas
  try {
    const svc = await createServiceClient()
    const config = await getGamConfig(svc, sessao.tenantId)
    if (!config?.ativo) return NextResponse.json({ ok: true, itens: [], liga: null, maxXp: 0 })

    // ── Modo Ligas: âmbito (minha liga | geral) por XP TOTAL (sem temporada) + barra ──
    if (ambito === 'liga' || ambito === 'geral') {
      const { data: row } = await svc.from('simulado_gamificacao_estudante').select('xp_total, liga').eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).maybeSingle()
      const meuXp = row?.xp_total ?? 0
      let itens: any[]
      if (ambito === 'liga') {
        const ligaId: string = row?.liga ?? ligaParaXp(meuXp, config.ligas).id
        const top = await leaderboardLiga(svc, sessao.tenantId, ligaId, sessao.estudanteId, 10)
        itens = top
        if (top.length >= 10 && !top.some((t) => t.eu)) {
          const pos = await posicaoNaLiga(svc, sessao.tenantId, ligaId, meuXp)
          itens = [...top.slice(0, 9), { estudanteId: sessao.estudanteId, nome: sessao.nome, xp: meuXp, posicao: pos, eu: true }]
        }
      } else {
        const top = await leaderboardGeral(svc, sessao.tenantId, sessao.estudanteId, 10)
        itens = top
        if (top.length >= 10 && !top.some((t) => t.eu)) {
          const pos = await posicaoGeral(svc, sessao.tenantId, meuXp)
          itens = [...top.slice(0, 9), { estudanteId: sessao.estudanteId, nome: sessao.nome, xp: meuXp, posicao: pos, eu: true }]
        }
      }
      const maxXp = itens.reduce((m, i) => Math.max(m, i.xp), 0)
      itens = await enriquecerAvatares(svc, itens)
      return NextResponse.json({ ok: true, itens, maxXp, ambito })
    }

    let itens: any[] = []
    let liga: string | null = null
    let escopoOut = escopo

    if (escopo === 'semana' || escopo === 'mes') {
      const desde = escopo === 'semana' ? inicioDaSemanaISO() : inicioDoMesISO()
      // Busca a lista completa (limite alto) p/ achar a posição real do aluno e recortar top 9 + você.
      const todos = await rankingPeriodo(svc, sessao.tenantId, desde, sessao.estudanteId, 5000)
      itens = top10ComVoce(todos, sessao.estudanteId)
    } else {
      // total: dentro da liga (tier) do aluno — top 10; se o aluno não estiver nele, top 9 + você.
      const { data: row } = await svc.from('simulado_gamificacao_estudante').select('xp_total, liga').eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).maybeSingle()
      const ligaId: string = row?.liga ?? ligaParaXp(row?.xp_total ?? 0, config.ligas).id
      liga = ligaId
      const top = await leaderboardLiga(svc, sessao.tenantId, ligaId, sessao.estudanteId, 10)
      itens = top
      if (top.length >= 10 && !top.some((t) => t.eu) && row) {
        const pos = await posicaoNaLiga(svc, sessao.tenantId, ligaId, row.xp_total ?? 0)
        itens = [...top.slice(0, 9), { estudanteId: sessao.estudanteId, nome: sessao.nome, xp: row.xp_total ?? 0, posicao: pos, eu: true }]
      }
      escopoOut = 'total'
    }

    itens = await enriquecerAvatares(svc, itens)
    return NextResponse.json({ ok: true, itens, liga, escopo: escopoOut })
  } catch {
    return NextResponse.json({ ok: true, itens: [] })
  }
}

/** Enriquece cada item com avatar + cor atrás da foto (tolerante a colunas ausentes). */
async function enriquecerAvatares(svc: any, itens: any[]): Promise<any[]> {
  const ids = [...new Set(itens.map((i) => i.estudanteId).filter(Boolean))]
  if (!ids.length) return itens
  let perfis: any[] = []
  const rp = await svc.from('simulado_estudantes').select('id, avatar, perfil_avatar_cor').in('id', ids)
  if (!rp.error) perfis = rp.data ?? []
  else { const rp2 = await svc.from('simulado_estudantes').select('id, avatar').in('id', ids); perfis = rp2.data ?? [] }
  const mapa = new Map(perfis.map((p) => [p.id, p]))
  return itens.map((i) => { const p = mapa.get(i.estudanteId); return { ...i, avatar: p?.avatar ?? null, avatarCor: p?.perfil_avatar_cor ?? null } })
}
