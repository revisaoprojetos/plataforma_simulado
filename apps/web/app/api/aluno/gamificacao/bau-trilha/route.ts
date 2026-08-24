import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getGamConfig } from '@/lib/gamificacao'
import { awardXp } from '@/lib/gamificacao/xp'
import { carregarTrilhasAluno } from '@/lib/aluno/trilhas'

// POST /api/aluno/gamificacao/bau-trilha — resgata o baú de uma trilha (grupo) totalmente concluída.
// Concede o XP da trilha de forma IDEMPOTENTE (ledger, origem 'chest', ref 'trilha:<grupo>') → só
// pontua UMA vez, mesmo que a rota seja chamada de novo.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false }, { status: 401 })

  let grupoId = ''
  try { const b = await req.json(); grupoId = String(b?.grupoId ?? '') } catch { /* ignore */ }
  if (!grupoId) return NextResponse.json({ ok: false, motivo: 'sem_grupo' }, { status: 400 })

  try {
    const svc = createAdminClient()
    const config = await getGamConfig(svc, sessao.tenantId)
    if (!config?.ativo) return NextResponse.json({ ok: false, motivo: 'gam_inativa' }, { status: 400 })

    // Valida no servidor: a trilha existe e está 100% concluída por este aluno.
    const { trilhas } = await carregarTrilhasAluno()
    const t = trilhas.find((x) => x.id === grupoId)
    if (!t || t.total === 0 || t.done < t.total) return NextResponse.json({ ok: false, motivo: 'nao_liberado' }, { status: 400 })
    if (!t.trilhaXp || t.trilhaXp <= 0) return NextResponse.json({ ok: true, awarded: false, xp: 0 })

    const res = await awardXp(svc, {
      tenantId: sessao.tenantId as string,
      estudanteId: sessao.estudanteId as string,
      origem: 'chest',
      refId: `trilha:${grupoId}`,
      xp: t.trilhaXp,
      meta: { tipo: 'bau_trilha', grupo: grupoId },
    })
    return NextResponse.json({ ok: true, awarded: res.awarded, xp: t.trilhaXp })
  } catch {
    return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 })
  }
}
