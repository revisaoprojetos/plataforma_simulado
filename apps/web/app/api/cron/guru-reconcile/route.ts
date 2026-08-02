import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { reaplicarLiberacoes } from '@/lib/integracoes/engine'

export const dynamic = 'force-dynamic'

/**
 * Reconciliação de acessos da Guru (rede de segurança). Protegido por CRON_SECRET.
 *
 * Reaplica as liberações de TODAS as assinaturas ATIVAS conhecidas localmente
 * (`reaplicarLiberacoes`), recuperando alunos que ficaram sem acesso por falha silenciosa
 * de escrita (as que agora logamos) ou por um webhook de compra que não aplicou. É idempotente
 * e só CONCEDE (nunca revoga), então é seguro rodar periodicamente.
 *
 * Não substitui um pull do Guru (que pegaria assinaturas nunca recebidas e cancelamentos
 * perdidos) — isso depende de verificar os endpoints da API Guru (`guru.ts` marca "⚠️ VERIFICAR").
 *
 * INCREMENTAL por padrão: só reaplica assinaturas ativas ALTERADAS nas últimas 48h (barato,
 * pega os webhooks recém-falhados). Isso evita reprocessar milhares de assinaturas por dia
 * (o tenant tem ~4,7k ativas) num único request. `?full=1` reprocessa TODAS (uso manual/ocasional).
 * Aceita `?tenant=<id>` para reconciliar um tenant específico.
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

  return NextResponse.json({ ok: true, tenants: tenantIds.length, resultados })
}
