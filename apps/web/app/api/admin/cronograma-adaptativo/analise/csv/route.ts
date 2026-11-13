import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { consultarVisao, normalizarFiltro, paraCsv, periodoParaDatas, secaoDe, visaoDe } from '@/lib/cronograma/adaptativo/analise'

export const dynamic = 'force-dynamic'

// GET /api/admin/cronograma-adaptativo/analise/csv?sec=&vis=&periodo=&grupo=&disc=&tipo=&motor=&dias=&q=&ord=&dir=
// Exporta a tabela da aba "Análise de uso" (mesmos filtros/ordem da tela) — até 5.000 linhas, sem cache. Permissão: cronogramas:view.
const LIMITE = 5000

export async function GET(req: NextRequest) {
  const a = await getCurrentAccess()
  const permitido = a.isAdmin || a.permissions.includes('*') || a.permissions.includes('cronogramas:view')
  if (!a.tenantId || !permitido) return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const sec = secaoDe(sp.get('sec') ?? undefined)
  const vis = visaoDe(sec, sp.get('vis') ?? undefined)
  const per = periodoParaDatas(sp.get('periodo') ?? undefined)
  const f = normalizarFiltro({ de: per.de ?? undefined, ate: per.ate, grupo: sp.get('grupo') ?? undefined, disc: sp.get('disc') ?? undefined, tipo: sp.get('tipo') ?? undefined, motor: sp.get('motor') ?? undefined, dias: sp.get('dias') ?? undefined })
  const r = await consultarVisao(createAdminClient(), a.tenantId, vis, f, { q: sp.get('q') ?? undefined, ord: sp.get('ord') ?? undefined, dir: sp.get('dir') ?? undefined, pag: 1, pp: LIMITE, semCache: true })
  if (!r.migrado) return NextResponse.json({ message: 'Migração 20261119030000 ainda não aplicada.' }, { status: 409 })
  if (r.erro) return NextResponse.json({ message: r.erro }, { status: 500 })

  const nome = `adaptativo-${sec.id}-${vis.id}-${new Date().toISOString().slice(0, 10)}.csv`
  return new NextResponse(paraCsv(vis, r.rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'no-store' } })
}
