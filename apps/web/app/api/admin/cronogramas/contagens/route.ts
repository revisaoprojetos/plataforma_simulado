import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { remember } from '@/lib/cache/relatorio-cache'
import { lerRegras, montarCobertura, paginarDisciplinas } from '@/lib/revisao/cronograma'
import { crAlteradas } from '@/lib/revisao/cronograma-schema'

export const dynamic = 'force-dynamic'

// GET /api/admin/cronogramas/contagens — badges das sub-abas do Adaptativo (Cobertura das aulas / Disciplinas / Regras do cronograma).
// Leve: resultado em cache 60 s por tenant (reusa os caches de aulas/disciplinas/regras); a nav busca 1x, fora do caminho de render.
export async function GET() {
  const a = await getCurrentAccess()
  const permitido = a.isAdmin || a.permissions.includes('*') || a.permissions.includes('cronogramas:view')
  if (!a.tenantId || !permitido) return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  const tenantId = a.tenantId
  const dados = await remember(`crono-nav:contagens:${tenantId}`, 60, async () => {
    const svc = createAdminClient()
    const regras = await lerRegras(svc, tenantId)
    const [cob, disc] = await Promise.all([
      montarCobertura(svc, tenantId, regras.valores).then((b) => b.kpis.pendentes).catch(() => null),
      paginarDisciplinas(svc, tenantId, { pagina: 1, porPagina: 5 }).then((d) => d.totalGeral).catch(() => null),
    ])
    return { mat: cob, disc, regras: crAlteradas(regras.valores).length }
  })
  return NextResponse.json(dados, { headers: { 'Cache-Control': 'private, max-age=30' } })
}
