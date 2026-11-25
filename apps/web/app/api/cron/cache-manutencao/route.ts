import { NextRequest, NextResponse } from 'next/server'
import { comLockCron } from '@/lib/cron/lock'
import { createAdminClient } from '@/lib/supabase/server'
import { manutencaoCache, reservarJanela } from '@/lib/cache/limpeza'
import { recursoAusente, marcarSeAusente } from '@/lib/db/recurso-ausente'

export const dynamic = 'force-dynamic'

// Funções de retenção (migração 20261204000100). Usam os PRAZOS PADRÃO da própria função (só o lote é informado).
const PURGAS = ['purgar_audit_logs_antigos', 'purgar_webhook_inbox_processado', 'purgar_integracao_eventos_processados'] as const
const LOTE_PURGA = 2000

async function purgas(): Promise<Record<string, number | string>> {
  const out: Record<string, number | string> = {}
  const svc = createAdminClient()
  for (const fn of PURGAS) {
    const chaveAusente = `rpc:${fn}`
    if (recursoAusente(chaveAusente)) { out[fn] = 'ausente'; continue }
    if (!(await reservarJanela(`cache-manutencao:purga:${fn}`, 23 * 3600))) { out[fn] = 'ja-executada-hoje'; continue }
    try {
      const { data, error } = await svc.rpc(fn, { p_lote: LOTE_PURGA })
      if (error) { out[fn] = marcarSeAusente(chaveAusente, error.message) ? 'ausente' : `erro: ${error.message}`; continue }
      out[fn] = Number(data ?? 0)
    } catch (e) { out[fn] = `erro: ${String((e as Error)?.message ?? e)}` }
  }
  return out
}

/** Manutenção do cache Redis (descarta só grupos reconstruíveis sob pressão de memória) + retenção diária no banco. Nunca falha (200). */
async function executar() {
  const cache = await manutencaoCache().catch((e) => ({ ok: false, motivo: String(e?.message ?? e) }))
  const retencao = await purgas().catch(() => ({} as Record<string, number | string>))
  return NextResponse.json({ ok: cache.ok, cache, retencao })
}

export const POST = (req: NextRequest) => comLockCron(req, 'cache-manutencao', () => executar(), 10 * 60_000)
