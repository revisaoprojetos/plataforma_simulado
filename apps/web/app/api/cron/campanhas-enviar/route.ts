import { NextRequest, NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/seguranca/cron-auth'
import { processarPendentes } from '@/lib/admin-revisao/campanha-envio'

export const dynamic = 'force-dynamic'

/**
 * CS › Disparo de Campanha: envia campanhas 'na_fila' e 'agendada' vencidas para o fluxo configurado em
 * CAMPANHA_WEBHOOK_URL (n8n). Protegido por CRON_SECRET. DRY-RUN por padrão — passe `?aplicar=1` para enviar
 * (e só envia se CAMPANHA_WEBHOOK_URL estiver configurada). `?tenant=<id>` limita a um tenant.
 */
function autorizado(req: NextRequest): boolean {
  return cronAutorizado(req)
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  return NextResponse.json(await processarPendentes({ dry: sp.get('aplicar') !== '1', tenantId: sp.get('tenant') ?? undefined }))
}
