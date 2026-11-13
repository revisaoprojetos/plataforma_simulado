import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verificarSilencioWebhook, formatarSilencio } from '@/lib/integracoes/silencio'

export const dynamic = 'force-dynamic'

/**
 * Alerta de silêncio do webhook do Guru. Protegido por CRON_SECRET; chamado pelo worker (15 min).
 * Para cada tenant com Guru ATIVO, alerta alto nos logs se a plataforma ficou tempo demais sem receber
 * NENHUMA requisição do Guru (ver `lib/integracoes/silencio.ts`). Devolve `ok:false` quando há silêncio.
 * Ao detectar, a recuperação das compras perdidas é `POST /api/cron/guru-reconcile?pull=1` (dry-run; `&aplicar=1` efetiva).
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
  const { data } = await svc.from('simulado_integracao_config').select('tenant_id').eq('provider', 'guru').eq('ativo', true)
  const tenantIds = [...new Set((data ?? []).map((r: any) => r.tenant_id as string).filter(Boolean))]

  const tenants: Array<{ tenantId: string; ultimoEm: string | null; silencioMin: number | null; limiteMin: number; emSilencio: boolean }> = []
  for (const tenantId of tenantIds) {
    const s = await verificarSilencioWebhook(svc, tenantId, 'guru')
    tenants.push({ tenantId, ultimoEm: s.ultimoEm, silencioMin: s.silencioMin, limiteMin: s.limiteMin, emSilencio: s.emSilencio })
    if (s.emSilencio && s.silencioMin != null) {
      // eslint-disable-next-line no-console
      console.error(`[guru-silencio] ⚠️ GURU SEM ENVIAR HÁ ${formatarSilencio(s.silencioMin)} (limite ${formatarSilencio(s.limiteMin)}) — tenant ${tenantId}, última requisição ${s.ultimoEm}. Confira URL/token do webhook no Guru; depois recupere compras perdidas com /api/cron/guru-reconcile?pull=1.`)
    }
  }
  return NextResponse.json({ ok: !tenants.some((t) => t.emSilencio), tenants })
}
