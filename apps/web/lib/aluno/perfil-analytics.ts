import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember, chaveRelatorio, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'
import type {
  PerfilResumoSemana, PerfilAtividade, PerfilEstatKpi, PerfilVoceMedia,
  PerfilBancaResumo, PerfilForteFraco, PerfilRendimentoHora, PerfilTempoQuestao, PerfilDisciplina,
} from '@/components/brand/interna/perfil/data'

// Blocos ricos do Perfil (spec 05) calculados com DADO REAL do aluno: sessões finalizadas +
// respostas objetivas (correta, respondido_em, tempo_resposta_seg) + taxonomia (disciplina/banca).
// Tudo server-side e com chunk (fetchAllByIn) — nada de fetchAll solto. Blocos sem base retornam null.

const SLOTS = ['6–9h', '9–12h', '12–15h', '15–18h', '18–21h', '21–24h']
const WD = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const DIA_MS = 86400000

type Resp = { sessao_id: string; questao_id: string; correta: boolean | null; alternativa_id: string | null; respondido_em: string | null; tempo_resposta_seg: number | null }
type Sess = { id: string; simulado_id: string | null; iniciado_em: string | null; finalizado_em: string | null; nota: number | null }

export interface PerfilAnalytics {
  resumoSemana: PerfilResumoSemana | null
  atividade: PerfilAtividade | null
  estatKpis: PerfilEstatKpi[] | null
  voceXmedia: PerfilVoceMedia[] | null
  porBanca: PerfilBancaResumo | null
  fortesFracos: { fortes: PerfilForteFraco[]; fracos: PerfilForteFraco[] } | null
  rendimentoHora: PerfilRendimentoHora | null
  tempoPorQuestao: PerfilTempoQuestao | null
  /** Questões respondidas HOJE (BRT) — alimenta a Meta diária. */
  questoesHoje: number
}

const VAZIO: PerfilAnalytics = {
  resumoSemana: null, atividade: null, estatKpis: null, voceXmedia: null,
  porBanca: null, fortesFracos: null, rendimentoHora: null, tempoPorQuestao: null,
  questoesHoje: 0,
}

