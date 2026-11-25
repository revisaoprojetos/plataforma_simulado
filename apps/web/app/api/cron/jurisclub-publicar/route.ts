import { NextRequest, NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/seguranca/cron-auth'
import { comLockCron } from '@/lib/cron/lock'
import { publicarEdicoesAgendadas } from '@/lib/revisao/jurisclub-publicar'

export const dynamic = 'force-dynamic'

/** Publica as edições do JurisClub agendadas cuja data já chegou. Protegido por CRON_SECRET; chamado pelo worker. */
async function executar(req: NextRequest) {
  if (!cronAutorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, ...(await publicarEdicoesAgendadas()) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? 'Falha ao publicar agendadas.' }, { status: 500 })
  }
}

// Lock compartilhado: se a rodada anterior ainda roda (qualquer réplica), responde 200 { skipped: true }.
export const POST = (req: NextRequest) => comLockCron(req, 'jurisclub-publicar', () => executar(req))
