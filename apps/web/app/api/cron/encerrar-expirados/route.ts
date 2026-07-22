import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { rankearSimulado } from '@/lib/ranking'
import { dispararWebhook } from '@/lib/webhooks/dispatch'
import { dadosProgressao } from '@/lib/webhooks/payload'
import { invalidarRelatorios } from '@/lib/cache/relatorio-cache'
import { publicarAoVivo } from '@/lib/realtime/pubsub'

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
type SessaoMin = { id: string; simulado_id: string; tenant_id: string | null; estudante_id?: string | null; iniciado_em?: string | null }

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

async function processar() {
  const svc = createAdminClient()
  const agora = new Date().toISOString()
  const totalCache = new Map<string, number>()
  const afetados = new Set<string>()
  const tenantsAfetados = new Set<string>() // p/ invalidar o cache de relatórios (1x por tenant, no fim)
  let simuladosEncerrados = 0

  // ── Coleta as sessões a finalizar (dois critérios), sem duplicar ──
  const paraFinalizar = new Map<string, SessaoMin>()

  // 1) Janela fixa expirada → todas as sessões em andamento + encerra o simulado depois.
  const { data: sims } = await svc
    .from('simulado_simulados')
    .select('id, tenant_id')
    .eq('modo_aplicacao', 'janela_fixa')
    .eq('status', 'publicado')
    .not('data_fim', 'is', null)
    .lt('data_fim', agora)
  const simsJanela = (sims ?? []) as any[]
  for (const sim of simsJanela) {
    const { data: sess } = await svc
      .from('simulado_sessoes_prova')
      .select('id, simulado_id, tenant_id, estudante_id')
      .eq('simulado_id', sim.id)
      .eq('status', 'em_andamento')
      .eq('deletado', false)
    for (const s of (sess ?? []) as SessaoMin[]) paraFinalizar.set(s.id, s)
  }

  // 2) Sessões em andamento (qualquer modo) cujo tempo individual (ou data_fim) estourou.
  const { data: emAndamento } = await svc
    .from('simulado_sessoes_prova')
    .select('id, simulado_id, tenant_id, estudante_id, iniciado_em')
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
    if (expira !== null && expira < nowMs) paraFinalizar.set(s.id, s)
  }

  const lista = [...paraFinalizar.values()]

  // ── Pré-carrega os acertos de TODAS as sessões a finalizar em UMA leitura em lote
  //    (antes era 1 leitura de respostas por sessão → milhares de round-trips no fim da janela). ──
  const acertosPorSessao = new Map<string, number>()
  if (lista.length) {
    const ids = lista.map((s) => s.id)
    const resp = await fetchAllByIn<any>(ids, (chunk) =>
      svc.from('simulado_respostas_objetivas').select('sessao_id, correta').in('sessao_id', chunk).order('sessao_id'))
    for (const r of resp) if (r.correta) acertosPorSessao.set(r.sessao_id, (acertosPorSessao.get(r.sessao_id) ?? 0) + 1)
  }

  // ── Finaliza em LOTES PARALELOS (idempotente por status='em_andamento') ──
  const eventos: any[] = []
  let sessoesEncerradas = 0
  const finalizar = async (s: SessaoMin) => {
    const total = await totalValidas(svc, s.simulado_id, totalCache)
    const acertos = acertosPorSessao.get(s.id) ?? 0
    const nota = total > 0 ? Math.round((acertos / total) * 100 * 100) / 100 : 0 // escala 0–100 (mesma fórmula de antes)
    const { data: upd } = await svc
      .from('simulado_sessoes_prova')
      .update({ status: 'finalizada', finalizado_em: new Date().toISOString(), nota })
      .eq('id', s.id)
      .eq('status', 'em_andamento') // idempotência: não re-finaliza
      .select('id')
    if (!upd?.length) return
    sessoesEncerradas++
    afetados.add(s.simulado_id)
    if (s.tenant_id) tenantsAfetados.add(s.tenant_id)
    eventos.push({ tenant_id: s.tenant_id, sessao_id: s.id, tipo: 'auto_finalizou' })
    // Notifica sistemas externos (webhooks/n8n): estudante não finalizou (auto-encerrado por tempo/janela).
    if (s.estudante_id) {
      await dispararWebhook(s.tenant_id, 'estudante.nao_finalizou',
        await dadosProgressao(svc as any, { id: s.id, simulado_id: s.simulado_id, estudante_id: s.estudante_id }, { nota, motivo: 'auto_encerramento' }))
    }
  }
  for (let i = 0; i < lista.length; i += 25) await Promise.all(lista.slice(i, i + 25).map(finalizar))

  // Eventos de auditoria em UM insert (antes era 1 por sessão).
  if (eventos.length) await svc.from('simulado_sessao_eventos').insert(eventos)

  // Encerra os simulados de janela fixa cujo data_fim passou.
  for (const sim of simsJanela) {
    const { data: enc } = await svc
      .from('simulado_simulados')
      .update({ status: 'encerrado' })
      .eq('id', sim.id)
      .eq('status', 'publicado')
      .select('id')
    if (enc?.length) { simuladosEncerrados++; afetados.add(sim.id); if (sim.tenant_id) tenantsAfetados.add(sim.tenant_id) }
  }

  // Recalcula o ranking de cada simulado afetado + invalida o cache de relatórios (1x por tenant).
  for (const id of afetados) await rankearSimulado(svc, id)
  for (const t of tenantsAfetados) await invalidarRelatorios(t)
  for (const id of afetados) void publicarAoVivo(id) // realtime: painel "Ao Vivo" (Fase 2)

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
