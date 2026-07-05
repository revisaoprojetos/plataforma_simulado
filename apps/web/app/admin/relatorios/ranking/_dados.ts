import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizarCriterios, idadeEmAnos, type CriteriosRanking, type EntradaRanking } from '@/lib/simulado/ranking'

type GrupoBanco = { id: string; nome: string; disciplinas: string[] }
export type DadosRanking = {
  titulo: string
  grupos: { id: string; nome: string; count: number }[]
  totalQuestoes: number
  entradas: EntradaRanking[]
  criterios: CriteriosRanking
  afetados: number
}

/** Monta o ranking de um simulado (classificação + grupos + critérios + impactos). */
export async function montarRankingSimulado(svc: SupabaseClient, simId: string, agoraIso: string): Promise<DadosRanking | null> {
  const { data: sim } = await svc.from('simulado_simulados').select('titulo, regras').eq('id', simId).maybeSingle()
  if (!sim) return null
  const criterios: CriteriosRanking = normalizarCriterios((sim as any)?.regras?.ranking)

  // Questões do simulado + disciplina.
  const { data: pq } = await svc.from('simulado_prova_questoes')
    .select('questao_id, questoes:simulado_questoes(id, disciplinas:simulado_disciplinas(nome))').eq('simulado_id', simId)
  const discDeQ = new Map<string, string>()
  const qIds: string[] = []
  for (const r of (pq ?? []) as any[]) { const qid = r.questoes?.id ?? r.questao_id; qIds.push(qid); discDeQ.set(qid, r.questoes?.disciplinas?.nome ?? 'Sem disciplina') }

  // Banco (pasta) que cobre o simulado → grupos de disciplinas.
  let grupos: GrupoBanco[] = []
  if (qIds.length) {
    const { data: qp } = await svc.from('simulado_questao_pasta').select('questao_id, pasta_id').in('questao_id', qIds)
    const cont = new Map<string, number>()
    for (const r of (qp ?? []) as any[]) cont.set(r.pasta_id, (cont.get(r.pasta_id) ?? 0) + 1)
    const pastaIds = [...cont.keys()]
    if (pastaIds.length) {
      const { data: pastas } = await svc.from('simulado_pastas').select('id, grupos').in('id', pastaIds)
      const comGrupos = (pastas ?? []).filter((p: any) => Array.isArray(p.grupos) && p.grupos.length)
      const melhor = comGrupos.sort((a: any, b: any) => (cont.get(b.id) ?? 0) - (cont.get(a.id) ?? 0))[0]
      if (melhor) grupos = (melhor as any).grupos as GrupoBanco[]
    }
  }
  const grupoDaDisc = (d: string) => grupos.find((g) => g.disciplinas.includes(d))?.id ?? null
  const contGrupo = new Map<string, number>()
  for (const qid of qIds) { const gid = grupoDaDisc(discDeQ.get(qid) ?? ''); if (gid) contGrupo.set(gid, (contGrupo.get(gid) ?? 0) + 1) }
  const gruposView = grupos.map((g) => ({ id: g.id, nome: g.nome, count: contGrupo.get(g.id) ?? 0 }))

  // Sessões finalizadas (uma por aluno: a de maior nota).
  const { data: sess } = await svc.from('simulado_sessoes_prova')
    .select('id, estudante_id, nota, status, iniciado_em, finalizado_em').eq('simulado_id', simId).eq('is_teste', false).eq('deletado', false).eq('status', 'finalizada')
  const melhorSess = new Map<string, any>()
  for (const s of (sess ?? []) as any[]) {
    const cur = melhorSess.get(s.estudante_id)
    if (!cur || (Number(s.nota ?? -1) > Number(cur.nota ?? -1))) melhorSess.set(s.estudante_id, s)
  }
  const sessEscolhidas = [...melhorSess.values()]
  const sessIds = sessEscolhidas.map((s) => s.id)

  // Respostas dessas sessões → acerto por grupo + total.
  const acTotal = new Map<string, number>(), ttTotal = new Map<string, number>()
  const acGrupo = new Map<string, Record<string, number>>()
  if (sessIds.length) {
    const { data: resp } = await svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta').in('sessao_id', sessIds)
    const estDaSess = new Map<string, string>(sessEscolhidas.map((s) => [s.id, s.estudante_id]))
    for (const r of (resp ?? []) as any[]) {
      const est = estDaSess.get(r.sessao_id); if (!est) continue
      ttTotal.set(est, (ttTotal.get(est) ?? 0) + 1)
      if (r.correta) {
        acTotal.set(est, (acTotal.get(est) ?? 0) + 1)
        const gid = grupoDaDisc(discDeQ.get(r.questao_id) ?? '')
        if (gid) { const g = acGrupo.get(est) ?? {}; g[gid] = (g[gid] ?? 0) + 1; acGrupo.set(est, g) }
      }
    }
  }

  // Estudantes (nome, e-mail, classificação, nascimento).
  const estIds = sessEscolhidas.map((s) => s.estudante_id)
  const infoEst = new Map<string, { nome: string; email: string | null; classificacao: string | null; passaporte: boolean; nasc: string | null }>()
  if (estIds.length) {
    const { data: ests } = await svc.from('simulado_estudantes').select('id, nome, email, classificacao, data_nascimento').in('id', estIds)
    for (const e of (ests ?? []) as any[]) infoEst.set(e.id, { nome: e.nome ?? 'Estudante', email: e.email ?? null, classificacao: e.classificacao ?? null, passaporte: e.classificacao === 'passaporte', nasc: e.data_nascimento ?? null })
  }

  // Impactos de anulação/troca (re-correção): nota_antes por estudante. Tabelas podem estar vazias.
  const impacto = new Map<string, number>()
  let afetados = 0
  const { data: recs } = await svc.from('simulado_recorrecoes').select('id').eq('simulado_id', simId)
  const recIds = (recs ?? []).map((r: any) => r.id)
  if (recIds.length) {
    const { data: imps } = await svc.from('simulado_recorrecao_impactos').select('estudante_id, nota_antes').in('recorrecao_id', recIds)
    for (const im of (imps ?? []) as any[]) { if (im.nota_antes != null && !impacto.has(im.estudante_id)) { impacto.set(im.estudante_id, Number(im.nota_antes)); afetados++ } }
  }

  const sessInfo = new Map<string, { data: string | null; tempoSeg: number | null }>(sessEscolhidas.map((s) => {
    const ini = s.iniciado_em ? new Date(s.iniciado_em).getTime() : null
    const fim = s.finalizado_em ? new Date(s.finalizado_em).getTime() : null
    const tempoSeg = ini != null && fim != null && fim >= ini ? Math.round((fim - ini) / 1000) : null
    return [s.estudante_id, { data: s.iniciado_em ?? null, tempoSeg }]
  }))
  const entradas: EntradaRanking[] = sessEscolhidas.map((s) => {
    const est = s.estudante_id
    const info = infoEst.get(est)
    const pont = s.nota != null ? Number(s.nota) : (acTotal.get(est) ?? 0)
    const afetado = impacto.has(est)
    const si = sessInfo.get(est)
    return {
      estudanteId: est, nome: info?.nome ?? 'Estudante', email: info?.email ?? null, data: si?.data ?? null,
      classificacao: info?.classificacao ?? null,
      pontuacao: pont, pontuacaoSem: afetado ? impacto.get(est)! : pont, afetado,
      acertos: acTotal.get(est) ?? 0, total: ttTotal.get(est) ?? 0,
      porGrupo: acGrupo.get(est) ?? {}, passaporte: !!info?.passaporte, idade: idadeEmAnos(info?.nasc, agoraIso),
      tempoSeg: si?.tempoSeg ?? null,
    }
  })

  return { titulo: (sim as any)?.titulo ?? 'Simulado', grupos: gruposView, totalQuestoes: qIds.length, entradas, criterios, afetados }
}
