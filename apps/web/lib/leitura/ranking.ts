import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember } from '@/lib/cache/relatorio-cache'
import { getGamConfig } from '@/lib/gamificacao'
import { normalizarPontuacaoLeitura, pontuarLegProc, type PontuacaoLeitura } from '@/lib/leitura/pontuacao'

export interface RankingLeituraItem {
  estudanteId: string
  nome: string
  avatarCor: string | null
  acertos: number
  aulasConcluidas: number
  aulasGabaritadas: number
  score: number
  posicao: number
}
export interface RankingLeitura { itens: RankingLeituraItem[]; gamAtivo: boolean; pontuacao: PontuacaoLeitura }

/**
 * Ranking de um MÓDULO do LegProc por desempenho no quiz das aulas. Métrica visível = ACERTOS (score
 * puro por acertos enquanto a gamificação estiver desligada); com a gamificação ligada, `score` passa a
 * usar a pontuação do módulo (aula + acerto + combo de gabarito). Cacheado (TTL) — o "você" é destacado
 * no cliente comparando o id da sessão. Segue o padrão de egress do LegProc (fetchAllByIn, nunca fetchAll).
 */
export async function carregarRankingModulo(moduloId: string, tenantId: string): Promise<RankingLeitura> {
  return remember<RankingLeitura>(`leitura:ranking:${tenantId}:${moduloId}`, 300, async () => {
    const svc = createAdminClient()
    const geral = moduloId === '__geral__'

    // Config de pontuação do módulo (tolerante) + gamificação ativa do tenant.
    let pontuacaoRaw: unknown = null
    if (!geral) {
      try { const { data } = await svc.from('simulado_pastas').select('pontuacao').eq('id', moduloId).eq('tenant_id', tenantId).maybeSingle(); pontuacaoRaw = (data as { pontuacao?: unknown } | null)?.pontuacao ?? null } catch { /* coluna ausente */ }
    }
    const pontuacao = normalizarPontuacaoLeitura(pontuacaoRaw)
    let gamAtivo = false
    try { const cfg = await getGamConfig(svc, tenantId); gamAtivo = !!cfg?.ativo } catch { /* gamificação ausente */ }

    // Aulas do módulo.
    let dq = svc.from('simulado_documentos').select('id').eq('tenant_id', tenantId).eq('deletado', false).eq('publicado', true)
    dq = geral ? dq.is('pasta_id', null) : dq.eq('pasta_id', moduloId)
    const { data: docs } = await dq
    const aulaIds = (docs ?? []).map((d: { id: string }) => d.id)
    if (!aulaIds.length) return { itens: [], gamAtivo, pontuacao }

    const [quiz, resp] = await Promise.all([
      fetchAllByIn<{ documento_id: string; questao_id: string }>(aulaIds, (chunk) =>
        svc.from('simulado_documento_quiz_questoes').select('documento_id, questao_id').eq('tenant_id', tenantId).eq('deletado', false).in('documento_id', chunk).order('documento_id')).catch(() => [] as { documento_id: string; questao_id: string }[]),
      fetchAllByIn<{ estudante_id: string; documento_id: string; questao_id: string; correta: boolean }>(aulaIds, (chunk) =>
        svc.from('simulado_leitura_respostas').select('estudante_id, documento_id, questao_id, correta').eq('tenant_id', tenantId).in('documento_id', chunk).order('documento_id')),
    ])
    const quizPorDoc = new Map<string, Set<string>>()
    for (const q of quiz) (quizPorDoc.get(q.documento_id) ?? quizPorDoc.set(q.documento_id, new Set()).get(q.documento_id)!).add(q.questao_id)
    if (!resp.length) return { itens: [], gamAtivo, pontuacao }

    // Agrega por (aluno, documento) — só questões que pertencem ao quiz do módulo.
    type Cell = { answered: Set<string>; correct: Set<string> }
    const porAluno = new Map<string, Map<string, Cell>>()
    for (const r of resp) {
      const q = quizPorDoc.get(r.documento_id)
      if (!q || !q.has(r.questao_id)) continue
      const dmap = porAluno.get(r.estudante_id) ?? porAluno.set(r.estudante_id, new Map()).get(r.estudante_id)!
      const cell = dmap.get(r.documento_id) ?? dmap.set(r.documento_id, { answered: new Set(), correct: new Set() }).get(r.documento_id)!
      cell.answered.add(r.questao_id); if (r.correta) cell.correct.add(r.questao_id)
    }

    const brutos = [...porAluno.entries()].map(([id, dmap]) => {
      let acertos = 0, aulasConcluidas = 0, aulasGabaritadas = 0
      for (const [docId, cell] of dmap) {
        const qs = quizPorDoc.get(docId)!
        acertos += cell.correct.size
        const feita = qs.size > 0 && [...qs].every((qid) => cell.answered.has(qid))
        if (feita) { aulasConcluidas++; if ([...qs].every((qid) => cell.correct.has(qid))) aulasGabaritadas++ }
      }
      return { estudanteId: id, acertos, aulasConcluidas, aulasGabaritadas, score: pontuarLegProc(pontuacao, { acertos, aulasConcluidas, aulasGabaritadas }, gamAtivo) }
    }).filter((x) => x.acertos > 0 || x.aulasConcluidas > 0)
    if (!brutos.length) return { itens: [], gamAtivo, pontuacao }

    // Nome + cor do avatar (para as iniciais).
    const ests = await fetchAllByIn<{ id: string; nome: string; perfil_avatar_cor: string | null }>(brutos.map((b) => b.estudanteId), (chunk) =>
      svc.from('simulado_estudantes').select('id, nome, perfil_avatar_cor').in('id', chunk))
    const estDe = new Map(ests.map((e) => [e.id, e]))

    const itens: RankingLeituraItem[] = brutos
      .map((b) => ({ ...b, nome: estDe.get(b.estudanteId)?.nome ?? 'Aluno', avatarCor: estDe.get(b.estudanteId)?.perfil_avatar_cor ?? null }))
      .sort((a, b) => b.score - a.score || b.aulasConcluidas - a.aulasConcluidas || a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((b, i) => ({ ...b, posicao: i + 1 }))
    return { itens, gamAtivo, pontuacao }
  })
}
