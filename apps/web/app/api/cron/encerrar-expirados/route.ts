import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { rankearSimulado } from '@/lib/ranking'
import { dispararWebhook } from '@/lib/webhooks/dispatch'
import { dadosProgressao } from '@/lib/webhooks/payload'
import { invalidarRelatoriosSimulado } from '@/lib/cache/relatorio-cache'
import { publicarAoVivo } from '@/lib/realtime/pubsub'
import { onSimuladoFinalizado } from '@/lib/gamificacao'
import { contextoNota, calcularNota, type NotaContexto } from '@/lib/simulado/nota'

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

// Contexto de nota canônico (total + anuladas com política) por simulado, memoizado no lote.
// Alinha o auto-encerramento à MESMA nota do finalizar manual/re-correção: anuladas
// pontua_todos valem ponto pra TODOS (inclusive quem foi auto-finalizado por tempo/janela).
async function getCtx(svc: AnyClient, simuladoId: string, cache: Map<string, NotaContexto>): Promise<NotaContexto> {
  const cached = cache.get(simuladoId)
  if (cached !== undefined) return cached
  const ctx = await contextoNota(svc as any, simuladoId)
  cache.set(simuladoId, ctx)
  return ctx
}

async function processar() {
  const svc = createAdminClient()
  const agora = new Date().toISOString()
  const ctxCache = new Map<string, NotaContexto>()
  const afetados = new Set<string>()
  const afetadosTenant = new Map<string, string | null>() // simId → tenant, p/ invalidar cache SÓ do simulado afetado
  let simuladosEncerrados = 0

  // ── Coleta as sessões a finalizar (dois critérios), sem duplicar ──
  const paraFinalizar = new Map<string, SessaoMin>()

  // Simulados de JANELA FIXA cujo `data_fim` já passou (para encerrar depois + finalizar suas sessões).
  const { data: sims } = await svc
    .from('simulado_simulados')
    .select('id, tenant_id')
    .eq('modo_aplicacao', 'janela_fixa')
    .eq('status', 'publicado')
    .not('data_fim', 'is', null)
    .lt('data_fim', agora)
  const simsJanela = (sims ?? []) as any[]
  const janelaSet = new Set(simsJanela.map((s) => s.id as string))

  // TODAS as sessões em andamento numa ÚNICA leitura PAGINADA — elimina o N+1 (antes: 1 query por
  // simulado de janela fixa) e o teto de 5000 (o cenário-alvo é 1000+ simultâneos em vários simulados).
  const emAndamento = await fetchAll<SessaoMin>(() =>
    svc.from('simulado_sessoes_prova')
      .select('id, simulado_id, tenant_id, estudante_id, iniciado_em')
      .eq('status', 'em_andamento')
      .eq('deletado', false)
      .order('id'))

  // 1) Sessão cujo simulado é de janela fixa já expirada → finaliza direto (sem checar tempo).
  for (const s of emAndamento) if (janelaSet.has(s.simulado_id)) paraFinalizar.set(s.id, s)

  // 2) Sessão cujo tempo individual (ou o `data_fim` do simulado) estourou.
  const simIds = [...new Set(emAndamento.map((s) => s.simulado_id))]
  const info = new Map<string, { tempo: number | null; dataFim: string | null; semPunicao: boolean }>()
  if (simIds.length) {
    const si = await fetchAllByIn<any>(simIds, (chunk) =>
      svc.from('simulado_simulados').select('id, tempo_limite_min, data_fim, regras').in('id', chunk).order('id'))
    for (const x of si) info.set(x.id, { tempo: x.tempo_limite_min ?? null, dataFim: x.data_fim ?? null, semPunicao: (x.regras?.permitir_continuar_apos_tempo === true) })
  }
  const nowMs = Date.now()
  for (const s of emAndamento) {
    const meta = info.get(s.simulado_id)
    if (!meta) continue
    let expira: number | null = null
    // "Continuar após o tempo, sem punição": não finaliza pelo limite INDIVIDUAL; só a janela (data_fim) fecha.
    if (!meta.semPunicao && meta.tempo && s.iniciado_em) expira = new Date(s.iniciado_em).getTime() + meta.tempo * 60_000
    if (meta.dataFim) { const df = new Date(meta.dataFim).getTime(); expira = expira === null ? df : Math.min(expira, df) }
    if (expira !== null && expira < nowMs) paraFinalizar.set(s.id, s)
  }

  const lista = [...paraFinalizar.values()]

  // ── Pré-carrega os acertos de TODAS as sessões a finalizar em UMA leitura em lote
  //    (antes era 1 leitura de respostas por sessão → milhares de round-trips no fim da janela). ──
  const respostasPorSessao = new Map<string, { questao_id: string; correta: boolean }[]>()
  if (lista.length) {
    const ids = lista.map((s) => s.id)
    const resp = await fetchAllByIn<any>(ids, (chunk) =>
      svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta').in('sessao_id', chunk).order('sessao_id'))
    for (const r of resp) {
      const arr = respostasPorSessao.get(r.sessao_id) ?? []
      arr.push({ questao_id: r.questao_id, correta: !!r.correta })
      respostasPorSessao.set(r.sessao_id, arr)
    }
  }

  // ── Finaliza em LOTES PARALELOS (idempotente por status='em_andamento') ──
  const eventos: any[] = []
  let sessoesEncerradas = 0
  const finalizar = async (s: SessaoMin) => {
    const ctx = await getCtx(svc, s.simulado_id, ctxCache)
    const resp = respostasPorSessao.get(s.id) ?? []
    const nota = calcularNota(resp, ctx)
    // acertos/total canônicos (p/ gamificação): anuladas pontua_todos contam como acerto e ficam no total.
    const anuladaVals = [...ctx.anuladas.values()]
    const total = ctx.totalQuestoes - anuladaVals.filter((p) => p === 'desconsidera').length
    const acertos = resp.filter((r) => r.correta && !ctx.anuladas.has(r.questao_id)).length
      + anuladaVals.filter((p) => p === 'pontua_todos').length
    const { data: upd } = await svc
      .from('simulado_sessoes_prova')
      .update({ status: 'finalizada', finalizado_em: new Date().toISOString(), nota })
      .eq('id', s.id)
      .eq('status', 'em_andamento') // idempotência: não re-finaliza
      .select('id')
    if (!upd?.length) return
    sessoesEncerradas++
    afetados.add(s.simulado_id)
    afetadosTenant.set(s.simulado_id, s.tenant_id ?? null)
    eventos.push({ tenant_id: s.tenant_id, sessao_id: s.id, tipo: 'auto_finalizou' })
    // Gamificação: XP do simulado auto-encerrado (idempotente pela dedupe do ledger; refId=sessao_id).
    void onSimuladoFinalizado(svc, { tenantId: s.tenant_id, estudanteId: s.estudante_id ?? null, sessaoId: s.id, nota, acertos, total })
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
    if (enc?.length) { simuladosEncerrados++; afetados.add(sim.id); afetadosTenant.set(sim.id, sim.tenant_id ?? null) }
  }

  // Recalcula o ranking de cada simulado afetado + invalida o cache de relatórios SÓ desses
  // simulados (agregados do tenant expiram por TTL — evita recomputar tudo a cada tick ao vivo).
  for (const id of afetados) await rankearSimulado(svc, id)
  for (const [id, t] of afetadosTenant) await invalidarRelatoriosSimulado(t, id)
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
