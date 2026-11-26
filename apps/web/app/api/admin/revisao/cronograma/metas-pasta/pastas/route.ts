import { NextResponse } from 'next/server'
import { guardCronograma, listarNosMetasPasta } from '@/lib/admin/metas-pasta-servidor'
import { comTimeout } from '@/lib/admin/metas-pasta-matriz'

export const dynamic = 'force-dynamic'

// GET /api/admin/revisao/cronograma/metas-pasta/pastas — árvore plana de pastas da Biblioteca (conteúdo) com disciplina/tipo/contagens.
export async function GET() {
  const g = await guardCronograma('cronogramas:view')
  if (!g) return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
  try {
    const nos = await comTimeout(listarNosMetasPasta(g.tenantId), 18_000)
    return NextResponse.json({ ok: true, nos }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'Falha ao carregar as pastas.' }, { status: 504 })
  }
}
