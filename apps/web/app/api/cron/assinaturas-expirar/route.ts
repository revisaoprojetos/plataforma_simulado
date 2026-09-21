import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { expirarVencidas } from '@/lib/integracoes/engine'

export const dynamic = 'force-dynamic'

/**
 * Expiração por DATA das assinaturas vencidas (Guru) — rede de segurança para quando o provedor não
 * manda um evento de expiração. Marca `status='expirado'` e REVOGA o acesso (escopado ao mapeamento,
 * respeitando `outraAtivaConcede` e `origem='integracao'` — não toca acesso manual). Protegido por CRON_SECRET.
 *
 * Como RETIRA acesso, roda em **dry-run por padrão** (só reporta o que expiraria). Passe `?aplicar=1`
 * para efetivar. `?tenant=<id>` limita a um tenant. NÃO está no agendador automático até aprovação.
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
  const sp = new URL(req.url).searchParams
  const alvo = sp.get('tenant')
  const dry = sp.get('aplicar') !== '1'

  let tenantIds: string[]
  if (alvo) tenantIds = [alvo]
  else {
    const { data } = await svc.from('simulado_integracao_config').select('tenant_id').eq('provider', 'guru').eq('ativo', true)
    tenantIds = [...new Set((data ?? []).map((r: any) => r.tenant_id).filter(Boolean))]
  }

  const resultados: any[] = []
  for (const tenantId of tenantIds) {
    try { resultados.push({ tenantId, ...(await expirarVencidas(tenantId, 'guru', { dry })) }) }
    catch (e: any) {
      resultados.push({ tenantId, ok: false, error: e?.message ?? String(e) })
      // eslint-disable-next-line no-console
      console.error('[assinaturas-expirar] tenant', tenantId, e?.message ?? e)
    }
  }
  return NextResponse.json({ ok: true, dry, tenants: tenantIds.length, resultados })
}
