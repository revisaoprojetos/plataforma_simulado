import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember, esquecer } from '@/lib/cache/relatorio-cache'
import { statusRanking, type RankingLeitura, type RankingLeituraItem } from '@/lib/leitura/ranking'
import { normalizarPontuacaoLeitura } from '@/lib/leitura/pontuacao'
import { lerDesafioJogo, perfilAlunos, preencherTesesPorQuiz } from '@/lib/jurisprudencia/conteudo'
import { diasAtivosPorAluno } from '@/lib/jurisprudencia/sequencia'
import { calcularSequencia } from '@/lib/leitura/sequencia'

/**
 * Ranking do ADMIN do Desafio de Jurisprudência no MESMO formato do Lei Seca (`RankingLeitura`), para
 * reaproveitar o componente rico `RankingAdmin` (pódio/filtros/abas/export/paginação/ao vivo) SEM copiar.
 * Mapeamento das colunas "de aula" → "de dia" do arcade:
 *   - totalAulas      = total de DIAS do desafio (desafio_jogo.dias)
 *   - aulasConcluidas = DIAS DOMINADOS (todas as teses do dia dominadas em `dom`)  [= acertos = gabaritadas]
 *   - score           = soma dos melhores pontos por dia (`best`)  [arcade puro, sem bônus de gamificação]
 *   - streakAtual     = sequência (ledger simulado_xp_eventos origem='jurisprudencia') — reusa a leitura
 *   - ultimoDiaAtivo  = maior dia ativo do ledger (fallback: dia de `atualizado_em`)
 *   - status          = statusRanking(ultimoDiaAtivo) — mesmo cálculo do Lei Seca
 *   - oculto          = ranking_ocultos da pasta (estudantes/grupos) + testadores (modo teste)
 * Otimizado: 1 query base (progresso) + ledger + perfis + e-mails em lote; cacheado (TTL 300s).
 */

const TZ = 'America/Sao_Paulo'

export const chaveRankingJuris = (tenantId: string, desafioId: string) => `jurisprudencia:ranking-admin:${tenantId}:${desafioId}`
export async function invalidarRankingJuris(tenantId: string, desafioId: string): Promise<void> {
  await esquecer(chaveRankingJuris(tenantId, desafioId))
}

/**
 * CAMINHO RÁPIDO (escala): agrega ranking+relatório do juris NO BANCO via `rpc_juris_relatorio_json`
 * (1 query), evitando puxar o progresso inteiro + varrer o ledger no app. Retorna null se a RPC não
 * estiver aplicada (→ fallback). `tesesPorDia` = { diaKey: nº de teses } (vem do desafio_jogo jsonb).
 */
export async function rpcJurisRelatorio(
  svc: any, tenantId: string, desafioId: string, diasChaves: string[], tesesPorDia: Record<string, number>,
): Promise<{ por_aluno: any[]; por_dia: any[] } | null> {
  try {
    const r = await svc.rpc('rpc_juris_relatorio_json', { p_tenant: tenantId, p_desafio: desafioId, p_dias: diasChaves, p_teses: tesesPorDia })
    if (r.error || !r.data) return null
    const d = r.data as any
    return { por_aluno: Array.isArray(d.por_aluno) ? d.por_aluno : [], por_dia: Array.isArray(d.por_dia) ? d.por_dia : [] }
  } catch { return null }
}

