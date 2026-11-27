import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { facetasBancoEstudio } from '@/lib/conteudo/questoes-estudio'
import { filtrosDeParams } from '@/lib/conteudo/questoes-estudio-filtros'

export const dynamic = 'force-dynamic'

// GET /api/admin/conteudos/questoes/facetas?banco=<id>&<filtros do card>&q= → { ok, total, contagens } (por dimensão, com os OUTROS filtros).
// Escopo = questões DO banco do Estúdio. questoes:view (ou admin) + tenant da sessão (nunca do cliente).
// Sem SQL direto (DATABASE_URL ausente) devolve ok:false e o card some só os números.
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  const permitido = access.isAdmin || accessCan(access, 'questoes:view')
  if (!permitido || !access.tenantId) return NextResponse.json({ ok: false, error: 'sem_permissao' }, { status: 403 })
  try {
    const sp = req.nextUrl.searchParams
    const banco = (sp.get('banco') ?? '').trim()
    const r = await facetasBancoEstudio(access.tenantId, banco, filtrosDeParams((k) => sp.get(k)))
    if (!r) return NextResponse.json({ ok: false }, { status: 200 })
    return NextResponse.json({ ok: true, ...r }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
