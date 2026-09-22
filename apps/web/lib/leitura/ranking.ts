import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember } from '@/lib/cache/relatorio-cache'
import { getGamConfig } from '@/lib/gamificacao'
import { normalizarPontuacaoLeitura, pontuarLegProc, type PontuacaoLeitura } from '@/lib/leitura/pontuacao'

export interface RankingLeituraItem {
  estudanteId: string
  nome: string
  email: string | null
  avatar: string | null
  avatarCor: string | null
  acertos: number
  aulasConcluidas: number
  aulasGabaritadas: number
  score: number
  streakAtual: number
  posicao: number
  /** Conta de teste marcada em Acessos → não compete por posição (badge "não contabilizado" no admin). */
  oculto: boolean
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
    let gamAtivo = false; let tz = 'America/Sao_Paulo'
    try { const cfg = await getGamConfig(svc, tenantId); gamAtivo = !!cfg?.ativo; tz = cfg?.timezone || tz } catch { /* gamificação ausente */ }

    // Aulas do módulo.
    let dq = svc.from('simulado_documentos').select('id').eq('tenant_id', tenantId).eq('deletado', false).eq('publicado', true)
    dq = geral ? dq.is('pasta_id', null) : dq.eq('pasta_id', moduloId)
    const { data: docs } = await dq
    const aulaIds = (docs ?? []).map((d: { id: string }) => d.id)
    if (!aulaIds.length) return { itens: [], gamAtivo, pontuacao }

    const [quiz, resp] = await Promise.all([
      fetchAllByIn<{ documento_id: string; questao_id: string }>(aulaIds, (chunk) =>
        svc.from('simulado_documento_quiz_questoes').select('documento_id, questao_id').eq('tenant_id', tenantId).eq('deletado', false).in('documento_id', chunk).order('documento_id')).catch(() => [] as { documento_id: string; questao_id: string }[]),
      fetchAllByIn<{ estudante_id: string; documento_id: string; questao_id: string; correta: boolean; respondido_em: string | null }>(aulaIds, (chunk) =>
        svc.from('simulado_leitura_respostas').select('estudante_id, documento_id, questao_id, correta, respondido_em').eq('tenant_id', tenantId).in('documento_id', chunk).order('documento_id')),
    ])
    const quizPorDoc = new Map<string, Set<string>>()
    for (const q of quiz) (quizPorDoc.get(q.documento_id) ?? quizPorDoc.set(q.documento_id, new Set()).get(q.documento_id)!).add(q.questao_id)
    if (!resp.length) return { itens: [], gamAtivo, pontuacao }

    // Agrega por (aluno, documento) — só questões do quiz do módulo. `ultima` = quando fechou o quiz.
    type Cell = { answered: Set<string>; correct: Set<string>; ultima: string | null }
    const porAluno = new Map<string, Map<string, Cell>>()
    for (const r of resp) {
      const q = quizPorDoc.get(r.documento_id)
      if (!q || !q.has(r.questao_id)) continue
      const dmap = porAluno.get(r.estudante_id) ?? porAluno.set(r.estudante_id, new Map()).get(r.estudante_id)!
      const cell = dmap.get(r.documento_id) ?? dmap.set(r.documento_id, { answered: new Set(), correct: new Set(), ultima: null }).get(r.documento_id)!
      cell.answered.add(r.questao_id); if (r.correta) cell.correct.add(r.questao_id)
      if (r.respondido_em && (!cell.ultima || r.respondido_em > cell.ultima)) cell.ultima = r.respondido_em
    }

