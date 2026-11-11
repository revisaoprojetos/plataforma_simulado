import { NextRequest, NextResponse } from 'next/server'
import { publicarEdicoesAgendadas } from '@/lib/revisao/jurisclub-publicar'

export const dynamic = 'force-dynamic'

/** Publica as edições do JurisClub agendadas cuja data já chegou. Protegido por CRON_SECRET; chamado pelo worker. */
export async function POST(req: NextRequest) {
  const segredo = process.env.CRON_SECRET
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!segredo || h !== segredo) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, ...(await publicarEdicoesAgendadas()) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? 'Falha ao publicar agendadas.' }, { status: 500 })
  }
}
