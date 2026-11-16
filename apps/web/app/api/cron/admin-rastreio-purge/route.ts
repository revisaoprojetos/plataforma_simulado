import { NextRequest, NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/seguranca/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** RETENÇÃO do rastreio de acessos da EQUIPE (IP/UA = dado pessoal): apaga > ADMIN_RASTREIO_RETENCAO_DIAS (default 180; mín. 30). CRON_SECRET. */
export async function POST(req: NextRequest) {
  if (!cronAutorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  const dias = Math.max(30, Number(process.env.ADMIN_RASTREIO_RETENCAO_DIAS ?? 180) || 180)
  const { data, error } = await createAdminClient().rpc('simulado_admin_rastreio_purgar', { dias })
  if (error) return NextResponse.json({ ok: false, pulado: true, motivo: error.message })
  const r = (Array.isArray(data) ? data[0] : data) as { atividades?: number | string; sessoes?: number | string } | null
  return NextResponse.json({ ok: true, dias, atividades: Number(r?.atividades ?? 0), sessoes: Number(r?.sessoes ?? 0) })
}
