import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember, esquecer } from '@/lib/cache/relatorio-cache'
import { getGamConfig } from '@/lib/gamificacao'
import { normalizarPontuacaoLeitura, pontuarLegProc, bonusSequenciaLeitura, bonusConclusaoLeitura, type PontuacaoLeitura } from '@/lib/leitura/pontuacao'

export type RankingStatus = 'ativo' | 'atencao' | 'risco'
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
  /** Nível de gamificação do aluno (badge na linha). */
  nivel: number
  /** Total de aulas publicadas do módulo (p/ "X/Y · Z%"). */
  totalAulas: number
  /** Último dia com atividade neste módulo (YYYY-MM-DD) — "hoje/ontem/há N dias". */
  ultimoDiaAtivo: string | null
  /** Situação derivada dos dias SEM fazer aula: ativo (≤1d) · pendente (2d) · não ativo (≥3d). */
  status: RankingStatus
}
export interface RankingLeitura { itens: RankingLeituraItem[]; gamAtivo: boolean; pontuacao: PontuacaoLeitura }

/** Iniciais p/ privacidade: "João Marcello Pedote" → "J. P." (primeiro + último nome). */
export function iniciaisDe(nome: string | null | undefined): string {
  const ps = (nome || '').trim().split(/\s+/).filter(Boolean)
  if (!ps.length) return '—'
  const a = ps[0][0]?.toUpperCase() ?? ''
  const b = ps.length > 1 ? (ps[ps.length - 1][0]?.toUpperCase() ?? '') : ''
  return b ? `${a}. ${b}.` : `${a}.`
}

/**
 * PRIVACIDADE (obrigatória): anonimiza o ranking para o ALUNO antes de enviar ao cliente — o nome
 * COMPLETO de TERCEIROS NUNCA sai do servidor. Para os outros alunos, `nome` vira só as INICIAIS e o
 * `email` é zerado; a linha do próprio aluno (`meuId`) mantém o nome (o cliente mostra "Você").
 * Admin NÃO usa isto (precisa do nome/e-mail reais no painel de suporte).
 */
export function anonimizarRankingParaAluno(ranking: RankingLeitura, meuId?: string | null): RankingLeitura {
  return {
    ...ranking,
    itens: ranking.itens.map((it) =>
      it.estudanteId === meuId ? it : { ...it, nome: iniciaisDe(it.nome), email: null },
    ),
  }
}

/** Dias inteiros entre dois YYYY-MM-DD (hoje − dia). */
function diasEntre(hoje: string, dia: string): number {
  return Math.round((Date.parse(hoje + 'T00:00:00Z') - Date.parse(dia + 'T00:00:00Z')) / 86_400_000)
}
// Dias SEM fazer aula: ≤1 = Ativo · 2 = Pendente ('atencao') · ≥3 = Não Ativo ('risco').
export function statusRanking(ultimoDia: string | null | undefined, hoje: string): RankingStatus {
  if (!ultimoDia) return 'risco'
  const d = diasEntre(hoje, ultimoDia)
  return d <= 1 ? 'ativo' : d <= 2 ? 'atencao' : 'risco'
}

/** Chave de cache do ranking de um módulo (mesma usada no `remember`). */
export const chaveRankingLeitura = (tenantId: string, moduloId: string) => `leitura:ranking:${tenantId}:${moduloId}`

/**
 * Invalida o cache do ranking de um módulo — chamar em toda mutação que muda quem aparece/posição
 * (ocultar/desocultar contas de teste, mudar pontuação). Sem isto, o ranking fica preso no valor
 * cacheado por até o TTL. Também limpa o ranking "geral" (agrega todos os módulos).
 */
export async function invalidarRankingLeitura(tenantId: string, moduloId: string): Promise<void> {
  await esquecer(chaveRankingLeitura(tenantId, moduloId))
  await esquecer(chaveRankingLeitura(tenantId, '__geral__'))
}

