// Ranking REAL do resultado do aluno (aba Ranking do "Simulados realizados"). Antes a visualização
// usava dados de EXEMPLO (deriveSamples), por isso a POSIÇÃO não batia com a CLASSIFICAÇÃO. Aqui tudo
// vem da MESMA fonte (`calcularRanking` — dedup por aluno pela política de nota), então posição,
// percentil e o top ficam consistentes. Nomes dos outros alunos aparecem só como INICIAIS (anônimo).
//
// PERF: a parte da TURMA (ranks + top + histograma + média) é IDÊNTICA para todos os alunos → cacheada
// por simulado (TTL do relatório). Só o recorte do ALUNO (posição/percentil/voce) é por chamada — barato.

import { calcularRanking } from '@/lib/ranking'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember, chaveRelatorio, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'
import { avatarPadraoDe, corAvatarPadrao } from '@/lib/aluno/avatar-padrao'
import type { ResRankPeer } from '@/components/brand/interna/resultado/data'

type AnyClient = { from: (t: string) => any }

/** Iniciais anônimas a partir do nome (1º nome + inicial do sobrenome). Ex.: "Maria Alves" → "M. A.". */
function iniciaisDe(nome: string): string {
  const ps = (nome || '').trim().split(/\s+/).filter(Boolean)
  if (!ps.length) return '—'
  const a = ps[0][0]?.toUpperCase() ?? ''
  const b = ps.length > 1 ? (ps[ps.length - 1][0]?.toUpperCase() ?? '') : ''
  return b ? `${a}. ${b}.` : `${a}.`
}

export interface RankingResultado {
  participantes: number
  posicao: number
  percentil: number
  mediaTurma: number
  mediaMarcador: number
  histograma: { faixa: string; qtd: number; voce?: boolean }[]
  top: ResRankPeer[]
  voce: ResRankPeer
  podio: ResRankPeer[]
}

type PeerTurma = { eid: string; iniciais: string; nota: number; acertos: number; posicao: number; capi: string; capiCor: string | null }
interface TurmaRank {
  participantes: number
  mediaTurma: number
  notas: number[] // todas as notas (p/ posição/percentil)
  binsQtd: number[] // histograma (10 faixas de 10)
  top: PeerTurma[] // top 5 (com id interno p/ marcar "Você")
  podio: PeerTurma[] // top 3
}

/** Parte da TURMA — igual p/ todos os alunos → CACHEADA por simulado. `brand` define a capivara padrão. */
async function montarRankingTurma(svc: AnyClient, simuladoId: string, tenantId: string | null, brand?: string | null): Promise<TurmaRank | null> {
  return remember(chaveRelatorio(tenantId, 'ranking-resultado', simuladoId), TTL_RELATORIO, async (): Promise<TurmaRank | null> => {
    const ranks = await calcularRanking(svc, simuladoId)
    if (!ranks.length) return null
    const participantes = ranks.length
    const notas = ranks.map((r) => r.notaOficial)
    const mediaTurma = Math.round((notas.reduce((a, b) => a + b, 0) / participantes) * 10) / 10
    const bins = Array.from({ length: 10 }, () => 0)
    for (const n of notas) bins[Math.max(0, Math.min(9, Math.floor(n / 10)))]++

    const topN = ranks.slice(0, 5)
    const ids = [...new Set(topN.map((r) => r.estudanteId))]
    const [{ data: ests }, { data: sess }] = await Promise.all([
      svc.from('simulado_estudantes').select('id, nome').in('id', ids),
      svc.from('simulado_sessoes_prova').select('id, estudante_id, nota').eq('simulado_id', simuladoId).in('estudante_id', ids).eq('is_teste', false).eq('status', 'finalizada').eq('deletado', false),
    ])
    // Avatar dos TOP: só a CAPIVARA padrão (anônima, determinística pelo nome) — NÃO expõe a foto real
    // dos outros alunos (ranking é anônimo). O avatar real só aparece no "Você" (resolvido por chamada).
    const nomeDe = new Map<string, string>(((ests ?? []) as any[]).map((e) => [e.id, e.nome ?? '']))
    const bestSess = new Map<string, { id: string; nota: number }>()
    for (const s of ((sess ?? []) as any[])) { const n = Number(s.nota ?? -1); const cur = bestSess.get(s.estudante_id); if (!cur || n > cur.nota) bestSess.set(s.estudante_id, { id: s.id, nota: n }) }
    const sessIds = [...bestSess.values()].map((s) => s.id)
    const acPorSess = new Map<string, number>()
    if (sessIds.length) {
      const resp = await fetchAllByIn<{ sessao_id: string; correta: boolean }>(sessIds, (chunk) =>
        svc.from('simulado_respostas_objetivas').select('sessao_id, correta').in('sessao_id', chunk).order('id', { ascending: true }))
      for (const r of resp as any[]) if (r.correta) acPorSess.set(r.sessao_id, (acPorSess.get(r.sessao_id) ?? 0) + 1)
    }
    const acDe = (eid: string): number => { const s = bestSess.get(eid); return s ? (acPorSess.get(s.id) ?? 0) : 0 }
    const peer = (r: { estudanteId: string; notaOficial: number; posicao: number }): PeerTurma => { const nome = nomeDe.get(r.estudanteId) ?? ''; return { eid: r.estudanteId, iniciais: iniciaisDe(nome), nota: r.notaOficial, acertos: acDe(r.estudanteId), posicao: r.posicao, capi: avatarPadraoDe(nome, brand), capiCor: corAvatarPadrao(nome) } }
    return { participantes, mediaTurma, notas, binsQtd: bins, top: topN.map(peer), podio: ranks.slice(0, 3).map(peer) }
  })
}

