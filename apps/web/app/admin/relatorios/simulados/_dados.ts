import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { tipoDoSimulado } from '@/lib/simulado/tipo'
import type { DadosRelatorioSimulado, LinhaExportSimulado } from './relatorio-simulado-view'

const fmtDur = (min: number) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min` }
const fmtSeg = (seg: number) => { const s = Math.round(seg); const m = Math.floor(s / 60), r = s % 60; return m > 0 ? `${m}min ${String(r).padStart(2, '0')}s` : `${r}s` }
const labelClass = (c?: string | null) => (c === 'passaporte' ? 'Passaporte' : c === 'normal' ? 'Normal' : (c ?? '—'))

/** Monta o relatório completo de um simulado (KPIs, gráficos, ranking e linhas do export). */
export async function montarRelatorioSimulado(svc: SupabaseClient, simId: string, tenantId: string | null): Promise<DadosRelatorioSimulado | null> {
  const { data: alvo } = await svc.from('simulado_simulados').select('id, titulo').eq('id', simId).eq('deletado', false).eq('tenant_id', tenantId ?? '').maybeSingle()
  if (!alvo) return null

  // Questões do simulado (ordem, tipo, disciplina).
  const { data: pq } = await svc
    .from('simulado_prova_questoes')
    .select('questao_id, ordem, questoes:simulado_questoes(id, tipo, disciplinas:simulado_disciplinas(nome))')
    .eq('simulado_id', simId).order('ordem')
  const ordemDeQ = new Map<string, number>()
  const discDeQ = new Map<string, string>()
  const tiposQ: (string | null)[] = []
  for (const r of (pq ?? []) as any[]) {
    const qid = r.questoes?.id ?? r.questao_id
    ordemDeQ.set(qid, r.ordem ?? 0)
    discDeQ.set(qid, r.questoes?.disciplinas?.nome ?? 'Sem disciplina')
    tiposQ.push(r.questoes?.tipo)
  }

  // Sessões reais (não teste).
  const { data: sessoes } = await svc
    .from('simulado_sessoes_prova')
    .select('id, estudante_id, status, nota, iniciado_em, finalizado_em')
    .eq('simulado_id', simId).eq('is_teste', false).eq('deletado', false)
  const sess = (sessoes ?? []) as any[]
  const finalizadas = sess.filter((s) => s.status === 'finalizada')
  const sessIds = sess.map((s) => s.id)

  const totalQuestoes = (pq ?? []).length
  const discOrdem = new Map<string, number>()
  for (const [qid, disc] of discDeQ) { const o = ordemDeQ.get(qid) ?? 0; if (!discOrdem.has(disc) || o < discOrdem.get(disc)!) discOrdem.set(disc, o) }
  const disciplinas = [...discOrdem.entries()].sort((a, b) => a[1] - b[1]).map(([d]) => d)

  // Respostas de todas as sessões.
  const acPorSess = new Map<string, number>(), ttPorSess = new Map<string, number>()
  const acPorDisc = new Map<string, { ac: number; tt: number }>()
  const acPorQ = new Map<string, { ac: number; tt: number }>()
  const discAcPorSess = new Map<string, Record<string, number>>()
  if (sessIds.length) {
    const { data: resp } = await svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta').in('sessao_id', sessIds)
    for (const r of (resp ?? []) as any[]) {
      ttPorSess.set(r.sessao_id, (ttPorSess.get(r.sessao_id) ?? 0) + 1)
      if (r.correta) acPorSess.set(r.sessao_id, (acPorSess.get(r.sessao_id) ?? 0) + 1)
      const disc = discDeQ.get(r.questao_id) ?? 'Sem disciplina'
      const d = acPorDisc.get(disc) ?? { ac: 0, tt: 0 }; d.tt++; if (r.correta) d.ac++; acPorDisc.set(disc, d)
      const q = acPorQ.get(r.questao_id) ?? { ac: 0, tt: 0 }; q.tt++; if (r.correta) q.ac++; acPorQ.set(r.questao_id, q)
      if (r.correta) { const g = discAcPorSess.get(r.sessao_id) ?? {}; g[disc] = (g[disc] ?? 0) + 1; discAcPorSess.set(r.sessao_id, g) }
    }
  }

  // Estudantes: nome, e-mail, telefone e classificação.
  const estIds = [...new Set(sess.map((s) => s.estudante_id).filter(Boolean))]
  const infoEst = new Map<string, { nome: string; email: string | null; telefone: string | null; classificacao: string | null }>()
  if (estIds.length) {
    const { data: ests } = await svc.from('simulado_estudantes').select('id, nome, email, telefone, classificacao').in('id', estIds)
    for (const e of (ests ?? []) as any[]) infoEst.set(e.id, { nome: e.nome ?? 'Estudante', email: e.email ?? null, telefone: e.telefone ?? null, classificacao: e.classificacao ?? null })
  }

  // Métricas.
  const notas = finalizadas.map((s) => (s.nota != null ? Number(s.nota) : null)).filter((n): n is number => n != null)
  const notaMedia = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null
  const melhorNota = notas.length ? Math.max(...notas) : null
  let totAc = 0, totTt = 0
  for (const s of sess) { totAc += acPorSess.get(s.id) ?? 0; totTt += ttPorSess.get(s.id) ?? 0 }
  const acertoMedio = totTt > 0 ? Math.round((totAc / totTt) * 100) : null
  const temposMin = finalizadas.filter((s) => s.iniciado_em && s.finalizado_em)
    .map((s) => (new Date(s.finalizado_em).getTime() - new Date(s.iniciado_em).getTime()) / 60000).filter((m) => m >= 0)
  const tempoMedioMin = temposMin.length ? Math.round(temposMin.reduce((a, b) => a + b, 0) / temposMin.length) : null

  const porDisciplina = [...acPorDisc.entries()].map(([nome, v]) => ({ nome, ac: v.ac, tt: v.tt, pct: v.tt ? Math.round((v.ac / v.tt) * 100) : 0 })).sort((a, b) => b.pct - a.pct)
  const porQuestao = [...acPorQ.entries()].map(([qid, v]) => ({ rotulo: `Q${ordemDeQ.get(qid) != null ? (ordemDeQ.get(qid)! + 1) : '?'}`, ac: v.ac, tt: v.tt, pct: v.tt ? Math.round((v.ac / v.tt) * 100) : 0 }))
    .sort((a, b) => a.pct - b.pct).slice(0, 25)

  const faixas = [[0, 2], [2, 4], [4, 6], [6, 8], [8, 10.0001]]
  const distribuicao = faixas.map(([lo, hi]) => ({ faixa: `${lo}–${hi === 10.0001 ? 10 : hi}`, alunos: notas.filter((n) => n >= lo && n < hi).length }))

  // Linhas por estudante (ordenadas por classificação).
  const finRows = finalizadas.map((s) => {
    const ac = acPorSess.get(s.id) ?? 0, tt = ttPorSess.get(s.id) ?? 0
    const tempoSeg = s.iniciado_em && s.finalizado_em ? Math.max(0, (new Date(s.finalizado_em).getTime() - new Date(s.iniciado_em).getTime()) / 1000) : null
    return { estId: s.estudante_id as string, sessId: s.id as string, info: infoEst.get(s.estudante_id), nota: s.nota != null ? Number(s.nota) : null, ac, tt, tempoSeg }
  }).sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1) || (b.tt ? b.ac / b.tt : 0) - (a.tt ? a.ac / a.tt : 0))

  const ranking = finRows.map((r, i) => ({
    pos: i + 1, nome: r.info?.nome ?? 'Estudante', nota: r.nota,
    acerto: r.tt ? Math.round((r.ac / r.tt) * 100) : 0, tempo: r.tempoSeg != null ? fmtDur(r.tempoSeg / 60) : '—',
  }))

  const linhas: LinhaExportSimulado[] = finRows.map((r, i) => {
    const respondidas = r.tt, acertos = r.ac
    const disc = discAcPorSess.get(r.sessId) ?? {}
    return {
      posicao: i + 1,
      nome: r.info?.nome ?? 'Estudante',
      email: r.info?.email ?? '',
      telefone: r.info?.telefone ?? '',
      classificacao: labelClass(r.info?.classificacao),
      pontuacao: r.nota,
      acertos,
      erros: Math.max(0, respondidas - acertos),
      emBranco: Math.max(0, totalQuestoes - respondidas),
      media: respondidas ? Math.round((acertos / respondidas) * 100) : 0,
      tempoTotal: r.tempoSeg != null ? fmtDur(r.tempoSeg / 60) : '—',
      mediaTempo: r.tempoSeg != null && totalQuestoes ? fmtSeg(r.tempoSeg / totalQuestoes) : '—',
      porDisciplina: disciplinas.map((d) => disc[d] ?? 0),
    }
  })

  return {
    titulo: (alvo as any)?.titulo ?? 'Simulado', tipo: tipoDoSimulado(tiposQ),
    totalSessoes: sess.length, finalizadas: finalizadas.length, notaMedia, melhorNota, acertoMedio, tempoMedioMin,
    porDisciplina, porQuestao, distribuicao, ranking, disciplinas, linhas,
  }
}
