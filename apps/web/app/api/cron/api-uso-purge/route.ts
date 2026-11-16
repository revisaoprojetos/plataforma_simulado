import { NextRequest, NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/seguranca/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** RETENÇÃO do rastreio de uso da API (IP/UA = dado pessoal): apaga > API_USO_RETENCAO_DIAS (default 180; mín. 30). CRON_SECRET. */
export async function POST(req: NextRequest) {
  if (!cronAutorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  const dias = Math.max(30, Number(process.env.API_USO_RETENCAO_DIAS ?? 180) || 180)
  const { data, error } = await createAdminClient().rpc('simulado_api_uso_purgar', { dias })
  if (error) return NextResponse.json({ ok: false, pulado: true, motivo: error.message })
  return NextResponse.json({ ok: true, dias, apagadas: Number(data ?? 0) })
}
