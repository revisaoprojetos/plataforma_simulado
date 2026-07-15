import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DadosRelatorioDisciplina } from './relatorio-disciplina-view'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Monta o relatório completo de uma disciplina (KPIs, por assunto, por simulado, evolução). */
export async function montarRelatorioDisciplina(svc: SupabaseClient, discId: string, tenantId: string | null): Promise<DadosRelatorioDisciplina | null> {
  const { data: alvo } = await svc.from('simulado_disciplinas').select('id, nome').eq('id', discId).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').maybeSingle()
  if (!alvo) return null

  // Questões da disciplina.
  const { data: qs } = await svc.from('simulado_questoes')
    .select('id, assunto_id').eq('disciplina_id', discId).eq('deletado', false)
  const qIds = (qs ?? []).map((q: any) => q.id)
  const assuntoDeQ = new Map<string, string | null>((qs ?? []).map((q: any) => [q.id, q.assunto_id]))

  const acPorSim = new Map<string, { ac: number; tt: number }>()
  const acPorAssunto = new Map<string, { ac: number; tt: number }>()
  const acPorMes = new Map<string, { ac: number; tt: number }>()
  const estudantes = new Set<string>()
  let totAc = 0, totTt = 0

  if (qIds.length) {
    const { data: resp } = await svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta').in('questao_id', qIds)
    const respArr = (resp ?? []) as any[]
    const sessIds = [...new Set(respArr.map((r) => r.sessao_id))]
    const sessInfo = new Map<string, { simulado_id: string; estudante_id: string; data: string | null; teste: boolean }>()
    if (sessIds.length) {
      const { data: sess } = await svc.from('simulado_sessoes_prova').select('id, simulado_id, estudante_id, iniciado_em, is_teste, deletado').in('id', sessIds)
      for (const s of (sess ?? []) as any[]) if (!s.deletado) sessInfo.set(s.id, { simulado_id: s.simulado_id, estudante_id: s.estudante_id, data: s.iniciado_em, teste: !!s.is_teste })
    }
    for (const r of respArr) {
      const si = sessInfo.get(r.sessao_id); if (!si || si.teste) continue
      totTt++; if (r.correta) totAc++
      estudantes.add(si.estudante_id)
      const bumpMap = (m: Map<string, { ac: number; tt: number }>, k: string) => { const v = m.get(k) ?? { ac: 0, tt: 0 }; v.tt++; if (r.correta) v.ac++; m.set(k, v) }
      bumpMap(acPorSim, si.simulado_id)
      bumpMap(acPorAssunto, assuntoDeQ.get(r.questao_id) ?? '—')
      if (si.data) { const dt = new Date(si.data); bumpMap(acPorMes, `${dt.getFullYear()}-${String(dt.getMonth()).padStart(2, '0')}`) }
    }
  }

  const simTitulo = new Map<string, string>()
  const simIds = [...acPorSim.keys()]
  if (simIds.length) { const { data: sims } = await svc.from('simulado_simulados').select('id, titulo').in('id', simIds); for (const s of (sims ?? []) as any[]) simTitulo.set(s.id, s.titulo) }
  const assuntoNome = new Map<string, string>()
  const assuntoIds = [...acPorAssunto.keys()].filter((k) => k !== '—')
  if (assuntoIds.length) { const { data: ass } = await svc.from('simulado_assuntos').select('id, nome').in('id', assuntoIds); for (const a of (ass ?? []) as any[]) assuntoNome.set(a.id, a.nome) }

  const pct = (v: { ac: number; tt: number }) => (v.tt ? Math.round((v.ac / v.tt) * 100) : 0)
  const porSimulado = [...acPorSim.entries()].map(([id, v]) => ({ titulo: simTitulo.get(id) ?? '—', pct: pct(v), ac: v.ac, tt: v.tt })).sort((a, b) => b.tt - a.tt)
  const porAssunto = [...acPorAssunto.entries()].map(([id, v]) => ({ nome: id === '—' ? 'Sem assunto' : (assuntoNome.get(id) ?? 'Sem assunto'), pct: pct(v), ac: v.ac, tt: v.tt })).sort((a, b) => b.tt - a.tt).slice(0, 20)
  const evolucao = [...acPorMes.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => { const [y, m] = k.split('-'); return { mes: `${MESES[Number(m)]}/${y.slice(2)}`, pct: pct(v) } })

  return {
    nome: (alvo as any)?.nome ?? 'Disciplina',
    totalQuestoes: qIds.length, respostas: totTt, acertoPct: totTt ? Math.round((totAc / totTt) * 100) : null,
    numSimulados: acPorSim.size, numEstudantes: estudantes.size, porSimulado, porAssunto, evolucao,
  }
}
