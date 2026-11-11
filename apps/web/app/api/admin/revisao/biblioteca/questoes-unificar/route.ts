import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { membrosDoGrupo } from '@/lib/admin-revisao/biblioteca-questoes-duplicadas'
import { desfazer, executar, historico, ignorar, listarGrupos, previa, restaurarIgnoradas } from '@/lib/admin-revisao/questoes-unificar'
import { LIMIAR_PADRAO, type FiltrosU, type UsoFiltro, type VistaU } from '@/lib/admin-revisao/questoes-unificar-tipos'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const csv = (v: string | null) => (v ?? '').split(',').map((x) => x.trim()).filter((x) => UUID.test(x))
const ids = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && UUID.test(x)))] : [])
const num = (v: string | null, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d }

// BIBLIOTECA › QUESTÕES › UNIFICAR › QUESTÕES DUPLICADAS — leitura e ações por ROTA DE API (server actions podem ser rejeitadas em domínio
// custom). GET = questoes:view; POST = questoes:update. Toda mutação é auditada na lib (registrarAudit) e invalida os caches.
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'questoes:view') || !access.tenantId) return NextResponse.json({ ok: false, error: 'sem_permissao' }, { status: 403 })
  const tenantId = access.tenantId
  const sp = new URL(req.url).searchParams
  const svc = createAdminClient()
  const s = sp.get('s') ?? 'grupos'
  try {
    if (s === 'grupos') {
      const vista = (['pendentes', 'ignoradas', 'resolvidas'].includes(sp.get('vista') ?? '') ? sp.get('vista') : 'pendentes') as VistaU
      const lim = Number(sp.get('limiar')); const uso = (['simulado', 'respostas', 'livre'].includes(sp.get('uso') ?? '') ? sp.get('uso') : '') as UsoFiltro
      const f: FiltrosU = {
        vista, nivel: sp.get('nivel') ?? '', uso, disciplina: UUID.test(sp.get('disciplina') ?? '') ? sp.get('disciplina')! : '', banca: UUID.test(sp.get('banca') ?? '') ? sp.get('banca')! : '',
        ano: /^\d{4}$/.test(sp.get('ano') ?? '') ? sp.get('ano')! : '', status: ['publicada', 'rascunho', 'arquivada'].includes(sp.get('status') ?? '') ? sp.get('status')! : '',
        gabarito: sp.get('gabarito') === 'divergente' ? 'divergente' : sp.get('gabarito') === 'ok' ? 'ok' : '', limiar: Number.isFinite(lim) && lim > 0 ? lim : LIMIAR_PADRAO,
        q: (sp.get('q') ?? '').slice(0, 120), page: num(sp.get('page'), 1), pp: num(sp.get('pp'), 14),
      }
      return NextResponse.json(await listarGrupos(svc, tenantId, f, sp.get('fresh') === '1'))
    }
    if (s === 'membros') return NextResponse.json({ ok: true, membros: await membrosDoGrupo(svc, tenantId, csv(sp.get('ids'))) })
    if (s === 'previa') {
      const mestre = sp.get('mestre') ?? ''
      if (!UUID.test(mestre)) return NextResponse.json({ ok: false, error: 'Mestre inválida.' }, { status: 400 })
      return NextResponse.json(await previa(svc, tenantId, mestre, csv(sp.get('dups'))))
    }
    if (s === 'historico') return NextResponse.json({ ok: true, ...(await historico(tenantId)) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Falha ao carregar.' }, { status: 500 })
  }
  return NextResponse.json({ ok: false, error: 'Seção inválida.' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.tenantId) return NextResponse.json({ ok: false, error: 'Tenant não resolvido.' }, { status: 400 })
  if (!accessCan(access, 'questoes:update')) return NextResponse.json({ ok: false, error: 'Você não tem permissão para editar questões.' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const svc = createAdminClient()
  const ator = { tenantId: access.tenantId, userId: access.userId ?? null }
  try {
    switch (String(b?.acao ?? '')) {
      case 'previa': {
        if (!UUID.test(String(b.mestreId ?? ''))) return NextResponse.json({ ok: false, error: 'Mestre inválida.' }, { status: 400 })
        return NextResponse.json(await previa(svc, ator.tenantId, b.mestreId, ids(b.dupIds)))
      }
      case 'unificar': {
        if (b.modo !== 'completa' && b.modo !== 'arquivar') return NextResponse.json({ ok: false, error: 'Modo inválido.' }, { status: 400 })
        const r = await executar(svc, ator, String(b.mestreId ?? ''), ids(b.dupIds), b.modo, { reapontar: b.reapontar !== false, confirmarDivergente: b.confirmarDivergente === true })
        return NextResponse.json(r, { status: r.ok ? 200 : 400 })
      }
      case 'desfazer': {
        const r = await desfazer(svc, ator, { unificacaoId: typeof b.unificacaoId === 'string' ? b.unificacaoId : undefined, snapshot: b.snapshot, mestreId: b.mestreId, duplicadas: ids(b.duplicadas) })
        return NextResponse.json(r, { status: r.ok ? 200 : 400 })
      }
      case 'ignorar': {
        const r = await ignorar(ator, ids(b.ids), Array.isArray(b.contra) ? ids(b.contra) : undefined)
        return NextResponse.json(r, { status: r.ok || r.servidor === false ? 200 : 400 })
      }
      case 'restaurar': {
        const r = await restaurarIgnoradas(ator, ids(b.ids))
        return NextResponse.json(r, { status: r.ok ? 200 : 400 })
      }
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Falha ao executar.' }, { status: 500 })
  }
  return NextResponse.json({ ok: false, error: 'Ação inválida.' }, { status: 400 })
}
