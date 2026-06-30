// Ranking do simulado com dedup por aluno conforme a política de nota
// (última / melhor / média entre tentativas). Cada aluno entra UMA vez no
// ranking; todas as sessões do aluno recebem a mesma posição.

type AnyClient = { from: (t: string) => any }

export interface AlunoRank {
  estudanteId: string
  notaOficial: number
  posicao: number
  tentativas: number
  sessaoIds: string[]
}

function notaPorPolitica(notas: number[], datas: string[], politica: string): number {
  if (notas.length === 0) return 0
  if (politica === 'melhor') return Math.max(...notas)
  if (politica === 'media') return notas.reduce((a, b) => a + b, 0) / notas.length
  // 'ultima' (default): nota da sessão finalizada mais recente
  let idx = 0
  for (let i = 1; i < datas.length; i++) if (new Date(datas[i]).getTime() > new Date(datas[idx]).getTime()) idx = i
  return notas[idx]
}

/** Calcula o ranking deduplicado por aluno (read-only, não grava nada). */
export async function calcularRanking(svc: AnyClient, simuladoId: string): Promise<AlunoRank[]> {
  const { data: sim } = await svc.from('simulado_simulados').select('regras').eq('id', simuladoId).maybeSingle()
  const politica = ((sim?.regras as any)?.politica_nota as string) ?? 'ultima'

  const { data: sessoes } = await svc
    .from('simulado_sessoes_prova')
    .select('id, estudante_id, nota, finalizado_em')
    .eq('simulado_id', simuladoId)
    .eq('is_teste', false)
    .eq('status', 'finalizada')
    .eq('deletado', false) // sessões na Lixeira não contam no ranking

  const porAluno = new Map<string, { ids: string[]; notas: number[]; datas: string[] }>()
  for (const s of (sessoes ?? []) as any[]) {
    const cur = porAluno.get(s.estudante_id) ?? { ids: [], notas: [], datas: [] }
    cur.ids.push(s.id)
    cur.notas.push(Number(s.nota ?? 0))
    cur.datas.push(s.finalizado_em ?? new Date(0).toISOString())
    porAluno.set(s.estudante_id, cur)
  }

  const alunos = [...porAluno.entries()].map(([estudanteId, v]) => ({
    estudanteId,
    ids: v.ids,
    notaOficial: notaPorPolitica(v.notas, v.datas, politica),
    ultima: v.datas.reduce((m, d) => (new Date(d).getTime() > new Date(m).getTime() ? d : m), v.datas[0] ?? new Date(0).toISOString()),
    tentativas: v.ids.length,
  }))

  alunos.sort((a, b) => {
    const dn = b.notaOficial - a.notaOficial
    return dn !== 0 ? dn : new Date(a.ultima).getTime() - new Date(b.ultima).getTime()
  })

  return alunos.map((a, i) => ({
    estudanteId: a.estudanteId,
    notaOficial: Math.round(a.notaOficial * 100) / 100,
    posicao: i + 1,
    tentativas: a.tentativas,
    sessaoIds: a.ids,
  }))
}

/**
 * Recalcula e GRAVA o ranking: posicao_ranking igual em todas as sessões do
 * aluno. Retorna o ranking deduplicado.
 */
export async function rankearSimulado(svc: AnyClient, simuladoId: string): Promise<AlunoRank[]> {
  const ranks = await calcularRanking(svc, simuladoId)
  await Promise.all(
    ranks.flatMap((a) => a.sessaoIds.map((id) => svc.from('simulado_sessoes_prova').update({ posicao_ranking: a.posicao }).eq('id', id))),
  )
  return ranks
}
