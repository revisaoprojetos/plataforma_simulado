import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import type { DadosRelatorioEstudante } from './relatorio-estudante-view'

const fmtDur = (min: number) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min` }
const fmtData = (s?: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')

/** Monta o relatório completo de um estudante (KPIs, evolução, aluno×turma, histórico). */
export async function montarRelatorioEstudante(svc: SupabaseClient, estId: string, tenantId: string | null): Promise<DadosRelatorioEstudante | null> {
  const { data: alvo } = await svc.from('simulado_estudantes').select('id, nome').eq('id', estId).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').maybeSingle()
  if (!alvo) return null

  const { data: sess } = await svc.from('simulado_sessoes_prova')
    .select('id, simulado_id, status, nota, iniciado_em, finalizado_em')
    .eq('estudante_id', estId).eq('is_teste', false).eq('deletado', false).order('iniciado_em')
  const sessoes = (sess ?? []) as any[]
  const finalizadas = sessoes.filter((s) => s.status === 'finalizada')
  const sessIds = sessoes.map((s) => s.id)

  const acPorSess = new Map<string, number>(), ttPorSess = new Map<string, number>()
  const acDiscAluno = new Map<string, { ac: number; tt: number }>()
  let respAll: any[] = []
  if (sessIds.length) {
    const { data: resp } = await svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta').in('sessao_id', sessIds)
    respAll = (resp ?? []) as any[]
  }
  const qidsAluno = [...new Set(respAll.map((r) => r.questao_id))]

  const discDeQ = new Map<string, string>()
  if (qidsAluno.length) {
    const { data: qs } = await svc.from('simulado_questoes').select('id, disciplinas:simulado_disciplinas(nome)').in('id', qidsAluno)
    for (const q of (qs ?? []) as any[]) discDeQ.set(q.id, q.disciplinas?.nome ?? 'Sem disciplina')
  }
  for (const r of respAll) {
    ttPorSess.set(r.sessao_id, (ttPorSess.get(r.sessao_id) ?? 0) + 1)
    if (r.correta) acPorSess.set(r.sessao_id, (acPorSess.get(r.sessao_id) ?? 0) + 1)
    const disc = discDeQ.get(r.questao_id) ?? 'Sem disciplina'
    const v = acDiscAluno.get(disc) ?? { ac: 0, tt: 0 }; v.tt++; if (r.correta) v.ac++; acDiscAluno.set(disc, v)
  }

  // Turma: respostas de TODOS (sessões reais) às mesmas questões → acerto por disciplina.
  const acDiscTurma = new Map<string, { ac: number; tt: number }>()
  if (qidsAluno.length) {
    // fetchAllByIn: sem isso o PostgREST trunca em ~1000 e a comparação aluno×turma fica incoerente.
    const tArr = await fetchAllByIn<any>(qidsAluno, (chunk) =>
      svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta').in('questao_id', chunk).order('id'))
    const tSessIds = [...new Set(tArr.map((r) => r.sessao_id))]
    const teste = new Set<string>()
    if (tSessIds.length) {
      const ts = await fetchAllByIn<any>(tSessIds, (chunk) =>
        svc.from('simulado_sessoes_prova').select('id, is_teste, deletado').in('id', chunk))
      for (const s of ts) if (s.is_teste || s.deletado) teste.add(s.id)
    }
    for (const r of tArr) {
      if (teste.has(r.sessao_id)) continue
      const disc = discDeQ.get(r.questao_id) ?? 'Sem disciplina'
      const v = acDiscTurma.get(disc) ?? { ac: 0, tt: 0 }; v.tt++; if (r.correta) v.ac++; acDiscTurma.set(disc, v)
    }
  }

  const simTitulo = new Map<string, string>()
  const simIds = [...new Set(sessoes.map((s) => s.simulado_id).filter(Boolean))]
  if (simIds.length) { const { data: sims } = await svc.from('simulado_simulados').select('id, titulo').in('id', simIds); for (const s of (sims ?? []) as any[]) simTitulo.set(s.id, s.titulo) }

  const notas = finalizadas.map((s) => (s.nota != null ? Number(s.nota) : null)).filter((n): n is number => n != null)
  const notaMedia = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null
  const melhorNota = notas.length ? Math.max(...notas) : null
  let totAc = 0, totTt = 0
  for (const s of sessoes) { totAc += acPorSess.get(s.id) ?? 0; totTt += ttPorSess.get(s.id) ?? 0 }
  const acertoMedio = totTt ? Math.round((totAc / totTt) * 100) : null
  const temposMin = finalizadas.filter((s) => s.iniciado_em && s.finalizado_em).map((s) => (new Date(s.finalizado_em).getTime() - new Date(s.iniciado_em).getTime()) / 60000).filter((m) => m >= 0)
  const tempoMedioMin = temposMin.length ? Math.round(temposMin.reduce((a, b) => a + b, 0) / temposMin.length) : null

  const pct = (v?: { ac: number; tt: number }) => (v && v.tt ? Math.round((v.ac / v.tt) * 100) : 0)
  const evolucao = finalizadas.filter((s) => s.nota != null).map((s) => ({ rotulo: fmtData(s.iniciado_em), nota: Number(s.nota) }))
  const porDisciplina = [...acDiscAluno.entries()].map(([nome, v]) => ({ nome, aluno: pct(v), turma: pct(acDiscTurma.get(nome)) })).sort((a, b) => b.aluno - a.aluno).slice(0, 15)
  const historico = finalizadas.map((s) => {
    const ac = acPorSess.get(s.id) ?? 0, tt = ttPorSess.get(s.id) ?? 0
    const tMin = s.iniciado_em && s.finalizado_em ? (new Date(s.finalizado_em).getTime() - new Date(s.iniciado_em).getTime()) / 60000 : null
    return { simulado: simTitulo.get(s.simulado_id) ?? '—', quando: fmtData(s.iniciado_em), nota: s.nota != null ? Number(s.nota) : null, acerto: tt ? Math.round((ac / tt) * 100) : 0, tempo: tMin != null ? fmtDur(tMin) : '—' }
  }).reverse()

  return { nome: (alvo as any)?.nome ?? 'Estudante', simulados: finalizadas.length, notaMedia, melhorNota, acertoMedio, tempoMedioMin, evolucao, porDisciplina, historico }
}
