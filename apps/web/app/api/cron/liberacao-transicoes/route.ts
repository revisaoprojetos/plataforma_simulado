import { NextRequest, NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/seguranca/cron-auth'
import { comLockCron } from '@/lib/cron/lock'
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
  return cronAutorizado(req)
}

async function executar(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  // KILL-SWITCH: liberação desligada (default) → no-op (não toca nas tabelas de grants).
  if (!LIBERACAO_REGRAS_ATIVO) return NextResponse.json({ ok: true, desligado: true, tenants: 0, resultados: [] })
  const svc = createAdminClient()
  const alvo = new URL(req.url).searchParams.get('tenant')

  let tenantIds: string[]
  if (alvo) {
    tenantIds = [alvo]
  } else {
    // Só tenants com transição VENCIDA (scheduled com início<=agora OU active com fim<=agora). Antes lia o
    // tenant_id de TODOS os grants ativos a cada 5 min; agora 2 queries limitadas e quase sempre vazias.
    const agoraIso = new Date().toISOString()
    let data: any[] = []
    try {
      const [a, b] = await Promise.all([
        svc.from('simulado_access_grants').select('tenant_id').eq('status', 'scheduled').lte('inicio_em', agoraIso).limit(500),
        svc.from('simulado_access_grants').select('tenant_id').eq('status', 'active').not('fim_em', 'is', null).lte('fim_em', agoraIso).limit(500),
      ])
      data = [...(a.data ?? []), ...(b.data ?? [])]
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

// Lock compartilhado: se a rodada anterior ainda roda (qualquer réplica), responde 200 { skipped: true }.
export const POST = (req: NextRequest) => comLockCron(req, 'liberacao-transicoes', () => executar(req))
