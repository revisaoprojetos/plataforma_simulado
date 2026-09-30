import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getGamConfig } from '@/lib/gamificacao'

// GET /api/aluno/gamificacao/celebracao — eventos de XP recentes (contabilizados) para a
// animação de "XP voando para o card de nível" na Início. O cliente deduplica por chave
// (localStorage) e anima só o que ainda não celebrou — cobre tanto o "voltar ao menu" quanto
// o caso de o XP já ter sido contabilizado sem a animação ter acontecido.
// POST { nivel } — registra o MAIOR nível já celebrado no servidor (fonte da verdade p/ não repetir).
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false }, { status: 401 })
  try {
    const body = await req.json().catch(() => ({}))
    const nivel = Math.max(0, Math.floor(Number((body as any)?.nivel) || 0))
    if (!nivel) return NextResponse.json({ ok: true })
    const svc = createAdminClient()
    const { data: atual } = await svc.from('simulado_gamificacao_estudante')
      .select('nivel_celebrado').eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).maybeSingle()
    const jaCelebrado = Number((atual as any)?.nivel_celebrado) || 0
    if (nivel > jaCelebrado) {
      // Só sobe; nunca regride. Tolerante à coluna ausente (banco sem a migração).
      const { error } = await svc.from('simulado_gamificacao_estudante')
        .update({ nivel_celebrado: nivel }).eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId)
      if (error && /nivel_celebrado|column/i.test(error.message)) return NextResponse.json({ ok: true, semColuna: true })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}

export async function GET() {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false }, { status: 401 })
  try {
    const svc = createAdminClient()
    const config = await getGamConfig(svc, sessao.tenantId)
    if (!config?.ativo) return NextResponse.json({ ok: true, eventos: [], xpTotal: 0, curva: null })

    const desde = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    const [{ data: evs }, { data: cache }, { count: desbCount }, { data: tenantRow }] = await Promise.all([
      svc.from('simulado_xp_eventos')
        .select('origem, ref_id, xp, criado_em')
        .eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId)
        .neq('origem', 'backfill')
        .gte('criado_em', desde)
        .order('criado_em', { ascending: false })
        .limit(50),
      svc.from('simulado_gamificacao_estudante').select('xp_total, streak_atual').eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).maybeSingle(),
      svc.from('simulado_conquista_desbloqueios').select('conquista_id', { count: 'exact', head: true }).eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId),
      svc.from('simulado_tenants').select('tema').eq('id', sessao.tenantId).maybeSingle(),
    ])
    const tema = (tenantRow?.tema ?? {}) as any
    // Prioriza a "logo grande" configurada na Aparência; cai na logo normal se não houver.
    const logo = tema.logo_grande_url || tema.logo_dark_url || tema.logo_url || null

    // Nível já celebrado (fonte da verdade p/ não repetir a animação). Tolerante à coluna ausente.
    let nivelCelebrado: number | null = null
    const nc = await svc.from('simulado_gamificacao_estudante').select('nivel_celebrado').eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).maybeSingle()
    if (!nc.error && nc.data && (nc.data as any).nivel_celebrado != null) nivelCelebrado = Number((nc.data as any).nivel_celebrado)

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
      logo,
      nivelCelebrado,
    })
  } catch {
    return NextResponse.json({ ok: true, eventos: [], xpTotal: 0, curva: null })
  }
}
