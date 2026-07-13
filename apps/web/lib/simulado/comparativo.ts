import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export type Comparativo = {
  participantes: number
  notaMediaTurma: number | null
  acertoMedioTurma: number | null
  minhaPosicao: number | null
  percentil: number | null
  porDisciplina: { nome: string; minhaPct: number | null; turmaPct: number }[]
}

/** Comparativo do desempenho vs. a turma (1 melhor tentativa por aluno). */
export async function montarComparativo(svc: SupabaseClient, simuladoId: string, opts: { minhaNota: number | null; minhaSessaoId: string | null }): Promise<Comparativo> {
  const { data: pq } = await svc
    .from('simulado_prova_questoes')
    .select('questao_id, questoes:simulado_questoes(disciplinas:simulado_disciplinas(nome))')
    .eq('simulado_id', simuladoId).eq('anulada', false)
  const totalQ = (pq ?? []).length
  const discDeQ = new Map<string, string>()
  for (const r of (pq ?? []) as any[]) discDeQ.set(r.questao_id, r.questoes?.disciplinas?.nome ?? 'Sem disciplina')

  const { data: sess } = await svc
    .from('simulado_sessoes_prova')
    .select('id, estudante_id, nota')
    .eq('simulado_id', simuladoId).eq('is_teste', false).eq('deletado', false).eq('status', 'finalizada')
  const best = new Map<string, { id: string; nota: number }>()
  for (const s of (sess ?? []) as any[]) {
    const n = s.nota != null ? Number(s.nota) : -1
    const cur = best.get(s.estudante_id)
    if (!cur || n > cur.nota) best.set(s.estudante_id, { id: s.id, nota: n })
  }
  const reps = [...best.values()]
  const notas = reps.map((r) => r.nota).filter((n) => n >= 0)
  const participantes = reps.length
  const notaMediaTurma = notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null

  let minhaPosicao: number | null = null, percentil: number | null = null
  if (opts.minhaNota != null && notas.length) {
    minhaPosicao = notas.filter((n) => n > opts.minhaNota!).length + 1
    percentil = Math.round((notas.filter((n) => n <= opts.minhaNota!).length / notas.length) * 100)
  }

  const acPorDisc = new Map<string, { ac: number; tt: number }>()
  let totAc = 0
  const repIds = reps.map((r) => r.id)
  if (repIds.length) {
    const { data: resp } = await svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta').in('sessao_id', repIds)
    for (const r of (resp ?? []) as any[]) {
      if (r.correta) totAc++
      const d = discDeQ.get(r.questao_id) ?? 'Sem disciplina'
      const v = acPorDisc.get(d) ?? { ac: 0, tt: 0 }; v.tt++; if (r.correta) v.ac++; acPorDisc.set(d, v)
    }
  }
  const acertoMedioTurma = participantes && totalQ ? Math.round((totAc / (participantes * totalQ)) * 100) : null

  const minhaDisc = new Map<string, { ac: number; tt: number }>()
  if (opts.minhaSessaoId) {
    const { data: mr } = await svc.from('simulado_respostas_objetivas').select('questao_id, correta').eq('sessao_id', opts.minhaSessaoId)
    for (const r of (mr ?? []) as any[]) { const d = discDeQ.get(r.questao_id) ?? 'Sem disciplina'; const v = minhaDisc.get(d) ?? { ac: 0, tt: 0 }; v.tt++; if (r.correta) v.ac++; minhaDisc.set(d, v) }
  }

  const porDisciplina = [...acPorDisc.entries()].map(([nome, v]) => {
    const minha = minhaDisc.get(nome)
    return { nome, turmaPct: v.tt ? Math.round((v.ac / v.tt) * 100) : 0, minhaPct: minha && minha.tt ? Math.round((minha.ac / minha.tt) * 100) : null }
  }).sort((a, b) => a.nome.localeCompare(b.nome))

  return { participantes, notaMediaTurma, acertoMedioTurma, minhaPosicao, percentil, porDisciplina }
}
