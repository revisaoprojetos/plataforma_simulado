import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { funcaoEtiquetaPorQuestao } from './etiqueta-funcao'

const strip = (x: unknown) => String(x ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

export type AltRevisao = { letra: string; texto: string; correta: boolean; escolhida: boolean }
export type QuestaoRevisao = {
  ordem: number
  enunciado: string
  disciplina: string | null
  comentario: string | null
  respondida: boolean
  acertou: boolean | null
  anulada: boolean
  alternativas: AltRevisao[]
}

/**
 * Monta a revisão questão-a-questão de uma sessão: enunciado, alternativas com a
 * marcação do aluno e (se `revelar`) a correta + comentário do professor.
 */
export async function montarRevisao(svc: SupabaseClient, simuladoId: string, sessaoId: string, revelar: boolean): Promise<QuestaoRevisao[]> {
  const { data: pq } = await svc
    .from('simulado_prova_questoes')
    .select('ordem, anulada, questao_id, questoes:simulado_questoes(id, enunciado, comentario_professor, disciplinas:simulado_disciplinas(nome), alternativas:simulado_alternativas(id, texto, ordem, correta))')
    .eq('simulado_id', simuladoId).order('ordem')
  const { data: resp } = await svc
    .from('simulado_respostas_objetivas')
    .select('questao_id, alternativa_id, correta, snapshot_gabarito')
    .eq('sessao_id', sessaoId)

  const respPorQ = new Map<string, { escolhida: string | null; correta: boolean }>()
  for (const r of (resp ?? []) as any[]) {
    respPorQ.set(r.questao_id, { escolhida: r.alternativa_id ?? r.snapshot_gabarito?.alternativa_id ?? null, correta: !!r.correta })
  }

  // Anulação: boolean per-simulado OU etiqueta funcional (anular = ponto garantido; desconsiderar = fora do total).
  const funcMap = await funcaoEtiquetaPorQuestao(svc, ((pq ?? []) as any[]).map((r) => r.questao_id))

  return ((pq ?? []) as any[]).map((r) => {
    const q = r.questoes ?? {}
    const ef = funcMap.get(r.questao_id)?.funcao
    const desconsiderada = ef === 'desconsiderar'
    const anulada = !desconsiderada && (ef === 'anular' || r.anulada === true)
    const info = respPorQ.get(q.id)
    const alts = [...(q.alternativas ?? [])].sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((a: any, i: number) => ({
      letra: String.fromCharCode(65 + i),
      texto: strip(a.texto),
      correta: revelar && !!a.correta,
      escolhida: info?.escolhida != null && a.id === info.escolhida,
    }))
    return {
      ordem: (r.ordem ?? 0) + 1,
      enunciado: strip(q.enunciado) || '(sem enunciado)',
      disciplina: q.disciplinas?.nome ?? null,
      comentario: revelar ? (q.comentario_professor ? strip(q.comentario_professor) : null) : null,
      respondida: !!info,
      // Anulada = ponto garantido a todos; desconsiderada = fora do total (não pontua nem erra).
      acertou: anulada ? true : (desconsiderada ? null : (revelar ? (info ? info.correta : null) : null)),
      anulada: anulada || desconsiderada,
      alternativas: alts,
    }
  })
}
