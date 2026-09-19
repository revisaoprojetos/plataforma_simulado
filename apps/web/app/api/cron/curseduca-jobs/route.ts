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

// Jobs travados em `processando` há mais que isto voltam para `pendente` (o processo que os
// pegou morreu no meio — corte de proxy, réplica reiniciada). Generoso porque um import pode
// legitimamente demorar vários minutos; 20 min é bem acima do normal.
const LOCK_TTL_MIN = 20

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  const svc = createAdminClient()

  // 0) Recupera jobs presos: `processando` com `locked_at` mais velho que o TTL → volta p/ `pendente`.
  // Tolerante: se a coluna `locked_at` ainda não foi migrada, apenas pula a recuperação (nunca usa
  // `created_at` como proxy, para não reprocessar um import longo que ainda está rodando).
  try {
    const corte = new Date(Date.now() - LOCK_TTL_MIN * 60_000).toISOString()
    await svc.from('simulado_curseduca_jobs').update({ status: 'pendente' }).eq('status', 'processando').lt('locked_at', corte)
  } catch { /* coluna locked_at ausente → sem recuperação até migrar */ }

  // Poucos por tick (cada import pode demorar). O próximo tick pega o resto.
  const { data: jobs } = await svc
    .from('simulado_curseduca_jobs')
    .select('id, tenant_id, grupos, destino, sincronizar')
    .eq('status', 'pendente')
    .order('created_at', { ascending: true })
    .limit(2)

  let processados = 0
  for (const job of (jobs ?? []) as any[]) {
    // Lock: só assume se ainda estiver pendente (evita corrida entre réplicas do worker). Carimba
    // `locked_at` p/ a recuperação de lock preso; tolerante se a coluna ainda não foi migrada.
    let lockRes = await svc.from('simulado_curseduca_jobs').update({ status: 'processando', locked_at: new Date().toISOString() }).eq('id', job.id).eq('status', 'pendente').select('id')
    if (lockRes.error && /locked_at|column/i.test(lockRes.error.message)) {
      lockRes = await svc.from('simulado_curseduca_jobs').update({ status: 'processando' }).eq('id', job.id).eq('status', 'pendente').select('id')
    }
    if (!lockRes.data?.length) continue

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
