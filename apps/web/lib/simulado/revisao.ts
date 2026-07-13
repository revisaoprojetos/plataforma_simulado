import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

const strip = (x: unknown) => String(x ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

export type AltRevisao = { letra: string; texto: string; correta: boolean; escolhida: boolean }
export type QuestaoRevisao = {
  ordem: number
  enunciado: string
  disciplina: string | null
  comentario: string | null
  respondida: boolean
  acertou: boolean | null
  alternativas: AltRevisao[]
}

/**
 * Monta a revisão questão-a-questão de uma sessão: enunciado, alternativas com a
 * marcação do aluno e (se `revelar`) a correta + comentário do professor.
 */
export async function montarRevisao(svc: SupabaseClient, simuladoId: string, sessaoId: string, revelar: boolean): Promise<QuestaoRevisao[]> {
  const { data: pq } = await svc
    .from('simulado_prova_questoes')
    .select('ordem, questao_id, questoes:simulado_questoes(id, enunciado, comentario_professor, disciplinas:simulado_disciplinas(nome), alternativas:simulado_alternativas(id, texto, ordem, correta))')
    .eq('simulado_id', simuladoId).eq('anulada', false).order('ordem')
  const { data: resp } = await svc
    .from('simulado_respostas_objetivas')
    .select('questao_id, alternativa_id, correta, snapshot_gabarito')
    .eq('sessao_id', sessaoId)

  const respPorQ = new Map<string, { escolhida: string | null; correta: boolean }>()
  for (const r of (resp ?? []) as any[]) {
    respPorQ.set(r.questao_id, { escolhida: r.alternativa_id ?? r.snapshot_gabarito?.alternativa_id ?? null, correta: !!r.correta })
  }

  return ((pq ?? []) as any[]).map((r) => {
    const q = r.questoes ?? {}
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
      acertou: revelar ? (info ? info.correta : null) : null,
      alternativas: alts,
    }
  })
}
