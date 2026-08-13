import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getGamConfig } from '@/lib/gamificacao'

// GET /api/aluno/gamificacao/celebracao — eventos de XP recentes (contabilizados) para a
// animação de "XP voando para o card de nível" na Início. O cliente deduplica por chave
// (localStorage) e anima só o que ainda não celebrou — cobre tanto o "voltar ao menu" quanto
// o caso de o XP já ter sido contabilizado sem a animação ter acontecido.
export const dynamic = 'force-dynamic'

export async function GET() {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false }, { status: 401 })
  try {
    const svc = await createServiceClient()
    const config = await getGamConfig(svc, sessao.tenantId)
    if (!config?.ativo) return NextResponse.json({ ok: true, eventos: [], xpTotal: 0, curva: null })

    const desde = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    const [{ data: evs }, { data: cache }, { count: desbCount }] = await Promise.all([
      svc.from('simulado_xp_eventos')
        .select('origem, ref_id, xp, criado_em')
        .eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId)
        .neq('origem', 'backfill')
        .gte('criado_em', desde)
        .order('criado_em', { ascending: false })
        .limit(50),
      svc.from('simulado_gamificacao_estudante').select('xp_total, streak_atual').eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).maybeSingle(),
      svc.from('simulado_conquista_desbloqueios').select('conquista_id', { count: 'exact', head: true }).eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId),
    ])

    const eventos = ((evs ?? []) as any[])
      .filter((e) => Number(e.xp) > 0)
      .map((e) => ({ chave: `${e.origem}:${e.ref_id}`, xp: Number(e.xp), origem: e.origem as string }))

    return NextResponse.json({
      ok: true,
      est: sessao.estudanteId,
      eventos,
      xpTotal: cache?.xp_total ?? 0,
      curva: config.nivel_curva,
      streak: cache?.streak_atual ?? 0,
      badges: { unlocked: desbCount ?? 0, total: (config.conquistas_def ?? []).length },
    })
  } catch {
    return NextResponse.json({ ok: true, eventos: [], xpTotal: 0, curva: null })
  }
}
