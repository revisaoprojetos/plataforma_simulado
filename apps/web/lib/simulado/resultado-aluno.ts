import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

const strip = (x: unknown) => String(x ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

export type SessaoInput = {
  id: string
  tentativa_num: number | null
  nota: number | null
  iniciado_em: string | null
  finalizado_em: string | null
  posicao_ranking: number | null
}

export type DiscStat = { nome: string; ac: number; tt: number; pct: number }
export type TentativaResumo = {
  id: string
  n: number
  nota: number | null
  iniciado: string | null
  finalizado: string | null
  tempoMs: number
  acertos: number
  total: number
  pct: number
  posicao: number | null
  porDisc: DiscStat[]
}

export type AltAgregada = { letra: string; texto: string; correta: boolean; escolhas: number }
export type QuestaoAgregada = {
  ordem: number
  enunciado: string
  disciplina: string | null
  comentario: string | null
  alternativas: AltAgregada[]
  acertou: number
  errou: number
  branco: number
}

/**
 * Monta o resultado consolidado de um aluno num simulado: o resumo de cada tentativa
 * (acertos/tempo/disciplinas) e a visão de questões agregada por todas as tentativas
 * (quantas vezes acertou/errou/deixou em branco e a distribuição das marcações).
 */
export async function montarResultadoAluno(
  svc: SupabaseClient,
  simuladoId: string,
  sessoes: SessaoInput[],
  revelarGabarito: boolean,
): Promise<{ tentativas: TentativaResumo[]; questoes: QuestaoAgregada[]; totalQuestoes: number }> {
  const sessaoIds = sessoes.map((s) => s.id)

  const { data: pq } = await svc
    .from('simulado_prova_questoes')
    .select('ordem, questao_id, questoes:simulado_questoes(id, enunciado, comentario_professor, disciplinas:simulado_disciplinas(nome), alternativas:simulado_alternativas(id, texto, ordem, correta))')
    .eq('simulado_id', simuladoId).eq('anulada', false).order('ordem')
  const questoesRaw = (pq ?? []) as any[]
  const totalQuestoes = questoesRaw.length
  const discDeQ = new Map<string, string>()
  for (const r of questoesRaw) discDeQ.set(r.questao_id, r.questoes?.disciplinas?.nome ?? 'Sem disciplina')

  let respostas: any[] = []
  if (sessaoIds.length) {
    const { data } = await svc
      .from('simulado_respostas_objetivas')
      .select('sessao_id, questao_id, alternativa_id, correta, snapshot_gabarito')
      .in('sessao_id', sessaoIds)
    respostas = data ?? []
  }
  const bySessao = new Map<string, Map<string, any>>()
  for (const r of respostas) {
    if (!bySessao.has(r.sessao_id)) bySessao.set(r.sessao_id, new Map())
    bySessao.get(r.sessao_id)!.set(r.questao_id, r)
  }

  // Resumo por tentativa.
  const tentativas: TentativaResumo[] = sessoes.map((s) => {
    const respMap = bySessao.get(s.id) ?? new Map<string, any>()
    let acertos = 0
    const disc = new Map<string, { ac: number; tt: number }>()
    for (const [qid, r] of respMap) {
      const dn = discDeQ.get(qid) ?? 'Sem disciplina'
      const d = disc.get(dn) ?? { ac: 0, tt: 0 }
      d.tt++; if (r.correta) { d.ac++; acertos++ }
      disc.set(dn, d)
    }
    const tempoMs = s.iniciado_em && s.finalizado_em ? new Date(s.finalizado_em).getTime() - new Date(s.iniciado_em).getTime() : 0
    const porDisc = [...disc.entries()].map(([nome, v]) => ({ nome, ac: v.ac, tt: v.tt, pct: v.tt ? Math.round((v.ac / v.tt) * 100) : 0 })).sort((a, b) => a.nome.localeCompare(b.nome))
    return {
      id: s.id, n: s.tentativa_num ?? 1, nota: s.nota != null ? Number(s.nota) : null,
      iniciado: s.iniciado_em, finalizado: s.finalizado_em, tempoMs, acertos,
      total: totalQuestoes, pct: totalQuestoes ? Math.round((acertos / totalQuestoes) * 100) : 0,
      posicao: s.posicao_ranking, porDisc,
    }
  })

  // Questões agregadas entre todas as tentativas.
  const questoes: QuestaoAgregada[] = questoesRaw.map((r) => {
    const q = r.questoes ?? {}
    const alts = [...(q.alternativas ?? [])].sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
    const letraDe = new Map<string, string>()
    const altsOut: AltAgregada[] = alts.map((a: any, i: number) => {
      const letra = String.fromCharCode(65 + i)
      letraDe.set(a.id, letra)
      return { letra, texto: strip(a.texto), correta: revelarGabarito && !!a.correta, escolhas: 0 }
    })
    let acertou = 0, errou = 0, branco = 0
    for (const s of sessoes) {
      const resp = (bySessao.get(s.id) ?? new Map<string, any>()).get(q.id)
      const escolhida = resp?.alternativa_id ?? resp?.snapshot_gabarito?.alternativa_id ?? null
      if (!resp || escolhida == null) { branco++; continue }
      const letra = letraDe.get(escolhida)
      if (letra) { const alt = altsOut.find((a) => a.letra === letra); if (alt) alt.escolhas++ }
      if (resp.correta) acertou++; else errou++
    }
    return {
      ordem: (r.ordem ?? 0) + 1,
      enunciado: strip(q.enunciado) || '(sem enunciado)',
      disciplina: q.disciplinas?.nome ?? null,
      comentario: revelarGabarito ? (q.comentario_professor ? strip(q.comentario_professor) : null) : null,
      alternativas: altsOut, acertou, errou, branco,
    }
  })

  return { tentativas, questoes, totalQuestoes }
}
