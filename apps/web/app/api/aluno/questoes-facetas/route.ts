import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { questoesForaDeJogoTenant } from '@/lib/simulado/questoes-anuladas'
import { calcularFacetas, type FiltrosFaceta } from '@/lib/aluno/facetas-questoes'

export const dynamic = 'force-dynamic'

// GET /api/aluno/questoes-facetas?disciplina=a|b&banca=…  → { total, contagens } do rascunho de filtros da sidebar.
export async function GET(req: Request) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const f: FiltrosFaceta = {}
  for (const k of ['disciplina', 'assunto', 'detalhe', 'banca', 'orgao', 'cargo', 'ano', 'dificuldade', 'busca', 'comentadas'] as const) {
    const v = sp.get(k); if (v) f[k] = v.slice(0, 4000)
  }
  try {
    const svc = createAdminClient()
    const [{ data: assuntos }, fora] = await Promise.all([
      svc.from('simulado_assuntos').select('id, pai_id').eq('tenant_id', sessao.tenantId),
      questoesForaDeJogoTenant(svc, sessao.tenantId),
    ])
    const r = await calcularFacetas(sessao.tenantId, f, (assuntos ?? []) as never, [...fora])
    if (!r) return NextResponse.json({ ok: false }, { status: 200 })
    return NextResponse.json({ ok: true, ...r }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
