import { NextRequest, NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/seguranca/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { reconciliarGruposBancos } from '@/lib/simulado/reconciliar-grupos-bancos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Rede de segurança do elo grupo→banco: garante que todo membro de um grupo vinculado a um
 * banco esteja na pasta E matriculado nos simulados do banco (gate de acesso). Cobre casos em
 * que a propagação inline não rodou (lag de deploy, banco vinculado depois do membro entrar,
 * erro transitório). Idempotente. Protegido por CRON_SECRET; chamado pelo worker a cada minuto.
 */
function autorizado(req: NextRequest): boolean {
  return cronAutorizado(req)
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  const svc = createAdminClient()
  try {
    const r = await reconciliarGruposBancos(svc)
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Falha na reconciliação.' }, { status: 500 })
  }
}