// ── Helpers de data em horário de Brasília (UTC−3): respondido_em vem como ISO UTC. ──
function brt(iso: string): Date { return new Date(new Date(iso).getTime() - 3 * 3600_000) }
function diaBrt(iso: string): string { const d = brt(iso); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` }
function diaSemanaBrt(iso: string): number { return (brt(iso).getUTCDay() + 6) % 7 } // Seg=0..Dom=6
function slotBrt(iso: string): number { const h = brt(iso).getUTCHours(); if (h < 6) return -1; return Math.min(5, Math.floor((h - 6) / 3)) }
function hojeBrtMeiaNoiteUtcMs(): number { const d = brt(new Date().toISOString()); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + 3 * 3600_000 }
function fmtSeg(s: number): string { const m = Math.floor(s / 60), r = Math.round(s % 60); return m > 0 ? `${m}min ${String(r).padStart(2, '0')}s` : `${r}s` }

export interface PerfilAnalyticsCtx {
  porDisciplina: PerfilDisciplina[]
  notaMedia: number | null
  acertoMedio: number | null
  turmaNota: number | null
  posicaoPercentil: number | null
}

// Janela de 6 meses: os blocos ricos são "recentes" (heatmap/semana/mês/estatísticas). Limitar o
// período corta drasticamente as linhas e os round-trips ao Supabase (era TODA a história do aluno →
// dezenas de queries por abertura de perfil, martelando o banco em produção). Regra [[otimizacao]].
const JANELA_DIAS = 182

/**
 * Monta os blocos ricos do perfil — CACHEADO (TTL do relatório) p/ não recomputar a cada view.
 * `porDisciplina`/`notaMedia`/`acertoMedio` vêm do relatório; `turmaNota`/`posicaoPercentil` da página.
 */
export async function montarPerfilAnalytics(
  svc: SupabaseClient,
  estudanteId: string,
  tenantId: string | null,
  ctx: PerfilAnalyticsCtx,
): Promise<PerfilAnalytics> {
  return remember(
    chaveRelatorio(tenantId, 'perfil-analytics', estudanteId),
    TTL_RELATORIO,
    () => _montarPerfilAnalytics(svc, estudanteId, tenantId, ctx),
  )
}

async function _montarPerfilAnalytics(
  svc: SupabaseClient,
  estudanteId: string,
  tenantId: string | null,
  ctx: PerfilAnalyticsCtx,
): Promise<PerfilAnalytics> {
  try {
    const isoLimite = new Date(Date.now() - JANELA_DIAS * DIA_MS).toISOString()
    const { data: sessRows } = await svc
      .from('simulado_sessoes_prova')
      .select('id, simulado_id, iniciado_em, finalizado_em, nota, is_teste, deletado')
      .eq('estudante_id', estudanteId)
      .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
      .gte('iniciado_em', isoLimite)
      .order('iniciado_em', { ascending: true })
    const sessoes: Sess[] = (sessRows ?? [])
      .filter((s: any) => s.finalizado_em && !s.is_teste && !s.deletado)
      .map((s: any) => ({ id: s.id, simulado_id: s.simulado_id ?? null, iniciado_em: s.iniciado_em, finalizado_em: s.finalizado_em, nota: s.nota != null ? Number(s.nota) : null }))
    if (sessoes.length === 0) return VAZIO
    const sessIds = sessoes.map((s) => s.id)

    const respAll = await fetchAllByIn<Resp>(sessIds, (chunk) =>
      svc.from('simulado_respostas_objetivas')
        .select('sessao_id, questao_id, correta, alternativa_id, respondido_em, tempo_resposta_seg')
        .in('sessao_id', chunk).order('id', { ascending: true }))
    const resp = (respAll ?? []) as Resp[]

    // Taxonomia (disciplina/banca) das questões respondidas.
    const qids = [...new Set(resp.map((r) => r.questao_id))].filter(Boolean)
    const discDe = new Map<string, string>(), bancaDe = new Map<string, string>()
    if (qids.length) {
      const qs = await fetchAllByIn<any>(qids, (chunk) =>
        svc.from('simulado_questoes').select('id, disciplinas:simulado_disciplinas(nome), bancas:simulado_bancas(nome)').in('id', chunk).order('id', { ascending: true }))
      for (const q of (qs ?? []) as any[]) {
        discDe.set(q.id, q.disciplinas?.nome ?? 'Sem disciplina')
        bancaDe.set(q.id, q.bancas?.nome ?? 'Outras')
      }
    }

    const hoje0 = hojeBrtMeiaNoiteUtcMs()
    const questoesHoje = resp.filter((r) => r.respondido_em && new Date(r.respondido_em).getTime() >= hoje0).length

    return {
      resumoSemana: calcResumoSemana(sessoes, resp),
      atividade: calcAtividade(resp, sessoes),
      estatKpis: calcEstatKpis(sessoes, resp, ctx),
      voceXmedia: calcVoceXmedia(ctx),
      porBanca: calcPorBanca(resp, bancaDe),
      fortesFracos: calcFortesFracos(ctx.porDisciplina),
      rendimentoHora: calcRendimentoHora(resp),
      tempoPorQuestao: calcTempoPorQuestao(resp, discDe),
      questoesHoje,
    }
  } catch {
    return VAZIO
  }
}

// ── Resumo da semana (segunda a domingo da semana corrente) vs. semana anterior. ──
function calcResumoSemana(sessoes: Sess[], resp: Resp[]): PerfilResumoSemana | null {
  const hoje = hojeBrtMeiaNoiteUtcMs()
  const diaSem = (new Date(hoje).getUTCDay() + 6) % 7 // Seg=0
  const iniSemana = hoje - diaSem * DIA_MS
  const iniAnterior = iniSemana - 7 * DIA_MS
  const inRange = (iso: string | null, a: number, b: number) => { if (!iso) return false; const t = new Date(iso).getTime(); return t >= a && t < b }

  const respSemana = resp.filter((r) => inRange(r.respondido_em, iniSemana, iniSemana + 7 * DIA_MS))
  const respAnt = resp.filter((r) => inRange(r.respondido_em, iniAnterior, iniSemana))
  const sessSemana = sessoes.filter((s) => inRange(s.finalizado_em, iniSemana, iniSemana + 7 * DIA_MS))
  const sessAnt = sessoes.filter((s) => inRange(s.finalizado_em, iniAnterior, iniSemana))
  if (respSemana.length === 0 && sessSemana.length === 0 && respAnt.length === 0 && sessAnt.length === 0) return null

  const acertoDe = (rs: Resp[]) => { const t = rs.length; const a = rs.filter((r) => r.correta).length; return t ? Math.round((a / t) * 100) : 0 }
  const tempoDe = (ss: Sess[]) => ss.reduce((acc, s) => { if (!s.iniciado_em || !s.finalizado_em) return acc; const m = (new Date(s.finalizado_em).getTime() - new Date(s.iniciado_em).getTime()) / 60000; return acc + (m > 0 ? m : 0) }, 0)

  const q = respSemana.length, qAnt = respAnt.length
  const tMin = Math.round(tempoDe(sessSemana)), tAnt = Math.round(tempoDe(sessAnt))
  const ac = acertoDe(respSemana), acAnt = acertoDe(respAnt)
  const dias = WD.map((label, i) => ({ label, valor: respSemana.filter((r) => r.respondido_em && diaSemanaBrt(r.respondido_em) === i).length }))
  return {
    questoes: q, questoesDeltaPct: qAnt > 0 ? Math.round(((q - qAnt) / qAnt) * 100) : null,
    simulados: sessSemana.length, simuladosDelta: sessSemana.length - sessAnt.length,
    tempoMin: tMin, tempoDeltaMin: tAnt > 0 ? tMin - tAnt : null,
    acerto: ac, acertoDeltaPp: respAnt.length > 0 ? ac - acAnt : null,
    dias,
  }
}

// ── Heatmap de atividade (últimos ~6 meses): nível 0..4 por volume de questões/dia. ──
function calcAtividade(resp: Resp[], sessoes: Sess[]): PerfilAtividade | null {
  const limite = hojeBrtMeiaNoiteUtcMs() - 182 * DIA_MS
  const porDia = new Map<string, number>()
  for (const r of resp) { if (!r.respondido_em || new Date(r.respondido_em).getTime() < limite) continue; const d = diaBrt(r.respondido_em); porDia.set(d, (porDia.get(d) ?? 0) + 1) }
  // sessões finalizadas também marcam dia ativo (ao menos nível 1).
  for (const s of sessoes) { if (!s.finalizado_em || new Date(s.finalizado_em).getTime() < limite) continue; const d = diaBrt(s.finalizado_em); if (!porDia.has(d)) porDia.set(d, 1) }
  if (porDia.size === 0) return null
  const nivel = (n: number) => (n >= 31 ? 4 : n >= 16 ? 3 : n >= 6 ? 2 : 1)
  const dias = [...porDia.entries()].map(([data, n]) => ({ data, nivel: nivel(n) }))
  return { dias, totalDias: porDia.size }
}

// ── 5 KPIs das Estatísticas com série semanal (últimas 7 semanas) e variação. ──
function calcEstatKpis(sessoes: Sess[], resp: Resp[], ctx: { notaMedia: number | null; acertoMedio: number | null; posicaoPercentil: number | null }): PerfilEstatKpi[] | null {
  const hoje = hojeBrtMeiaNoiteUtcMs()
  const diaSem = (new Date(hoje).getUTCDay() + 6) % 7
  const iniSemana = hoje - diaSem * DIA_MS
  const semStart = (i: number) => iniSemana - (6 - i) * 7 * DIA_MS // i=0..6, 0 = 6 semanas atrás
  const idxSem = (iso: string | null) => { if (!iso) return -1; const t = new Date(iso).getTime(); for (let i = 0; i < 7; i++) { const a = semStart(i); if (t >= a && t < a + 7 * DIA_MS) return i } return -1 }

  const notaW: number[][] = Array.from({ length: 7 }, () => [])
  const acW: { a: number; t: number }[] = Array.from({ length: 7 }, () => ({ a: 0, t: 0 }))
  const qW = new Array(7).fill(0)
  const tmpW: number[][] = Array.from({ length: 7 }, () => [])
  for (const s of sessoes) { const i = idxSem(s.finalizado_em); if (i >= 0 && s.nota != null) notaW[i].push(s.nota) }
  for (const r of resp) {
    const i = idxSem(r.respondido_em); if (i < 0) continue
    qW[i]++; acW[i].t++; if (r.correta) acW[i].a++
    if (r.tempo_resposta_seg && r.tempo_resposta_seg > 0) tmpW[i].push(r.tempo_resposta_seg)
  }
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
  const serieNota = notaW.map((w) => Math.round(avg(w) * 10) / 10)
  const serieAc = acW.map((w) => (w.t ? Math.round((w.a / w.t) * 100) : 0))
  const serieQ = qW.slice()
  const serieTmp = tmpW.map((w) => Math.round(avg(w)))

  // "Este mês" (questões): mês corrente vs. mês anterior.
  const d0 = brt(new Date().toISOString())
  const iniMes = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1) + 3 * 3600_000
  const iniMesAnt = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - 1, 1) + 3 * 3600_000
  const qMes = resp.filter((r) => r.respondido_em && new Date(r.respondido_em).getTime() >= iniMes).length
  const qMesAnt = resp.filter((r) => r.respondido_em && new Date(r.respondido_em).getTime() >= iniMesAnt && new Date(r.respondido_em).getTime() < iniMes).length

  const tempos = resp.map((r) => r.tempo_resposta_seg).filter((t): t is number => !!t && t > 0)
  const tMedio = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null

  const dpp = (atual: number, ant: number) => (ant ? atual - ant : 0)
  const out: PerfilEstatKpi[] = []
  if (ctx.notaMedia != null) {
    const d = serieNota[5] ? Math.round((serieNota[6] - serieNota[5]) * 10) / 10 : 0
    out.push({ label: 'Nota média', valor: ctx.notaMedia.toFixed(1).replace('.', ','), delta: d ? `${d > 0 ? '+' : ''}${String(d).replace('.', ',')} vs. sem.` : null, good: d >= 0, serie: serieNota })
  }
  if (ctx.acertoMedio != null) {
    const d = dpp(serieAc[6], serieAc[5])
    out.push({ label: 'Acerto médio', valor: `${Math.round(ctx.acertoMedio)}%`, delta: d ? `${d > 0 ? '+' : ''}${d} pp vs. sem.` : null, good: d >= 0, serie: serieAc })
  }
  out.push({ label: 'Questões no mês', valor: String(qMes), delta: qMesAnt ? `${qMes - qMesAnt >= 0 ? '+' : ''}${Math.round(((qMes - qMesAnt) / qMesAnt) * 100)}% vs. mês` : null, good: qMes >= qMesAnt, serie: serieQ })
  if (tMedio != null) {
    const d = serieTmp[5] ? serieTmp[6] - serieTmp[5] : 0
    out.push({ label: 'Tempo por questão', valor: fmtSeg(tMedio), delta: d ? `${d < 0 ? '−' : '+'}${Math.abs(d)}s vs. sem.` : null, good: d <= 0, serie: serieTmp.map((x) => -x) })
  }
  if (ctx.posicaoPercentil != null) {
    out.push({ label: 'Posição na plataforma', valor: `Top ${ctx.posicaoPercentil}%`, delta: null, good: true, serie: [] })
  }
  return out.length ? out : null
}

// ── Você x média dos alunos (só linhas com média real). ──
function calcVoceXmedia(ctx: { notaMedia: number | null; acertoMedio: number | null; turmaNota: number | null; porDisciplina: PerfilDisciplina[] }): PerfilVoceMedia[] | null {
  const out: PerfilVoceMedia[] = []
  if (ctx.notaMedia != null && ctx.turmaNota != null) {
    out.push({ label: 'Nota média', voce: Math.round(ctx.notaMedia * 10) / 10, media: Math.round(ctx.turmaNota * 10) / 10, melhor: ctx.notaMedia >= ctx.turmaNota })
  }
  // Acerto médio da turma = média ponderada do acerto por disciplina (turma) — fonte real já carregada.
  if (ctx.acertoMedio != null && ctx.porDisciplina.length) {
    const turmaAc = Math.round(ctx.porDisciplina.reduce((a, d) => a + d.turma, 0) / ctx.porDisciplina.length)
    out.push({ label: 'Acerto médio', voce: Math.round(ctx.acertoMedio), media: turmaAc, sufixo: '%', melhor: Math.round(ctx.acertoMedio) >= turmaAc })
  }
  return out.length ? out : null
}

// ── Acerto por banca + donut geral (acertos/erros/brancos). ──
function calcPorBanca(resp: Resp[], bancaDe: Map<string, string>): PerfilBancaResumo | null {
  if (resp.length === 0) return null
  const agg = new Map<string, { a: number; t: number }>()
  let acertos = 0, erros = 0, brancos = 0
  for (const r of resp) {
    const banca = bancaDe.get(r.questao_id) ?? 'Outras'
    const v = agg.get(banca) ?? { a: 0, t: 0 }; v.t++; if (r.correta) v.a++; agg.set(banca, v)
    if (r.alternativa_id == null) brancos++
    else if (r.correta) acertos++
    else erros++
  }
  let bancas = [...agg.entries()].map(([nome, v]) => ({ nome, acerto: v.t ? Math.round((v.a / v.t) * 100) : 0, total: v.t })).sort((a, b) => b.total - a.total)
  if (bancas.length > 6) {
    const top = bancas.slice(0, 5)
    const resto = bancas.slice(5)
    const t = resto.reduce((a, b) => a + b.total, 0)
    const ac = resto.reduce((a, b) => a + (b.acerto * b.total) / 100, 0)
    top.push({ nome: 'Outras', acerto: t ? Math.round((ac / t) * 100) : 0, total: t })
    bancas = top
  }
  return { bancas, acertos, erros, brancos }
}

// ── Pontos fortes / a reforçar (do acerto por disciplina). ──
function calcFortesFracos(porDisc: PerfilDisciplina[]): { fortes: PerfilForteFraco[]; fracos: PerfilForteFraco[] } | null {
  if (!porDisc.length) return null
  const ord = [...porDisc].sort((a, b) => b.aluno - a.aluno)
  const fortes = ord.slice(0, 3).map((d) => ({ nome: d.nome, pct: d.aluno, trend: 'up' as const }))
  const fracos = ord.slice(-3).reverse().map((d) => ({ nome: d.nome, pct: d.aluno, trend: 'down' as const }))
  return { fortes, fracos }
}

// ── "Quando você rende mais": matriz dia×faixa (acerto %; -1 sem dado). ──
function calcRendimentoHora(resp: Resp[]): PerfilRendimentoHora | null {
  const cel: { a: number; t: number }[][] = Array.from({ length: 7 }, () => Array.from({ length: 6 }, () => ({ a: 0, t: 0 })))
  let algum = false
  for (const r of resp) {
    if (!r.respondido_em) continue
    const slot = slotBrt(r.respondido_em); if (slot < 0) continue
    const dia = diaSemanaBrt(r.respondido_em)
    const c = cel[dia][slot]; c.t++; if (r.correta) c.a++; algum = true
  }
  if (!algum) return null
  const matriz = cel.map((row) => row.map((c) => (c.t ? Math.round((c.a / c.t) * 100) : -1)))
  // Insight: faixa de hora (coluna) com melhor acerto agregado nos dias úteis.
  let melhorSlot = -1, melhorPct = -1
  for (let s = 0; s < 6; s++) { let a = 0, t = 0; for (let d = 0; d < 5; d++) { a += cel[d][s].a; t += cel[d][s].t } if (t >= 5) { const p = (a / t) * 100; if (p > melhorPct) { melhorPct = p; melhorSlot = s } } }
  const insight = melhorSlot >= 0 ? `Você rende mais no período ${SLOTS[melhorSlot]} nos dias úteis.` : null
  return { matriz, slots: SLOTS, dias: WD, insight }
}

// ── Tempo por questão (geral / acerta / erra / matéria mais lenta e mais rápida). ──
function calcTempoPorQuestao(resp: Resp[], discDe: Map<string, string>): PerfilTempoQuestao | null {
  const comTempo = resp.filter((r) => r.tempo_resposta_seg && r.tempo_resposta_seg > 0)
  if (comTempo.length === 0) return null
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null)
  const geral = avg(comTempo.map((r) => r.tempo_resposta_seg as number))
  const acerta = avg(comTempo.filter((r) => r.correta).map((r) => r.tempo_resposta_seg as number))
  const erra = avg(comTempo.filter((r) => r.alternativa_id != null && !r.correta).map((r) => r.tempo_resposta_seg as number))
  const porDisc = new Map<string, number[]>()
  for (const r of comTempo) { const d = discDe.get(r.questao_id) ?? 'Sem disciplina'; const arr = porDisc.get(d) ?? []; arr.push(r.tempo_resposta_seg as number); porDisc.set(d, arr) }
  const medias = [...porDisc.entries()].filter(([, a]) => a.length >= 3).map(([nome, a]) => ({ nome, seg: Math.round(a.reduce((x, y) => x + y, 0) / a.length) })).sort((a, b) => b.seg - a.seg)
  const lenta = medias[0] ?? null
  const rapida = medias.length > 1 ? medias[medias.length - 1] : null
  return { geralSeg: geral, acertaSeg: acerta, erraSeg: erra, lenta, rapida }
}
