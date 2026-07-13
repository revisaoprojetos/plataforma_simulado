import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolverLiberacoes } from './liberacao'

export type DesempenhoTentativa = { n: number; nota: number | null; finalizado: string | null }
export type DesempenhoSimulado = {
  id: string
  titulo: string
  nota: number | null
  acertos: number
  total: number
  pct: number
  finalizado: string | null
  porDisc: { nome: string; ac: number; tt: number }[]
  tentativas: DesempenhoTentativa[]
}

/**
 * Consolida o desempenho do aluno em TODOS os seus simulados concluídos (melhor tentativa
 * por simulado), apenas onde a nota está liberada. Base para a aba "Desempenho" (métrica de
 * todos ou de alguns simulados selecionados).
 */
export async function montarDesempenhoAluno(svc: SupabaseClient, estId: string): Promise<DesempenhoSimulado[]> {
  // Base: simulados atribuídos (matrícula/acesso) + os que o aluno já concluiu (sessão finalizada).
  const [{ data: mats }, { data: acs }, { data: sessAll }] = await Promise.all([
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estId),
    svc.from('simulado_acessos').select('simulado_id').eq('estudante_id', estId),
    svc.from('simulado_sessoes_prova').select('id, simulado_id, nota, finalizado_em, tentativa_num').eq('estudante_id', estId).eq('is_teste', false).eq('deletado', false).eq('status', 'finalizada'),
  ])
  const ids = [...new Set([
    ...(mats ?? []).filter((m: any) => m.liberado !== false).map((m: any) => m.simulado_id),
    ...(acs ?? []).map((a: any) => a.simulado_id),
    ...(sessAll ?? []).map((s: any) => s.simulado_id),
  ].filter(Boolean))]
  if (!ids.length) return []

  const sess = sessAll ?? []
  const [{ data: sims }, { data: pq }] = await Promise.all([
    svc.from('simulado_simulados').select('id, titulo, regras, status, data_fim').in('id', ids).eq('deletado', false),
    svc.from('simulado_prova_questoes').select('simulado_id, questao_id, questoes:simulado_questoes(disciplinas:simulado_disciplinas(nome))').in('simulado_id', ids).eq('anulada', false),
  ])

  const totalPorSim = new Map<string, number>()
  const discDeQ = new Map<string, string>()
  for (const r of (pq ?? []) as any[]) {
    totalPorSim.set(r.simulado_id, (totalPorSim.get(r.simulado_id) ?? 0) + 1)
    discDeQ.set(r.questao_id, r.questoes?.disciplinas?.nome ?? 'Sem disciplina')
  }

  // Melhor tentativa por simulado + todas as tentativas (cronológico) para o gráfico de progresso.
  const best = new Map<string, { id: string; nota: number; finalizado: string | null }>()
  const tentPorSim = new Map<string, DesempenhoTentativa[]>()
  for (const s of (sess ?? []) as any[]) {
    const n = s.nota != null ? Number(s.nota) : -1
    const cur = best.get(s.simulado_id)
    if (!cur || n > cur.nota) best.set(s.simulado_id, { id: s.id, nota: n, finalizado: s.finalizado_em })
    const arr = tentPorSim.get(s.simulado_id) ?? []
    arr.push({ n: s.tentativa_num ?? arr.length + 1, nota: s.nota != null ? Number(s.nota) : null, finalizado: s.finalizado_em })
    tentPorSim.set(s.simulado_id, arr)
  }
  for (const arr of tentPorSim.values()) arr.sort((a, b) => (a.n ?? 0) - (b.n ?? 0))
  const sessaoDeSim = new Map<string, string>()   // sessao_id → simulado_id
  for (const [sid, b] of best) sessaoDeSim.set(b.id, sid)

  const sessaoIds = [...best.values()].map((b) => b.id)
  const respPorSim = new Map<string, any[]>()
  if (sessaoIds.length) {
    const { data: resp } = await svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta').in('sessao_id', sessaoIds)
    for (const r of (resp ?? []) as any[]) {
      const sid = sessaoDeSim.get(r.sessao_id)
      if (!sid) continue
      const arr = respPorSim.get(sid) ?? []; arr.push(r); respPorSim.set(sid, arr)
    }
  }

  const out: DesempenhoSimulado[] = []
  for (const sim of (sims ?? []) as any[]) {
    const b = best.get(sim.id)
    if (!b) continue
    if (!resolverLiberacoes(sim.regras, sim).notaLiberada) continue   // só notas liberadas
    const total = totalPorSim.get(sim.id) ?? 0
    const resp = respPorSim.get(sim.id) ?? []
    const acertos = resp.filter((r) => r.correta).length
    const disc = new Map<string, { ac: number; tt: number }>()
    for (const r of resp) { const dn = discDeQ.get(r.questao_id) ?? 'Sem disciplina'; const d = disc.get(dn) ?? { ac: 0, tt: 0 }; d.tt++; if (r.correta) d.ac++; disc.set(dn, d) }
    out.push({
      id: sim.id, titulo: sim.titulo, nota: b.nota >= 0 ? b.nota : null,
      acertos, total, pct: total ? Math.round((acertos / total) * 100) : 0,
      finalizado: b.finalizado, porDisc: [...disc.entries()].map(([nome, v]) => ({ nome, ac: v.ac, tt: v.tt })),
      tentativas: tentPorSim.get(sim.id) ?? [],
    })
  }
  out.sort((a, b) => new Date(a.finalizado ?? 0).getTime() - new Date(b.finalizado ?? 0).getTime())
  return out
}
