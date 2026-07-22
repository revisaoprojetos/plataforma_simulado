import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import type { DadosRelatorioGrafico } from './relatorio-grafico-view'
import { remember, chaveRelatorio, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'
import { relatorioGraficoSql, type GraficoData } from '@/lib/data/relatorios.repo'

const TENANT_FALLBACK = '00000000-0000-0000-0000-000000000000'
const STATUS_LABEL: Record<string, string> = { finalizada: 'Finalizadas', em_andamento: 'Em andamento', aguardando: 'Aguardando' }

/** Monta a visão geral da plataforma (totais, séries temporais, disciplinas, distribuição). Cacheado por tenant. */
export async function montarRelatorioGrafico(svc: SupabaseClient, tenantId: string | null): Promise<DadosRelatorioGrafico> {
  return remember(chaveRelatorio(tenantId, 'graficos'), TTL_RELATORIO, () => _montarRelatorioGrafico(svc, tenantId))
}

async function _montarRelatorioGrafico(svc: SupabaseClient, tenantId: string | null): Promise<DadosRelatorioGrafico> {
  if (process.env.REPORT_SQL === 'shadow') {
    const [sql, pg] = await Promise.all([graficoViaSql(tenantId), _graficoViaPostgrest(svc, tenantId)])
    if (sql) compararGrafico(sql, pg)
    return pg
  }
  const viaSql = await graficoViaSql(tenantId)
  if (viaSql) return viaSql
  return _graficoViaPostgrest(svc, tenantId)
}

/** Caminho SQL direto: counts + por-sessão + por-disciplina agregados no banco. */
async function graficoViaSql(tenantId: string | null): Promise<DadosRelatorioGrafico | null> {
  const d = await relatorioGraficoSql(tenantId ?? TENANT_FALLBACK)
  if (!d) return null
  return montarGrafico(d)
}

function montarGrafico(d: GraficoData): DadosRelatorioGrafico {
  const sessoes = d.sessoes.slice().sort((a, b) => String(b.iniciado_em ?? '').localeCompare(String(a.iniciado_em ?? '')))
  const finalizadas = sessoes.filter((s) => s.status === 'finalizada')
  const notas = finalizadas.map((s) => (s.nota != null ? Number(s.nota) : null)).filter((n): n is number => n != null)
  const notaMediaGeral = notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null
  let totRespostas = 0, totAc = 0
  for (const s of sessoes) { totRespostas += s.tt ?? 0; totAc += s.ac ?? 0 }
  const acertoMedioGeral = totRespostas ? Math.round((totAc / totRespostas) * 100) : null

  const porStatus = [...sessoes.reduce((m, s) => m.set(s.status ?? '', (m.get(s.status ?? '') ?? 0) + 1), new Map<string, number>()).entries()]
    .map(([k, v]) => ({ nome: STATUS_LABEL[k] ?? k, valor: v as number }))
  const porDisciplina = d.disciplinas.map((x) => ({ nome: x.disc, pct: x.tt ? Math.round((x.ac / x.tt) * 100) : 0, tt: x.tt })).sort((a, b) => b.tt - a.tt).slice(0, 15)
  const faixas = [[0, 2], [2, 4], [4, 6], [6, 8], [8, 10.0001]]
  const distribuicaoNotas = faixas.map(([lo, hi]) => ({ faixa: `${lo}–${hi === 10.0001 ? 10 : hi}`, alunos: notas.filter((n) => n >= lo && n < hi).length }))
  const sessLite = sessoes.map((s) => ({ data: s.iniciado_em as any, nota: s.nota != null ? Number(s.nota) : null, acerto: s.tt ? Math.round((s.ac / s.tt) * 100) : null }))

  return {
    totais: { simulados: d.counts.sims, estudantes: d.counts.est, sessoes: sessoes.length, finalizadas: finalizadas.length, questoes: d.counts.q, respostas: totRespostas },
    notaMediaGeral, acertoMedioGeral, sessoes: sessLite, porStatus, porDisciplina, distribuicaoNotas,
  }
}

/** Loga divergências SQL × PostgREST (modo shadow). */
function compararGrafico(sql: DadosRelatorioGrafico, pg: DadosRelatorioGrafico): void {
  const probs: string[] = []
  const t1 = sql.totais, t2 = pg.totais
  for (const k of ['simulados', 'estudantes', 'sessoes', 'finalizadas', 'questoes', 'respostas'] as const) if (t1[k] !== t2[k]) probs.push(`${k} ${t1[k]}≠${t2[k]}`)
  if (sql.acertoMedioGeral !== pg.acertoMedioGeral) probs.push(`acertoMedio ${sql.acertoMedioGeral}≠${pg.acertoMedioGeral}`)
  const nmOk = (a: number | null, b: number | null) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.01)
  if (!nmOk(sql.notaMediaGeral, pg.notaMediaGeral)) probs.push(`notaMedia ${sql.notaMediaGeral}≠${pg.notaMediaGeral}`)
  if (sql.porDisciplina.length !== pg.porDisciplina.length) probs.push(`nDisc ${sql.porDisciplina.length}≠${pg.porDisciplina.length}`)
  console.log(`[shadow graficos] ${probs.length ? 'DIFF ' + probs.join(', ') : 'ok'}`)
}

