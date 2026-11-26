import { NextResponse } from 'next/server'
import { guardCronograma, listarDocsDaPasta } from '@/lib/admin/metas-pasta-servidor'
import { comTimeout, lerParamsDocs } from '@/lib/admin/metas-pasta-matriz'

export const dynamic = 'force-dynamic'

// GET /api/admin/revisao/cronograma/metas-pasta/docs?pasta=<uuid>&page=1&q=&sub=1
// Documentos de uma pasta (50 por página). Rota (não server action): não entra na fila serializada de actions do cliente
// e responde 504 se o banco pendurar, em vez de deixar a UI em "Carregando…".
export async function GET(req: Request) {
  const g = await guardCronograma('cronogramas:view')
  if (!g) return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
  const sp = new URL(req.url).searchParams
  const p = lerParamsDocs((k) => sp.get(k))
  if (!p) return NextResponse.json({ ok: false, error: 'Pasta inválida.' }, { status: 400 })
  try {
    const r = await comTimeout(listarDocsDaPasta(g.tenantId, p.pastaId, { page: p.page, q: p.q, sub: p.sub }), 18_000)
    return NextResponse.json(r, { status: r.ok ? 200 : 404, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'Falha ao carregar os documentos.' }, { status: 504 })
  }
}
