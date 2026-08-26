import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { recomputarTudo, marcarErro } from '@/lib/storage/uso'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Recalcula o snapshot de uso do storage E sincroniza o catálogo `simulado_arquivos`
 * (insere faltantes + poda sumidos) numa passada só. É o caminho ÚNICO de recompute:
 * usado pelo botão "Recalcular" do console (disparo fire-and-forget) e pelo cron 6h do
 * worker (auto-cura o catálogo mesmo quando o insert do upload falha silenciosamente).
 * Protegido por CRON_SECRET. Idempotente.
 */
function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return h === segredo
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  const svc = createAdminClient()
  try {
    const { snapshot, reconcile } = await recomputarTudo(svc)
    return NextResponse.json({
      ok: true,
      totalBytes: snapshot.totalBytes,
      totalArquivos: snapshot.totalArquivos,
      buckets: snapshot.buckets.length,
      inseridos: reconcile.inseridos,
      removidos: reconcile.removidos,
      erros: reconcile.erros,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao recalcular storage.'
    await marcarErro(svc, msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
