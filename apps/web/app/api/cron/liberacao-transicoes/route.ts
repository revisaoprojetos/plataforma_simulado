import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { processarTransicoesGrants } from '@/lib/integracoes/liberacao/engine'
import { LIBERACAO_REGRAS_ATIVO } from '@/lib/flags'

export const dynamic = 'force-dynamic'

/**
 * Transições de calendário das CONCESSÕES de acesso (access_grants): promove `scheduled→active`
 * quando chega a hora e `active→expired` quando vence, reconciliando o acesso efetivo nas tabelas
 * de domínio. Protegido por CRON_SECRET. Idempotente (seguro rodar a cada poucos minutos).
 * `?tenant=<id>` limita a um tenant.
 */
function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return h === segredo
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  // KILL-SWITCH: liberação desligada (default) → no-op (não toca nas tabelas de grants).
  if (!LIBERACAO_REGRAS_ATIVO) return NextResponse.json({ ok: true, desligado: true, tenants: 0, resultados: [] })
  const svc = createAdminClient()
  const alvo = new URL(req.url).searchParams.get('tenant')

  let tenantIds: string[]
  if (alvo) {
    tenantIds = [alvo]
  } else {
    // Só tenants com grants pendentes de transição (agendados ou ativos com prazo).
    let data: any[] = []
    try {
      const r = await svc.from('simulado_access_grants').select('tenant_id').in('status', ['scheduled', 'active'])
      data = r.data ?? []
    } catch { data = [] }
    tenantIds = [...new Set(data.map((r) => r.tenant_id).filter(Boolean))]
  }

  const resultados = []
  for (const tenantId of tenantIds) {
    try { resultados.push(await processarTransicoesGrants(tenantId)) }
    catch (e: any) {
      resultados.push({ tenantId, ativados: 0, expirados: 0, reconciliados: 0, erro: e?.message ?? String(e) })
      // eslint-disable-next-line no-console
      console.error('[liberacao-transicoes] tenant', tenantId, e?.message ?? e)
    }
  }
  return NextResponse.json({ ok: true, tenants: tenantIds.length, resultados })
}