export async function carregarRankingJuris(desafioId: string, tenantId: string): Promise<RankingLeitura> {
  return remember<RankingLeitura>(chaveRankingJuris(tenantId, desafioId), 30, async () => {
    const svc = createAdminClient()
    const pontuacao = normalizarPontuacaoLeitura(null)
    const vazio: RankingLeitura = { itens: [], gamAtivo: false, pontuacao }

    const dj = await lerDesafioJogo(svc, desafioId)
    if (!dj) return vazio
    const diasObj = dj.dias && typeof dj.dias === 'object' ? (dj.dias as Record<string, any>) : {}
    const diasComTeses = await preencherTesesPorQuiz(svc, diasObj).catch(() => diasObj)
    const diasChaves = Object.keys(diasComTeses)
    const totalDias = diasChaves.length
    const tesesDoDia = (k: string): number => { const t = diasComTeses[k]?.teses; return Array.isArray(t) ? t.length : 0 }
    const diaCompleto = (dom: any, k: string): boolean => { const arr = dom?.[k]; const n = tesesDoDia(k); return n > 0 && Array.isArray(arr) && arr.length >= n }

    const pontosDe = (best: any): number => {
      if (!best || typeof best !== 'object') return 0
      let soma = 0; for (const d of diasChaves) soma += Math.max(0, Number(best[d]) || 0); return soma
    }
    const dominadosDe = (dom: any): number => diasChaves.filter((k) => diaCompleto(dom, k)).length
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
    const diaDe = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })

    // Registros por aluno: CAMINHO RÁPIDO via RPC (agrega no banco — blinda a escala) ou FALLBACK
    // (puxa o progresso + varre o ledger no app, se a RPC não estiver aplicada).
    type Reg = { estudanteId: string; pontos: number; dominados: number; dias: Set<string>; atualizadoEm: string | null }
    const tesesMap: Record<string, number> = {}; for (const k of diasChaves) tesesMap[k] = tesesDoDia(k)
    let regs: Reg[]
    const rpc = await rpcJurisRelatorio(svc, tenantId, desafioId, diasChaves, tesesMap)
    if (rpc) {
      regs = rpc.por_aluno.map((a) => ({ estudanteId: a.estudante_id, pontos: Number(a.pontos) || 0, dominados: Number(a.dominados) || 0, dias: new Set<string>(), atualizadoEm: a.atualizado_em ?? null }))
    } else {
      const progresso = await fetchAll<{ estudante_id: string; dom: any; best: any; atualizado_em: string | null }>(() =>
        svc.from('simulado_jurisprudencia_progresso').select('estudante_id, dom, best, atualizado_em').eq('desafio_id', desafioId).order('estudante_id', { ascending: true }))
      regs = progresso.map((p) => ({ estudanteId: p.estudante_id, pontos: pontosDe(p.best), dominados: dominadosDe(p.dom), dias: new Set<string>(), atualizadoEm: p.atualizado_em ?? null }))
    }
    if (!regs.length) return vazio
    const ids = [...new Set(regs.map((r) => r.estudanteId))]
    // Sequência: SEMPRE do ledger FILTRADO (ignora datas fabricadas pelo cliente — meta.dia != dia de
    // criação). O RPC agrega pontos/dominados no banco mas NÃO filtra as datas, então recomputamos `dias`
    // aqui p/ a sequência bater (diasAtivosPorAluno já descarta os eventos fabricados).
    const atualizadoSeq = new Map<string, string | null>(regs.map((r) => [r.estudanteId, r.atualizadoEm]))
    const diasSeq = await diasAtivosPorAluno(svc, tenantId, desafioId, atualizadoSeq, ids).catch(() => new Map<string, Set<string>>())
    for (const r of regs) r.dias = diasSeq.get(r.estudanteId) ?? new Set<string>()
    const ontem = new Date(Date.parse(hoje + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10)

    // Ajustes MANUAIS da sequência (calendário do suporte) por aluno — sobrepõem o automático. Tolerante.
    const overridesPorAluno = new Map<string, Record<string, boolean>>()
    try {
      const ajs = await fetchAllByIn<{ estudante_id: string; overrides: any }>(ids, (chunk) => svc.from('simulado_jurisprudencia_sequencia_ajuste').select('estudante_id, overrides').eq('tenant_id', tenantId).eq('desafio_id', desafioId).in('estudante_id', chunk))
      for (const a of ajs) if (a.overrides && typeof a.overrides === 'object') overridesPorAluno.set(a.estudante_id, a.overrides as Record<string, boolean>)
    } catch { /* migração de ajuste pendente → sem override */ }

    // Contas ocultas do ranking: ranking_ocultos da pasta (estudantes + grupos) + testadores (modo teste).
    const ocultosSet = new Set<string>(); let ocultarTotal = false
    try {
      const { data: ro } = await svc.from('simulado_pastas').select('ranking_ocultos').eq('id', desafioId).eq('tenant_id', tenantId).maybeSingle()
      const cfg = (ro as any)?.ranking_ocultos ?? {}
      ocultarTotal = cfg.total === true
      for (const id of (Array.isArray(cfg.estudantes) ? cfg.estudantes : [])) ocultosSet.add(id)
      const grps = Array.isArray(cfg.grupos) ? cfg.grupos : []
      if (grps.length) { const mem = await fetchAllByIn<{ estudante_id: string }>(grps, (chunk) => svc.from('simulado_grupo_membros').select('estudante_id').in('grupo_id', chunk)); for (const m of mem) ocultosSet.add(m.estudante_id) }
    } catch { /* coluna ranking_ocultos ausente */ }
    try { const { testadoresDoModulo } = await import('@/lib/leitura/testadores'); for (const id of await testadoresDoModulo(svc, tenantId, desafioId)) ocultosSet.add(id) } catch { /* ausente */ }

    // Perfil (nome/avatar/nível) + e-mail (em lote — o perfilAlunos não traz e-mail).
    const perfis = await perfilAlunos(svc, tenantId, ids)
    const ests = await fetchAllByIn<{ id: string; email: string | null }>(ids, (chunk) => svc.from('simulado_estudantes').select('id, email').in('id', chunk))
    const emailDe = new Map(ests.map((e) => [e.id, e.email ?? null]))

    type Bruto = Omit<RankingLeituraItem, 'posicao' | 'oculto'> & { ultimoDia: string }
    const brutos: Bruto[] = regs.map((r) => {
      const dom = r.dominados
      const dias = r.dias
      const ultimoDia = [...dias].sort().pop() ?? (r.atualizadoEm ? diaDe(r.atualizadoEm) : '')
      const perfil = perfis.get(r.estudanteId)
      return {
        estudanteId: r.estudanteId,
        nome: perfil?.nome ?? 'Aluno', email: emailDe.get(r.estudanteId) ?? null,
        avatar: perfil?.avatar ?? null, avatarCor: perfil?.avatarCor ?? null,
        acertos: dom, aulasConcluidas: dom, aulasGabaritadas: dom,
        score: r.pontos, streakAtual: calcularSequencia(dias, overridesPorAluno.get(r.estudanteId), hoje, ontem).streakAtual,
        nivel: perfil?.nivel ?? 1, totalAulas: totalDias,
        ultimoDiaAtivo: ultimoDia || null, status: statusRanking(ultimoDia || null, hoje),
        ultimoDia,
      }
    })

    const ordena = (arr: Bruto[]) => [...arr].sort((a, b) => b.streakAtual - a.streakAtual || b.score - a.score || b.aulasConcluidas - a.aulasConcluidas || a.nome.localeCompare(b.nome, 'pt-BR'))
    const semUltimo = ({ ultimoDia, ...rest }: Bruto) => rest
    const reais = ordena(brutos.filter((b) => !ocultosSet.has(b.estudanteId))).map((b, i) => ({ ...semUltimo(b), posicao: i + 1, oculto: false }))
    const ocultos = ocultarTotal ? [] : ordena(brutos.filter((b) => ocultosSet.has(b.estudanteId))).map((b) => ({ ...semUltimo(b), posicao: 0, oculto: true }))
    const itens: RankingLeituraItem[] = [...reais, ...ocultos]
    return { itens, gamAtivo: false, pontuacao }
  })
}