/**
 * Invalida o ranking do MÓDULO de um documento — chamar ao CONCLUIR aula/quiz (muda aulas/sequência/
 * pontos de quem está no ranking). Resolve a pasta do doc e limpa o cache do módulo + o geral.
 * Best-effort: nunca lança (não pode quebrar o fluxo do aluno).
 */
export async function invalidarRankingPorDocumento(svc: any, tenantId: string, documentoId: string): Promise<void> {
  try {
    const { data } = await svc.from('simulado_documentos').select('pasta_id').eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle()
    await invalidarRankingLeitura(tenantId, (data as { pasta_id?: string | null } | null)?.pasta_id ?? '__geral__')
  } catch { /* best-effort */ }
}

/**
 * Ranking de um MÓDULO do LegProc por desempenho no quiz das aulas. Métrica visível = ACERTOS (score
 * puro por acertos enquanto a gamificação estiver desligada); com a gamificação ligada, `score` passa a
 * usar a pontuação do módulo (aula + acerto + combo de gabarito). Cacheado (TTL) — o "você" é destacado
 * no cliente comparando o id da sessão. Segue o padrão de egress do LegProc (fetchAllByIn, nunca fetchAll).
 */
export async function carregarRankingModulo(moduloId: string, tenantId: string): Promise<RankingLeitura> {
  return remember<RankingLeitura>(chaveRankingLeitura(tenantId, moduloId), 300, async () => {
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

    // Sequência = dias CONSECUTIVOS em que o aluno completou uma AULA COMPLETA (leitura + quiz respondido).
    // Regra: +1 por DIA; reinicia ao pular um dia; ZERA se a última aula não é hoje nem ontem. Fuso do tenant.
    const diaDe = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz })
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: tz })
    const ontem = new Date(Date.parse(hoje + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10)

    // Ajustes MANUAIS da sequência (calendário do suporte) por aluno — sobrepõem o automático. Tolerante.
    const { calcularSequencia } = await import('@/lib/leitura/sequencia')
    const overridesPorAluno = new Map<string, Record<string, boolean>>()
    try {
      const { data: ajs } = await svc.from('simulado_leitura_sequencia_ajuste').select('estudante_id, overrides').eq('tenant_id', tenantId).eq('modulo_id', moduloId)
      for (const a of ajs ?? []) if ((a as any).overrides && typeof (a as any).overrides === 'object') overridesPorAluno.set((a as any).estudante_id, (a as any).overrides)
    } catch { /* migração pendente → sem ajuste */ }

    // Dia de CONCLUSÃO da aula IMUTÁVEL (ledger de XP, `meta.dia` do evento de quiz) — REFAZER não move
    // esse dia, ao contrário do `respondido_em` (que o refazimento sobrescrevia, quebrando o streak de
    // quem refez). Fonte correta da sequência; fallback p/ os dias das respostas quando não há evento.
    const diasLedger = new Map<string, Set<string>>()
    try {
      const { diasConclusaoLedgerSql } = await import('data')
      const rows = await diasConclusaoLedgerSql(tenantId, aulaIds).catch(() => null)
      if (rows) {
        for (const r of rows) diasLedger.set(r.estudante_id, new Set((r.dias ?? []).filter(Boolean)))
      } else {
        const ev = await fetchAllByIn<{ estudante_id: string; meta: any }>(aulaIds, (chunk) =>
          svc.from('simulado_xp_eventos').select('estudante_id, meta').eq('tenant_id', tenantId).eq('origem', 'leitura').like('ref_id', 'quiz:%').filter('meta->>documentoId', 'in', `(${chunk.join(',')})`).order('id'))
        for (const e of ev) { const d = (e as any).meta?.dia; if (!d) continue; const s = diasLedger.get(e.estudante_id) ?? diasLedger.set(e.estudante_id, new Set()).get(e.estudante_id)!; s.add(d) }
      }
    } catch { /* ledger indisponível → usa os dias das respostas */ }

    type Bruto = { estudanteId: string; acertos: number; aulasConcluidas: number; aulasGabaritadas: number; streakAtual: number; ultimoDia: string; score: number }
    const montarBruto = (id: string, acertos: number, aulasConcluidas: number, aulasGabaritadas: number, diasResp: Iterable<string>): Bruto => {
      const dias = diasLedger.get(id) ?? diasResp // prefere o dia imutável do ledger (refazer-safe)
      const seq = calcularSequencia(dias, overridesPorAluno.get(id), hoje, ontem)
      const base = pontuarLegProc(pontuacao, { acertos, aulasConcluidas, aulasGabaritadas }, gamAtivo)
      // Bônus — só com a gamificação ativa. Ambos pelos dias CONSECUTIVOS (streak): conclusão e
      // sequência são duas faixas independentes de bônus sobre a mesma sequência de dias.
      const score = base + (gamAtivo ? bonusSequenciaLeitura(seq.streakAtual, pontuacao) + bonusConclusaoLeitura(seq.streakAtual, pontuacao) : 0)
      return { estudanteId: id, acertos, aulasConcluidas, aulasGabaritadas, streakAtual: seq.streakAtual, ultimoDia: seq.diasEfetivos[seq.diasEfetivos.length - 1] ?? '', score }
    }

    // AGREGAÇÃO NO BANCO (rpc_leitura_ranking): 1 linha por aluno — evita puxar dezenas de milhares de
    // respostas pro app (~61k linhas / ~29s no Lei Seca). Fallback pro read paginado se a função não existir.
    let brutos: Bruto[] = []
    // PRIMÁRIO: RPC jsonb — devolve TODOS os alunos em 1 linha, sem o teto de 1000 do PostgREST
    // (com +1000 alunos o svc.rpc() que retorna linhas cortava em 1000). 1 agregação só no banco.
    const rpcJson = await svc.rpc('rpc_leitura_ranking_json', { p_tenant: tenantId, p_docs: aulaIds, p_tz: tz })
    const linhasJson: any[] | null = !rpcJson.error && Array.isArray(rpcJson.data) ? rpcJson.data : null
    if (linhasJson) {
      brutos = linhasJson
        .map((r) => montarBruto(r.estudante_id, r.acertos ?? 0, r.aulas_concluidas ?? 0, r.aulas_gabaritadas ?? 0, (r.dias ?? []) as string[]))
        .filter((x) => x.acertos > 0 || x.aulasConcluidas > 0)
    } else {
      // FALLBACK: read paginado (quiz + respostas) + agregação no app — só se a RPC não estiver aplicada.
      const [quiz, resp] = await Promise.all([
        fetchAllByIn<{ documento_id: string; questao_id: string }>(aulaIds, (chunk) =>
          svc.from('simulado_documento_quiz_questoes').select('documento_id, questao_id').eq('tenant_id', tenantId).eq('deletado', false).in('documento_id', chunk).order('id')).catch(() => [] as { documento_id: string; questao_id: string }[]),
        fetchAllByIn<{ estudante_id: string; documento_id: string; questao_id: string; correta: boolean; respondido_em: string | null }>(aulaIds, (chunk) =>
          svc.from('simulado_leitura_respostas').select('estudante_id, documento_id, questao_id, correta, respondido_em').eq('tenant_id', tenantId).in('documento_id', chunk).order('id')),
      ])
      const quizPorDoc = new Map<string, Set<string>>()
      for (const q of quiz) (quizPorDoc.get(q.documento_id) ?? quizPorDoc.set(q.documento_id, new Set()).get(q.documento_id)!).add(q.questao_id)
      const porAluno = new Map<string, Map<string, { answered: Set<string>; correct: Set<string>; ultima: string | null }>>()
      for (const r of resp) {
        const q = quizPorDoc.get(r.documento_id); if (!q || !q.has(r.questao_id)) continue
        const dmap = porAluno.get(r.estudante_id) ?? porAluno.set(r.estudante_id, new Map()).get(r.estudante_id)!
        const cell = dmap.get(r.documento_id) ?? dmap.set(r.documento_id, { answered: new Set(), correct: new Set(), ultima: null }).get(r.documento_id)!
        cell.answered.add(r.questao_id); if (r.correta) cell.correct.add(r.questao_id)
        if (r.respondido_em && (!cell.ultima || r.respondido_em > cell.ultima)) cell.ultima = r.respondido_em
      }
      brutos = [...porAluno.entries()].map(([id, dmap]) => {
        let acertos = 0, aulasConcluidas = 0, aulasGabaritadas = 0; const dias = new Set<string>()
        for (const [docId, cell] of dmap) {
          const qs = quizPorDoc.get(docId)!; acertos += cell.correct.size
          const feita = qs.size > 0 && [...qs].every((qid) => cell.answered.has(qid))
          if (feita) { aulasConcluidas++; if ([...qs].every((qid) => cell.correct.has(qid))) aulasGabaritadas++; if (cell.ultima) dias.add(diaDe(cell.ultima)) }
        }
        return montarBruto(id, acertos, aulasConcluidas, aulasGabaritadas, dias)
      }).filter((x) => x.acertos > 0 || x.aulasConcluidas > 0)
    }

    // Filtro "EFETIVAMENTE PRATICANDO" (recência configurável em pontuacao.dias_ativo): a ÚLTIMA aula
    // concluída tem de ser dentro dos últimos N dias. 0 = mostra todos com atividade (sem filtro).
    const diasAtivo = pontuacao.dias_ativo ?? 0
    if (diasAtivo > 0) {
      const limite = new Date(Date.parse(hoje + 'T00:00:00Z') - diasAtivo * 86_400_000).toISOString().slice(0, 10)
      brutos = brutos.filter((b) => b.ultimoDia && b.ultimoDia >= limite)
    }
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
    // Nível de gamificação por aluno (tolerante — tabela pode não existir).
    const nivelDe = new Map<string, number>()
    try {
      const gam = await fetchAllByIn<{ estudante_id: string; nivel: number | null }>(brutos.map((b) => b.estudanteId), (chunk) =>
        svc.from('simulado_gamificacao_estudante').select('estudante_id, nivel').eq('tenant_id', tenantId).in('estudante_id', chunk))
      for (const g of gam) nivelDe.set(g.estudante_id, Math.max(1, Number(g.nivel ?? 1)))
    } catch { /* gamificação ausente */ }
    const totalAulas = aulaIds.length
    const comNome = brutos.map((b) => { const e = estDe.get(b.estudanteId); return {
      ...b, nome: e?.nome ?? 'Aluno', email: e?.email ?? null, avatar: e?.avatar ?? null, avatarCor: e?.perfil_avatar_cor ?? null,
      nivel: nivelDe.get(b.estudanteId) ?? 1, totalAulas, ultimoDiaAtivo: b.ultimoDia || null, status: statusRanking(b.ultimoDia, hoje),
    } })
    // Ordena por SEQUÊNCIA (streak) primeiro — pedido do produto — depois pontos, aulas e nome.
    const ordena = (arr: typeof comNome) => [...arr].sort((a, b) => b.streakAtual - a.streakAtual || b.score - a.score || b.aulasConcluidas - a.aulasConcluidas || a.nome.localeCompare(b.nome, 'pt-BR'))
    // Reais competem por posição (1..N); ocultos vêm depois marcados (ou somem se "ocultar totalmente").
    const reais = ordena(comNome.filter((b) => !ocultosSet.has(b.estudanteId))).map((b, i) => ({ ...b, posicao: i + 1, oculto: false }))
    const ocultos = ocultarTotal ? [] : ordena(comNome.filter((b) => ocultosSet.has(b.estudanteId))).map((b) => ({ ...b, posicao: 0, oculto: true }))
    const itens: RankingLeituraItem[] = [...reais, ...ocultos]
    return { itens, gamAtivo, pontuacao }
  })
}

