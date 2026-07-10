import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { rankearSimulado } from '@/lib/ranking'

export const dynamic = 'force-dynamic'

/**
 * Auto-encerramento server-side (cron). Protegido por CRON_SECRET.
 * 1) Janela fixa cujo `data_fim` já passou → encerra o simulado e finaliza suas sessões em andamento.
 * 2) Qualquer sessão em andamento cujo tempo individual (ou o `data_fim` do simulado) estourou → finaliza.
 * Idempotente: só toca em sessões `em_andamento` e simulados `publicado`.
 * Chamado pelo worker (setInterval) ou por um cron externo.
 */
function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false // desabilitado até configurar o segredo
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return h === segredo
}

type AnyClient = ReturnType<typeof createAdminClient>
type SessaoMin = { id: string; simulado_id: string; tenant_id: string | null; iniciado_em?: string | null }

async function totalValidas(svc: AnyClient, simuladoId: string, cache: Map<string, number>): Promise<number> {
  const cached = cache.get(simuladoId)
  if (cached !== undefined) return cached
  const { count } = await svc
    .from('simulado_prova_questoes')
    .select('*', { count: 'exact', head: true })
    .eq('simulado_id', simuladoId)
    .eq('anulada', false)
  const t = count ?? 0
  cache.set(simuladoId, t)
  return t
}

/** Finaliza + calcula nota de uma sessão (idempotente por status='em_andamento'). */
async function finalizarSessao(svc: AnyClient, s: SessaoMin, cache: Map<string, number>): Promise<boolean> {
  const total = await totalValidas(svc, s.simulado_id, cache)
  const { data: resp } = await svc.from('simulado_respostas_objetivas').select('correta').eq('sessao_id', s.id)
  const acertos = (resp ?? []).filter((r: any) => r.correta).length
  const nota = total > 0 ? Math.round((acertos / total) * 10 * 100) / 100 : 0
  const { data: upd } = await svc
    .from('simulado_sessoes_prova')
    .update({ status: 'finalizada', finalizado_em: new Date().toISOString(), nota })
    .eq('id', s.id)
    .eq('status', 'em_andamento') // idempotência: não re-finaliza
    .select('id')
  if (!upd?.length) return false
  await svc.from('simulado_sessao_eventos').insert({ tenant_id: s.tenant_id, sessao_id: s.id, tipo: 'auto_finalizou' })
  return true
}

async function processar() {
  const svc = createAdminClient()
  const agora = new Date().toISOString()
  const cache = new Map<string, number>()
  const afetados = new Set<string>()
  let sessoesEncerradas = 0
  let simuladosEncerrados = 0

  // 1) Janela fixa expirada → encerra simulado + finaliza sessões em andamento.
  const { data: sims } = await svc
    .from('simulado_simulados')
    .select('id')
    .eq('modo_aplicacao', 'janela_fixa')
    .eq('status', 'publicado')
    .not('data_fim', 'is', null)
    .lt('data_fim', agora)
  for (const sim of (sims ?? []) as any[]) {
    const { data: sess } = await svc
      .from('simulado_sessoes_prova')
      .select('id, simulado_id, tenant_id')
      .eq('simulado_id', sim.id)
      .eq('status', 'em_andamento')
      .eq('deletado', false)
    for (const s of (sess ?? []) as SessaoMin[]) {
      if (await finalizarSessao(svc, s, cache)) { sessoesEncerradas++; afetados.add(sim.id) }
    }
    const { data: enc } = await svc
      .from('simulado_simulados')
      .update({ status: 'encerrado' })
      .eq('id', sim.id)
      .eq('status', 'publicado')
      .select('id')
    if (enc?.length) { simuladosEncerrados++; afetados.add(sim.id) }
  }

  // 2) Sessões em andamento com tempo individual (ou data_fim) estourado — qualquer modo.
  const { data: emAndamento } = await svc
    .from('simulado_sessoes_prova')
    .select('id, simulado_id, tenant_id, iniciado_em')
    .eq('status', 'em_andamento')
    .eq('deletado', false)
    .limit(5000)
  const simIds = [...new Set((emAndamento ?? []).map((s: any) => s.simulado_id))]
  const info = new Map<string, { tempo: number | null; dataFim: string | null }>()
  if (simIds.length) {
    const { data: si } = await svc.from('simulado_simulados').select('id, tempo_limite_min, data_fim').in('id', simIds)
    for (const x of (si ?? []) as any[]) info.set(x.id, { tempo: x.tempo_limite_min ?? null, dataFim: x.data_fim ?? null })
  }
  const nowMs = Date.now()
  for (const s of (emAndamento ?? []) as SessaoMin[]) {
    const meta = info.get(s.simulado_id)
    if (!meta) continue
    let expira: number | null = null
    if (meta.tempo && s.iniciado_em) expira = new Date(s.iniciado_em).getTime() + meta.tempo * 60_000
    if (meta.dataFim) { const df = new Date(meta.dataFim).getTime(); expira = expira === null ? df : Math.min(expira, df) }
    if (expira !== null && expira < nowMs) {
      if (await finalizarSessao(svc, s, cache)) { sessoesEncerradas++; afetados.add(s.simulado_id) }
    }
  }

  // 3) Recalcula o ranking de cada simulado afetado.
  for (const id of afetados) await rankearSimulado(svc, id)

  return { ok: true, simuladosEncerrados, sessoesEncerradas, simuladosAfetados: afetados.size }
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  try {
    return NextResponse.json(await processar())
  } catch (e: any) {
    console.error('[cron encerrar-expirados] erro:', e?.message)
    return NextResponse.json({ ok: false, error: e?.message ?? 'Falha.' }, { status: 500 })
  }
}
