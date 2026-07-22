import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { executarImport } from '@/lib/curseduca/import-core'
import { resolverCfgCurseduca } from '@/lib/curseduca/cfg'

export const dynamic = 'force-dynamic'

/**
 * Processa jobs de importação da Curseduca em segundo plano. Protegido por CRON_SECRET.
 * Chamado pelo worker (setInterval) — pega jobs pendentes, roda o import SEM limite de
 * detalhe (não sofre timeout de request) e grava o resultado. Idempotente: só assume um
 * job que ainda está `pendente` (lock via update condicional).
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

  // Poucos por tick (cada import pode demorar). O próximo tick pega o resto.
  const { data: jobs } = await svc
    .from('simulado_curseduca_jobs')
    .select('id, tenant_id, grupos, destino, sincronizar')
    .eq('status', 'pendente')
    .order('created_at', { ascending: true })
    .limit(2)

  let processados = 0
  for (const job of (jobs ?? []) as any[]) {
    // Lock: só assume se ainda estiver pendente (evita corrida entre réplicas do worker).
    const { data: lock } = await svc.from('simulado_curseduca_jobs').update({ status: 'processando' }).eq('id', job.id).eq('status', 'pendente').select('id')
    if (!lock?.length) continue

    try {
      const cfg = await resolverCfgCurseduca(job.tenant_id)
      if (!cfg) {
        await svc.from('simulado_curseduca_jobs').update({ status: 'erro', erro: 'Credenciais Curseduca não configuradas para este tenant.' }).eq('id', job.id)
        continue
      }
      const resultado = await executarImport(
        { tenantId: job.tenant_id, cfg },
        (job.grupos ?? []) as number[],
        job.destino ?? { tipo: 'nenhum' },
        !!job.sincronizar,
        Number.MAX_SAFE_INTEGER, // job não tem limite de detalhe
      )
      await svc.from('simulado_curseduca_jobs').update({
        status: resultado.ok ? 'concluido' : 'erro',
        resultado,
        erro: resultado.ok ? null : (resultado.error ?? 'Falha na importação.'),
      }).eq('id', job.id)
      processados++
    } catch (e: any) {
      await svc.from('simulado_curseduca_jobs').update({ status: 'erro', erro: e?.message ?? 'Falha inesperada.' }).eq('id', job.id)
    }
  }

  return NextResponse.json({ ok: true, processados })
}