/** Caminho PostgREST original (fallback). */
async function _graficoViaPostgrest(svc: SupabaseClient, tenantId: string | null): Promise<DadosRelatorioGrafico> {
  const { data: sims } = await svc.from('simulado_simulados').select('id').eq('deletado', false).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
  const simIds = (sims ?? []).map((s: any) => s.id)

  const [{ count: nEst }, { count: nQ }] = await Promise.all([
    svc.from('simulado_estudantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000'),
    svc.from('simulado_questoes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').eq('deletado', false),
  ])

  let sessoes: any[] = []
  if (simIds.length) {
    // fetchAllByIn: o `.limit(5000)` truncava em ~1000 (teto do PostgREST) → contagens/gráficos incoerentes.
    sessoes = await fetchAllByIn<any>(simIds, (chunk) =>
      svc.from('simulado_sessoes_prova')
        .select('id, simulado_id, status, nota, iniciado_em, estudante_id')
        .in('simulado_id', chunk).eq('is_teste', false).eq('deletado', false).order('id'))
    sessoes.sort((a, b) => (b.iniciado_em ?? '').localeCompare(a.iniciado_em ?? '')) // mais recentes primeiro (como antes)
  }

  const acPorSess = new Map<string, number>(), ttPorSess = new Map<string, number>()
  const acPorDisc = new Map<string, { ac: number; tt: number }>()
  let totRespostas = 0, totAc = 0
  const sessIds = sessoes.map((s) => s.id)
  if (sessIds.length) {
    const respArr = await fetchAllByIn<any>(sessIds, (chunk) =>
      svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta').in('sessao_id', chunk).order('id'))
    const qids = [...new Set(respArr.map((r) => r.questao_id))]
    const discDeQ = new Map<string, string>()
    if (qids.length) { const { data: qs } = await svc.from('simulado_questoes').select('id, disciplinas:simulado_disciplinas(nome)').in('id', qids); for (const q of (qs ?? []) as any[]) discDeQ.set(q.id, q.disciplinas?.nome ?? 'Sem disciplina') }
    for (const r of respArr) {
      totRespostas++; if (r.correta) totAc++
      ttPorSess.set(r.sessao_id, (ttPorSess.get(r.sessao_id) ?? 0) + 1)
      if (r.correta) acPorSess.set(r.sessao_id, (acPorSess.get(r.sessao_id) ?? 0) + 1)
      const disc = discDeQ.get(r.questao_id) ?? 'Sem disciplina'
      const v = acPorDisc.get(disc) ?? { ac: 0, tt: 0 }; v.tt++; if (r.correta) v.ac++; acPorDisc.set(disc, v)
    }
  }

  const finalizadas = sessoes.filter((s) => s.status === 'finalizada')
  const notas = finalizadas.map((s) => (s.nota != null ? Number(s.nota) : null)).filter((n): n is number => n != null)
  const notaMediaGeral = notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null
  const acertoMedioGeral = totRespostas ? Math.round((totAc / totRespostas) * 100) : null

  const porStatus = [...sessoes.reduce((m, s) => m.set(s.status, (m.get(s.status) ?? 0) + 1), new Map<string, number>()).entries()]
    .map(([k, v]) => ({ nome: STATUS_LABEL[k] ?? k, valor: v as number }))
  const porDisciplina = [...acPorDisc.entries()].map(([nome, v]) => ({ nome, pct: v.tt ? Math.round((v.ac / v.tt) * 100) : 0, tt: v.tt })).sort((a, b) => b.tt - a.tt).slice(0, 15)
  const faixas = [[0, 2], [2, 4], [4, 6], [6, 8], [8, 10.0001]]
  const distribuicaoNotas = faixas.map(([lo, hi]) => ({ faixa: `${lo}–${hi === 10.0001 ? 10 : hi}`, alunos: notas.filter((n) => n >= lo && n < hi).length }))

  const sessLite = sessoes.map((s) => ({ data: s.iniciado_em, nota: s.nota != null ? Number(s.nota) : null, acerto: ttPorSess.get(s.id) ? Math.round(((acPorSess.get(s.id) ?? 0) / ttPorSess.get(s.id)!) * 100) : null }))

  return {
    totais: { simulados: simIds.length, estudantes: nEst ?? 0, sessoes: sessoes.length, finalizadas: finalizadas.length, questoes: nQ ?? 0, respostas: totRespostas },
    notaMediaGeral, acertoMedioGeral, sessoes: sessLite, porStatus, porDisciplina, distribuicaoNotas,
  }
}