/** Ranking real do simulado para o resultado do aluno. `opts.minhaNota/meusAcertos` (do melhor da página)
 *  evitam uma query. `null` se não há participantes. */
export async function montarRankingResultado(
  svc: AnyClient,
  simuladoId: string,
  meuEstudanteId: string,
  tenantId: string | null,
  brand?: string | null,
  opts?: { minhaNota?: number | null; meusAcertos?: number },
): Promise<RankingResultado | null> {
  // A parte da TURMA (cacheada) e o avatar do PRÓPRIO aluno são INDEPENDENTES → rodam em paralelo.
  // Avatar do PRÓPRIO aluno (foto real, se tiver; senão a capivara pelo nome) — só o "Você" mostra o real.
  const [turma, meRow] = await Promise.all([
    montarRankingTurma(svc, simuladoId, tenantId, brand),
    (async () => (await svc.from('simulado_estudantes').select('nome, avatar, perfil_avatar_cor').eq('id', meuEstudanteId).maybeSingle()).data)(),
  ])
  if (!turma) return null
  const { participantes, mediaTurma, notas, binsQtd } = turma

  const meuNome = (meRow as any)?.nome ?? ''
  const meuAvatar: string = ((meRow as any)?.avatar as string) || avatarPadraoDe(meuNome, brand)
  const meuAvatarCor: string | null = ((meRow as any)?.perfil_avatar_cor as string) || corAvatarPadrao(meuNome)

  const meTop = turma.top.find((p) => p.eid === meuEstudanteId) ?? turma.podio.find((p) => p.eid === meuEstudanteId) ?? null
  let minhaNota = opts?.minhaNota ?? meTop?.nota ?? null
  let meusAcertos = opts?.meusAcertos ?? meTop?.acertos ?? 0
  if (minhaNota == null) {
    const { data } = await svc.from('simulado_sessoes_prova').select('id, nota').eq('simulado_id', simuladoId).eq('estudante_id', meuEstudanteId).eq('is_teste', false).eq('status', 'finalizada').eq('deletado', false)
    let best: { id: string; nota: number } | null = null
    for (const s of ((data ?? []) as any[])) { const n = Number(s.nota ?? -1); if (!best || n > best.nota) best = { id: s.id, nota: n } }
    minhaNota = best ? best.nota : null
    if (best) { const { data: rr } = await svc.from('simulado_respostas_objetivas').select('correta').eq('sessao_id', best.id); meusAcertos = ((rr ?? []) as any[]).filter((r) => r.correta).length }
  }

  const posicao = meTop?.posicao ?? (minhaNota != null ? notas.filter((n) => n > minhaNota!).length + 1 : 0)
  const percentil = minhaNota != null ? Math.max(1, Math.min(99, Math.round((notas.filter((n) => n <= minhaNota!).length / participantes) * 100))) : 0
  const histograma = binsQtd.map((qtd, i) => ({
    faixa: `${i * 10}-${i * 10 + 10}`, qtd,
    voce: minhaNota != null && minhaNota >= i * 10 && (i === 9 ? minhaNota <= 100 : minhaNota < i * 10 + 10),
  }))
  const toPeer = (p: PeerTurma): ResRankPeer => { const eu = p.eid === meuEstudanteId; return { iniciais: eu ? 'Você' : p.iniciais, nota: p.nota, acertos: p.acertos, posicao: p.posicao, voce: eu, avatar: eu ? meuAvatar : p.capi, avatarCor: eu ? meuAvatarCor : p.capiCor } }
  const top = turma.top.map(toPeer)
  const podio = turma.podio.map(toPeer)
  const voce: ResRankPeer = { iniciais: 'Você', nota: minhaNota ?? 0, acertos: meusAcertos, posicao, voce: true, avatar: meuAvatar, avatarCor: meuAvatarCor }

  return { participantes, posicao, percentil, mediaTurma, mediaMarcador: mediaTurma, histograma, top, voce, podio }
}
