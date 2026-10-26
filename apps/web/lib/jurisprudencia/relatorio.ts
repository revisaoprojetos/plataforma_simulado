import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { remember } from '@/lib/cache/relatorio-cache'
import type { RelatorioModulo, RelatorioTop } from '@/lib/leitura/relatorio'
import type { RankingLeituraItem } from '@/lib/leitura/ranking'
import { carregarRankingJuris, rpcJurisRelatorio } from '@/lib/jurisprudencia/ranking'
import { lerDesafioJogo, preencherTesesPorQuiz } from '@/lib/jurisprudencia/conteudo'

/**
 * Relatório do admin do Desafio de Jurisprudência no MESMO shape do Lei Seca (`RelatorioModulo`), p/
 * reaproveitar o componente `LeituraRelatorio` (KPIs + adesão por dia + tops + por "aula"→"dia") SEM copiar.
 * Semântica: "aula" → "DIA do desafio"; tempos de leitura/quiz = 0 (o arcade não registra duração).
 * Otimizado: reusa o ranking JÁ cacheado (per-aluno) + 1 query leve de `dom` (per-dia). Cache TTL 1800s.
 */
const chave = (tenantId: string, desafioId: string) => `jurisprudencia:relatorio:${tenantId}:${desafioId}`

export async function carregarRelatorioJuris(desafioId: string, tenantId: string): Promise<RelatorioModulo> {
  return remember<RelatorioModulo>(chave(tenantId, desafioId), 1800, async () => {
    const svc = createAdminClient()
    // Reads independentes → em paralelo: config do desafio (jogo/dias), nome do módulo e ranking (JÁ cacheado,
    // per-aluno). `preencherTesesPorQuiz` fica depois por depender de `dj.dias`.
    const [dj, moduloNome, rank] = await Promise.all([
      lerDesafioJogo(svc, desafioId),
      (async (): Promise<string> => {
        let n = 'Desafio'
        try { const { data } = await svc.from('simulado_pastas').select('nome').eq('id', desafioId).eq('tenant_id', tenantId).maybeSingle(); n = (data as any)?.nome ?? n } catch { /* ignore */ }
        return n
      })(),
      carregarRankingJuris(desafioId, tenantId),
    ])
    const diasObj = dj?.dias && typeof dj.dias === 'object' ? (dj.dias as Record<string, any>) : {}
    const diasComTeses = await preencherTesesPorQuiz(svc, diasObj).catch(() => diasObj)
    const diasChaves = Object.keys(diasComTeses)
    const totalDias = diasChaves.length
    const tesesDoDia = (k: string): number => { const t = diasComTeses[k]?.teses; return Array.isArray(t) ? t.length : 0 }
    const diaCompleto = (dom: any, k: string): boolean => { const arr = dom?.[k]; const n = tesesDoDia(k); return n > 0 && Array.isArray(arr) && arr.length >= n }
    const tituloDia = (k: string): string => (diasComTeses[k]?.titulo || '').toString().trim() || `Dia ${k}`

    // Per-aluno (ranking JÁ cacheado, resolvido acima): nome/email/dias dominados/pontos/sequência.
    const reais = rank.itens.filter((i) => !i.oculto)
    const totalAlunos = reais.length
    const aulasConcluidasTotal = reais.reduce((s, i) => s + i.aulasConcluidas, 0)
    const mediaAulasPorAluno = totalAlunos ? Math.round(aulasConcluidasTotal / totalAlunos) : 0

    const top = (sel: (i: RankingLeituraItem) => number): RelatorioTop[] =>
      [...reais].sort((a, b) => sel(b) - sel(a)).slice(0, 10).filter((i) => sel(i) > 0).map((i) => ({ estudanteId: i.estudanteId, nome: i.nome, email: i.email, valor: sel(i) }))
    const topSequencia = top((i) => i.streakAtual)
    const topPontos = top((i) => i.score)

    const pontos = reais.map((i) => i.score)
    const pontosTotal = pontos.reduce((s, x) => s + x, 0)
    const pontosMaior = pontos.reduce((m, x) => Math.max(m, x), 0)
    const pontosMedia = totalAlunos ? Math.round(pontosTotal / totalAlunos) : 0

    const seqs = reais.map((i) => i.streakAtual)
    const seqMaior = seqs.reduce((m, x) => Math.max(m, x), 0)
    const seqMedia = totalAlunos ? Math.round((seqs.reduce((s, x) => s + x, 0) / totalAlunos) * 10) / 10 : 0
    const distMap = new Map<number, number>()
    for (const s of seqs) if (s > 0) distMap.set(s, (distMap.get(s) ?? 0) + 1)
    const seqDistribuicao = [...distMap.entries()].sort((a, b) => a[0] - b[0]).map(([seq, alunos]) => ({ seq, alunos }))

    // Per-dia (adesão): quantos DOMINARAM cada dia — via RPC (agrega no banco) ou fallback (1 query de `dom`).
    const tesesMap: Record<string, number> = {}; for (const k of diasChaves) tesesMap[k] = tesesDoDia(k)
    const dominadosPorDia: Record<string, number> = {}
    const rpc = await rpcJurisRelatorio(svc, tenantId, desafioId, diasChaves, tesesMap)
    if (rpc) {
      for (const x of rpc.por_dia) dominadosPorDia[String(x.dia)] = Number(x.alunos) || 0
    } else {
      const progresso = await fetchAll<{ estudante_id: string; dom: any }>(() =>
        svc.from('simulado_jurisprudencia_progresso').select('estudante_id, dom').eq('desafio_id', desafioId).order('estudante_id', { ascending: true }))
      for (const k of diasChaves) dominadosPorDia[k] = progresso.filter((p) => diaCompleto(p.dom, k)).length
    }
    const porDia = diasChaves.map((k) => { const alunos = dominadosPorDia[k] ?? 0; return { dia: tituloDia(k), alunos, aulas: alunos } })
    const porAula = diasChaves.map((k, idx) => ({ docId: k, titulo: tituloDia(k), ordem: Number(k) || idx + 1, concluiram: dominadosPorDia[k] ?? 0, leituraMediaSeg: 0, quizMediaSeg: 0 }))

    return {
      moduloNome, totalAlunos, totalAulas: totalDias, aulasConcluidasTotal, mediaAulasPorAluno,
      porDia, seqMedia, seqMaior, seqDistribuicao, topSequencia,
      pontosMedia, pontosMaior, pontosTotal, topPontos, porAula,
    }
  })
}
