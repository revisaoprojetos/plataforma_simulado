import 'server-only'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import type { DesempenhoLeitura } from '@/lib/leitura/pontuacao'

/**
 * Desempenho de UM aluno num módulo (mesma métrica do ranking: quiz do conteúdo). Leve — escopado ao
 * aluno. aulasConcluidas = todas as questões do quiz respondidas; aulasGabaritadas = todas certas.
 * Server-only (consulta o banco) — separado de `desafios.ts` (puro) p/ este poder ser usado no client.
 */
export async function desempenhoLeituraAluno(svc: any, tenantId: string, estudanteId: string, pastaId: string): Promise<DesempenhoLeitura> {
  const vazio: DesempenhoLeitura = { acertos: 0, aulasConcluidas: 0, aulasGabaritadas: 0 }
  try {
    const geral = pastaId === '__geral__'
    let dq = svc.from('simulado_documentos').select('id').eq('tenant_id', tenantId).eq('deletado', false).eq('publicado', true)
    dq = geral ? dq.is('pasta_id', null) : dq.eq('pasta_id', pastaId)
    const { data: docs } = await dq
    const aulaIds = (docs ?? []).map((d: any) => d.id)
    if (!aulaIds.length) return vazio

    const [quiz, resp] = await Promise.all([
      fetchAllByIn<{ documento_id: string; questao_id: string }>(aulaIds, (chunk) =>
        svc.from('simulado_documento_quiz_questoes').select('documento_id, questao_id').eq('tenant_id', tenantId).eq('deletado', false).in('documento_id', chunk).order('id')).catch(() => [] as any[]),
      fetchAllByIn<{ documento_id: string; questao_id: string; correta: boolean }>(aulaIds, (chunk) =>
        svc.from('simulado_leitura_respostas').select('documento_id, questao_id, correta').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).in('documento_id', chunk).order('id')),
    ])
    const quizPorDoc = new Map<string, Set<string>>()
    for (const q of quiz) (quizPorDoc.get(q.documento_id) ?? quizPorDoc.set(q.documento_id, new Set()).get(q.documento_id)!).add(q.questao_id)

    const cellPorDoc = new Map<string, { answered: Set<string>; correct: Set<string> }>()
    for (const r of resp) {
      const q = quizPorDoc.get(r.documento_id)
      if (!q || !q.has(r.questao_id)) continue
      const cell = cellPorDoc.get(r.documento_id) ?? cellPorDoc.set(r.documento_id, { answered: new Set(), correct: new Set() }).get(r.documento_id)!
      cell.answered.add(r.questao_id); if (r.correta) cell.correct.add(r.questao_id)
    }
    let acertos = 0, aulasConcluidas = 0, aulasGabaritadas = 0
    for (const [docId, cell] of cellPorDoc) {
      const qs = quizPorDoc.get(docId)!
      acertos += cell.correct.size
      const feita = qs.size > 0 && [...qs].every((qid) => cell.answered.has(qid))
      if (feita) { aulasConcluidas++; if ([...qs].every((qid) => cell.correct.has(qid))) aulasGabaritadas++ }
    }
    return { acertos, aulasConcluidas, aulasGabaritadas }
  } catch {
    return vazio
  }
}