    // Sequência = dias CONSECUTIVOS em que o aluno completou uma AULA COMPLETA (leitura + quiz respondido).
    // Regra: +1 por DIA (várias aulas no mesmo dia = 1); reinicia ao pular um dia; ZERA se passou um dia
    // inteiro sem aula (a última aula tem de ser hoje ou ontem, senão a sequência foi perdida).
    const diaDe = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz })
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: tz })
    const ontem = new Date(Date.parse(hoje + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10)
    const brutos = [...porAluno.entries()].map(([id, dmap]) => {
      let acertos = 0, aulasConcluidas = 0, aulasGabaritadas = 0
      const diasConcluidos = new Set<string>()
      for (const [docId, cell] of dmap) {
        const qs = quizPorDoc.get(docId)!
        acertos += cell.correct.size
        const feita = qs.size > 0 && [...qs].every((qid) => cell.answered.has(qid))
        if (feita) {
          aulasConcluidas++
          if ([...qs].every((qid) => cell.correct.has(qid))) aulasGabaritadas++
          if (cell.ultima) diasConcluidos.add(diaDe(cell.ultima))
        }
      }
      const dias = [...diasConcluidos].sort()
      let run = 0, prev = ''
      for (const d of dias) { run = prev && Date.parse(d + 'T00:00:00Z') - Date.parse(prev + 'T00:00:00Z') === 86_400_000 ? run + 1 : 1; prev = d }
      const ultimo = dias[dias.length - 1] ?? ''
      const streakAtual = ultimo === hoje || ultimo === ontem ? run : 0 // perdeu a sequência se ficou um dia sem aula
      return { estudanteId: id, acertos, aulasConcluidas, aulasGabaritadas, streakAtual, score: pontuarLegProc(pontuacao, { acertos, aulasConcluidas, aulasGabaritadas }, gamAtivo) }
    }).filter((x) => x.acertos > 0 || x.aulasConcluidas > 0)
    if (!brutos.length) return { itens: [], gamAtivo, pontuacao }

    // Contas de teste ocultas do ranking (marcadas em Acessos): não competem por posição.
    const ocultosSet = new Set<string>(); let ocultarTotal = false
    if (!geral) {
      try {
        const { data: ro } = await svc.from('simulado_pastas').select('ranking_ocultos').eq('id', moduloId).eq('tenant_id', tenantId).maybeSingle()
        const cfg = (ro as any)?.ranking_ocultos ?? {}
        ocultarTotal = cfg.total === true
        for (const id of (Array.isArray(cfg.estudantes) ? cfg.estudantes : [])) ocultosSet.add(id)
        const grps = Array.isArray(cfg.grupos) ? cfg.grupos : []
        if (grps.length) { const mem = await fetchAllByIn<{ estudante_id: string }>(grps, (chunk) => svc.from('simulado_grupo_membros').select('estudante_id').in('grupo_id', chunk)); for (const m of mem) ocultosSet.add(m.estudante_id) }
      } catch { /* coluna ranking_ocultos ausente */ }
    }

    // Nome + e-mail + foto/cor do avatar.
    const ests = await fetchAllByIn<{ id: string; nome: string; email: string | null; avatar: string | null; perfil_avatar_cor: string | null }>(brutos.map((b) => b.estudanteId), (chunk) =>
      svc.from('simulado_estudantes').select('id, nome, email, avatar, perfil_avatar_cor').in('id', chunk))
    const estDe = new Map(ests.map((e) => [e.id, e]))
    const comNome = brutos.map((b) => { const e = estDe.get(b.estudanteId); return { ...b, nome: e?.nome ?? 'Aluno', email: e?.email ?? null, avatar: e?.avatar ?? null, avatarCor: e?.perfil_avatar_cor ?? null } })
    const ordena = (arr: typeof comNome) => [...arr].sort((a, b) => b.score - a.score || b.aulasConcluidas - a.aulasConcluidas || a.nome.localeCompare(b.nome, 'pt-BR'))
    // Reais competem por posição (1..N); ocultos vêm depois marcados (ou somem se "ocultar totalmente").
    const reais = ordena(comNome.filter((b) => !ocultosSet.has(b.estudanteId))).map((b, i) => ({ ...b, posicao: i + 1, oculto: false }))
    const ocultos = ocultarTotal ? [] : ordena(comNome.filter((b) => ocultosSet.has(b.estudanteId))).map((b) => ({ ...b, posicao: 0, oculto: true }))
    const itens: RankingLeituraItem[] = [...reais, ...ocultos]
    return { itens, gamAtivo, pontuacao }
  })
}
