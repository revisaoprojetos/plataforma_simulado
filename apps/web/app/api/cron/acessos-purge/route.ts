import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * RETENÇÃO do registro de acessos do aluno (LGPD: IP/UA são dado pessoal). Apaga acessos e atividades
 * mais antigos que `ACESSOS_RETENCAO_DIAS` (default 180; mínimo 30) via função SQL
 * `simulado_aluno_registro_purgar`. Só toca nas tabelas simulado_aluno_acessos / simulado_aluno_atividades.
 * Protegido por CRON_SECRET. Agendado 1x/dia em apps/worker/src/main.ts. Sem a migração → responde ok:false.
 */
function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return h === segredo
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  const dias = Math.max(30, Number(process.env.ACESSOS_RETENCAO_DIAS ?? 180) || 180)
  const { data, error } = await createAdminClient().rpc('simulado_aluno_registro_purgar', { dias })
  if (error) return NextResponse.json({ ok: false, pulado: true, motivo: error.message })
  const r = Array.isArray(data) ? data[0] : data
  return NextResponse.json({ ok: true, dias, atividades: Number(r?.atividades ?? 0), acessos: Number(r?.acessos ?? 0) })
}
