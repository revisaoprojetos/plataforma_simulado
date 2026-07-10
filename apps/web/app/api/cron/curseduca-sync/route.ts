import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolverCfg, executarImport } from '@/lib/curseduca/import-core'

export const dynamic = 'force-dynamic'

/**
 * Sincronização automática (polling) das regras da Curseduca. Protegido por CRON_SECRET.
 * Chamado pelo worker (setInterval 60s). Roda as regras `ativas` cujo intervalo já venceu,
 * com lock otimista (só assume a regra se `ultima_execucao` não mudou desde a leitura).
 * Reusa `executarImport` (sem limite de detalhe). Prepara caminho p/ webhook futuro (mesma lógica).
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

  const { data: regras } = await svc
    .from('simulado_curseduca_sync')
    .select('id, tenant_id, grupos, destino, sincronizar, intervalo_min, ultima_execucao')
    .eq('ativo', true)
    .order('ultima_execucao', { ascending: true, nullsFirst: true })
    .limit(50)

  const agora = Date.now()
  const nowISO = new Date().toISOString()
  let rodadas = 0
  for (const r of (regras ?? []) as any[]) {
    const venceu = !r.ultima_execucao || (agora - new Date(r.ultima_execucao).getTime()) >= (r.intervalo_min ?? 30) * 60_000
    if (!venceu) continue
    if (rodadas >= 3) break // poucas por tick; o resto vem no próximo

    // Lock otimista: só assume se ultima_execucao continua igual ao que lemos.
    let lockQ = svc.from('simulado_curseduca_sync').update({ ultima_execucao: nowISO }).eq('id', r.id)
    lockQ = r.ultima_execucao ? lockQ.eq('ultima_execucao', r.ultima_execucao) : lockQ.is('ultima_execucao', null)
    const { data: lock } = await lockQ.select('id')
    if (!lock?.length) continue // outro tick pegou

    try {
      const cfg = await resolverCfg(r.tenant_id)
      if (!cfg) {
        await svc.from('simulado_curseduca_sync').update({ ultimo_resultado: { ok: false, error: 'Credenciais Curseduca não configuradas.' } }).eq('id', r.id)
        continue
      }
      const resultado = await executarImport({ tenantId: r.tenant_id, cfg }, (r.grupos ?? []) as number[], r.destino ?? { tipo: 'nenhum' }, !!r.sincronizar, Number.MAX_SAFE_INTEGER)
      await svc.from('simulado_curseduca_sync').update({ ultimo_resultado: resultado }).eq('id', r.id)
      rodadas++
    } catch (e: any) {
      await svc.from('simulado_curseduca_sync').update({ ultimo_resultado: { ok: false, error: e?.message ?? 'Falha inesperada.' } }).eq('id', r.id)
    }
  }

  return NextResponse.json({ ok: true, rodadas })
}
