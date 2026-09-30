import { NextRequest, NextResponse } from 'next/server'
import { reconciliarCurseduca } from '@/lib/curseduca/reconciliar'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Reconciliação Curseduca × plataforma: total de cada lado + LISTA das diferenças (comprovação
 * "diferença = 0"). Protegido por CRON_SECRET — chame pelo worker ou por curl interno (evita o corte
 * de 5 min do proxy externo em tenants com muitos grupos). Só LEITURA (não altera nada).
 *   GET /api/cron/curseduca-reconciliar?tenant=<uuid>   (header x-cron-secret: <CRON_SECRET>)
 */
function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return h === segredo
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  const tenant = req.nextUrl.searchParams.get('tenant')
  if (!tenant) return NextResponse.json({ message: 'Informe ?tenant=<uuid>.' }, { status: 400 })
  const res = await reconciliarCurseduca(tenant, new Date().toISOString())
  return NextResponse.json(res, { status: res.ok ? 200 : 500 })
}
