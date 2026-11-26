import { NextResponse } from 'next/server'
import { guardCronograma, montarMatrizDisciplinas } from '@/lib/admin/metas-pasta-servidor'
import { comTimeout } from '@/lib/admin/metas-pasta-matriz'

export const dynamic = 'force-dynamic'

// GET /api/admin/revisao/cronograma/metas-pasta/matriz — disciplinas do cronograma × flags × pastas × documentos por tipo.
export async function GET() {
  const g = await guardCronograma('cronogramas:view')
  if (!g) return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
  try {
    const matriz = await comTimeout(montarMatrizDisciplinas(g.tenantId), 20_000)
    return NextResponse.json({ ok: true, matriz }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'Falha ao carregar a matriz.' }, { status: 504 })
  }
}
