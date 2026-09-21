import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { reaplicarLiberacoes } from '@/lib/integracoes/engine'
import { reconciliarPull } from '@/lib/integracoes/orquestrador'

export const dynamic = 'force-dynamic'

/**
 * Reconciliação de acessos da Guru (rede de segurança). Protegido por CRON_SECRET.
 *
 * DOIS modos:
 *  - PADRÃO (`reaplicarLiberacoes`): reaplica as liberações das assinaturas ATIVAS conhecidas
 *    LOCALMENTE, recuperando alunos sem acesso por falha silenciosa de escrita / webhook de compra
 *    que não aplicou. Idempotente e só CONCEDE — seguro para rodar periodicamente.
 *    INCREMENTAL por padrão (últimas 48h); `?full=1` reprocessa TODAS. `?tenant=<id>` limita.
 *  - PULL (`?pull=1`): puxa as assinaturas da API do Guru (fonte da verdade), compara com o local e
 *    também **REVOGA** cancelamentos/reembolsos cujo webhook se PERDEU. Como isto pode RETIRAR acesso,
 *    roda em **dry-run por padrão** (só relatório do que mudaria); passe `?aplicar=1` para efetivar.
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
  // Incremental (48h) por padrão; ?full=1 reprocessa tudo. Evita martelar o banco com ~4,7k/dia.
  const desde = sp.get('full') === '1' ? undefined : new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  // Tenants com integração Guru ATIVA (ou o tenant pedido).
  let tenantIds: string[]
  if (alvo) {
    tenantIds = [alvo]
  } else {
    const { data } = await svc.from('simulado_integracao_config').select('tenant_id').eq('provider', 'guru').eq('ativo', true)
    tenantIds = [...new Set((data ?? []).map((r: any) => r.tenant_id).filter(Boolean))]
  }

  // MODO PULL: puxa da API do Guru e revoga divergências (dry-run por padrão).
  if (sp.get('pull') === '1') {
    const dry = sp.get('aplicar') !== '1'
    const pull: any[] = []
    for (const tenantId of tenantIds) {
      try {
        const r = await reconciliarPull(tenantId, 'guru', { dry })
        pull.push({ tenantId, ...r })
      } catch (e: any) {
        pull.push({ tenantId, ok: false, error: e?.message ?? String(e) })
        // eslint-disable-next-line no-console
        console.error('[guru-reconcile pull] tenant', tenantId, e?.message ?? e)
      }
    }
    return NextResponse.json({ ok: true, modo: 'pull', dry, tenants: tenantIds.length, resultados: pull })
  }

  const resultados: Array<{ tenantId: string; total: number; concedidos: number; erros: number; semMapeamento: number }> = []
  for (const tenantId of tenantIds) {
    try {
      const r = await reaplicarLiberacoes(tenantId, 'guru', undefined, desde)
      resultados.push({ tenantId, total: r.total, concedidos: r.concedidos, erros: r.erros, semMapeamento: r.semMapeamento })
    } catch (e: any) {
      resultados.push({ tenantId, total: 0, concedidos: 0, erros: 1, semMapeamento: 0 })
      // eslint-disable-next-line no-console
      console.error('[guru-reconcile] tenant', tenantId, e?.message ?? e)
    }
  }

  return NextResponse.json({ ok: true, modo: 'reaplicar', tenants: tenantIds.length, resultados })
}
