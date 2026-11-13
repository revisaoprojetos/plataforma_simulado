import { NextRequest, NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/seguranca/auth'
import { executarVarreduraRuntime } from '@/lib/seguranca/scanner'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Varredura diária de segurança (checagens de runtime + CVEs via OSV.dev).
 * Protegida por CRON_SECRET; chamada pelo worker (chamarCron).
 */
export async function POST(req: NextRequest) {
  if (!cronAutorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  try {
    const r = await executarVarreduraRuntime('cron')
    // ok:false destaca no log do worker quando há algo crítico/alto novo.
    return NextResponse.json({ ok: !(r.criticos > 0), ...r })
  } catch (e: any) {
    console.error('[seguranca-varredura] falhou:', e)
    return NextResponse.json({ ok: false, message: String(e?.message ?? e) }, { status: 500 })
  }
}