/**
 * Linha do PRÓPRIO aluno no ranking do módulo, calculada FRESCA (sem cache) e barata (1 aluno só).
 * O card "Você" usa isto para mostrar aulas/sequência/pontos corretos IMEDIATAMENTE após concluir —
 * mesmo que a LISTA (cacheada ~5 min e compartilhada por todos) ainda esteja defasada. NÃO invalidamos
 * o cache da lista a cada resposta de propósito: num desafio ao vivo com 1000+ alunos isso recriaria o
 * pico de egress. A POSIÇÃO exata é resolvida no cliente comparando com a lista cacheada.
 * Retorna null se o aluno ainda não tem atividade neste módulo.
 */
export async function calcularMinhaLinhaLeitura(moduloId: string, tenantId: string, estudanteId: string): Promise<RankingLeituraItem | null> {
  const svc = createAdminClient()
  const geral = moduloId === '__geral__'

  let pontuacaoRaw: unknown = null
  if (!geral) {
    try { const { data } = await svc.from('simulado_pastas').select('pontuacao').eq('id', moduloId).eq('tenant_id', tenantId).maybeSingle(); pontuacaoRaw = (data as { pontuacao?: unknown } | null)?.pontuacao ?? null } catch { /* coluna ausente */ }
  }
  const pontuacao = normalizarPontuacaoLeitura(pontuacaoRaw)
  let gamAtivo = false; let tz = 'America/Sao_Paulo'
  try { const cfg = await getGamConfig(svc, tenantId); gamAtivo = !!cfg?.ativo; tz = cfg?.timezone || tz } catch { /* gamificação ausente */ }

  // Aulas (documentos) do módulo.
  let dq = svc.from('simulado_documentos').select('id').eq('tenant_id', tenantId).eq('deletado', false).eq('publicado', true)
  dq = geral ? dq.is('pasta_id', null) : dq.eq('pasta_id', moduloId)
  const { data: docs } = await dq
  const aulaIds = (docs ?? []).map((d: { id: string }) => d.id)
  if (!aulaIds.length) return null

  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const ontem = new Date(Date.parse(hoje + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10)
  const diaDe = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz })

  // Quiz do módulo + respostas SÓ deste aluno (barato — 1 pessoa).
  const [quiz, resp] = await Promise.all([
    fetchAllByIn<{ documento_id: string; questao_id: string }>(aulaIds, (chunk) =>
      svc.from('simulado_documento_quiz_questoes').select('documento_id, questao_id').eq('tenant_id', tenantId).eq('deletado', false).in('documento_id', chunk).order('id')).catch(() => [] as { documento_id: string; questao_id: string }[]),
    fetchAllByIn<{ documento_id: string; questao_id: string; correta: boolean; respondido_em: string | null }>(aulaIds, (chunk) =>
      svc.from('simulado_leitura_respostas').select('documento_id, questao_id, correta, respondido_em').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).in('documento_id', chunk).order('id')),
  ])
  if (!resp.length) return null

  const quizPorDoc = new Map<string, Set<string>>()
  for (const q of quiz) (quizPorDoc.get(q.documento_id) ?? quizPorDoc.set(q.documento_id, new Set()).get(q.documento_id)!).add(q.questao_id)
  const porDoc = new Map<string, { answered: Set<string>; correct: Set<string>; ultima: string | null }>()
  for (const r of resp) {
    const q = quizPorDoc.get(r.documento_id); if (!q || !q.has(r.questao_id)) continue
    const cell = porDoc.get(r.documento_id) ?? porDoc.set(r.documento_id, { answered: new Set(), correct: new Set(), ultima: null }).get(r.documento_id)!
    cell.answered.add(r.questao_id); if (r.correta) cell.correct.add(r.questao_id)
    if (r.respondido_em && (!cell.ultima || r.respondido_em > cell.ultima)) cell.ultima = r.respondido_em
  }
  let acertos = 0, aulasConcluidas = 0, aulasGabaritadas = 0; const dias = new Set<string>()
  for (const [docId, cell] of porDoc) {
    const qs = quizPorDoc.get(docId)!; acertos += cell.correct.size
    const feita = qs.size > 0 && [...qs].every((qid) => cell.answered.has(qid))
    if (feita) { aulasConcluidas++; if ([...qs].every((qid) => cell.correct.has(qid))) aulasGabaritadas++; if (cell.ultima) dias.add(diaDe(cell.ultima)) }
  }
  if (acertos === 0 && aulasConcluidas === 0) return null

  // Ajuste MANUAL de sequência (calendário do suporte) deste aluno — sobrepõe o automático.
  let overrides: Record<string, boolean> | undefined
  try { const { data: aj } = await svc.from('simulado_leitura_sequencia_ajuste').select('overrides').eq('tenant_id', tenantId).eq('modulo_id', moduloId).eq('estudante_id', estudanteId).maybeSingle(); const o = (aj as { overrides?: unknown } | null)?.overrides; if (o && typeof o === 'object') overrides = o as Record<string, boolean> } catch { /* migração pendente */ }
  // Dia de conclusão IMUTÁVEL (ledger de XP, meta.dia do evento de quiz) — refazer não move; corrige o
  // streak de quem refez (o respondido_em era sobrescrito). Fallback p/ os dias das respostas.
  let diasLedger: Set<string> | null = null
  try {
    const { data: ev } = await svc.from('simulado_xp_eventos').select('meta').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('origem', 'leitura').like('ref_id', 'quiz:%')
    const s = new Set<string>()
    for (const e of (ev ?? []) as any[]) { const d = e.meta?.dia, doc = e.meta?.documentoId; if (d && doc && aulaIds.includes(doc)) s.add(d) }
    if (s.size) diasLedger = s
  } catch { /* ledger indisponível → usa dias das respostas */ }
  const { calcularSequencia } = await import('@/lib/leitura/sequencia')
  const seq = calcularSequencia(diasLedger ?? dias, overrides, hoje, ontem)
  const base = pontuarLegProc(pontuacao, { acertos, aulasConcluidas, aulasGabaritadas }, gamAtivo)
  const score = base + (gamAtivo ? bonusSequenciaLeitura(seq.streakAtual, pontuacao) + bonusConclusaoLeitura(seq.streakAtual, pontuacao) : 0)
  const ultimoDia = seq.diasEfetivos[seq.diasEfetivos.length - 1] ?? ''

  const { data: e } = await svc.from('simulado_estudantes').select('nome, email, avatar, perfil_avatar_cor').eq('id', estudanteId).eq('tenant_id', tenantId).maybeSingle()
  let nivel = 1
  try { const { data: g } = await svc.from('simulado_gamificacao_estudante').select('nivel').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).maybeSingle(); nivel = Math.max(1, Number((g as { nivel?: number | null } | null)?.nivel ?? 1)) } catch { /* gamificação ausente */ }

  return {
    estudanteId, nome: (e as { nome?: string } | null)?.nome ?? 'Você', email: (e as { email?: string | null } | null)?.email ?? null,
    avatar: (e as { avatar?: string | null } | null)?.avatar ?? null, avatarCor: (e as { perfil_avatar_cor?: string | null } | null)?.perfil_avatar_cor ?? null,
    acertos, aulasConcluidas, aulasGabaritadas, score, streakAtual: seq.streakAtual,
    posicao: 0, oculto: false, nivel, totalAulas: aulaIds.length,
    ultimoDiaAtivo: ultimoDia || null, status: statusRanking(ultimoDia, hoje),
  }
}
