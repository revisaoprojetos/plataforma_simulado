import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { funcaoEtiquetaPorQuestao, funcaoBloqueia } from './etiqueta-funcao'
import { remember, chaveRelatorio, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'

export type Comparativo = {
  participantes: number
  notaMediaTurma: number | null
  acertoMedioTurma: number | null
  minhaPosicao: number | null
  percentil: number | null
  porDisciplina: { nome: string; minhaPct: number | null; turmaPct: number }[]
}

// Parte PESADA e IDÊNTICA para todos os alunos de um simulado (independe do aluno) → cacheável.
// Carregar as respostas de TODOS os participantes é o gargalo (ex.: 564 alunos = 50k linhas ~18s);
// como é o mesmo resultado para qualquer aluno, memoizamos por simulado.
type TurmaAgg = {
  participantes: number
  notaMediaTurma: number | null
  acertoMedioTurma: number | null
  notas: number[]                                   // notas dos representantes (1 melhor por aluno)
  discDeQ: [string, string][]                       // questao_id → disciplina (para o % do aluno)
  fora: string[]                                    // questões anuladas (fora da comparação)
  porDiscTurma: { nome: string; turmaPct: number }[]
}

async function computarTurma(svc: SupabaseClient, simuladoId: string): Promise<TurmaAgg> {
  const { data: pq } = await svc
    .from('simulado_prova_questoes')
    .select('questao_id, questoes:simulado_questoes(disciplinas:simulado_disciplinas(nome))')
    .eq('simulado_id', simuladoId).eq('anulada', false)
  // Anuladas (etiqueta anular/desconsiderar) dão ponto a todos → não diferenciam a turma: FORA da comparação.
  const funcMap = await funcaoEtiquetaPorQuestao(svc, ((pq ?? []) as any[]).map((r) => r.questao_id))
  const foraSet = new Set<string>(((pq ?? []) as any[]).filter((r) => funcaoBloqueia(funcMap.get(r.questao_id)?.funcao)).map((r) => r.questao_id))
  const validas = ((pq ?? []) as any[]).filter((r) => !foraSet.has(r.questao_id))
  const totalQ = validas.length
  const discDeQ = new Map<string, string>()
  for (const r of validas) discDeQ.set(r.questao_id, r.questoes?.disciplinas?.nome ?? 'Sem disciplina')

  // fetchAll: um simulado com >1000 sessões truncava → participantes/média da turma errados.
  const sess = await fetchAll<{ id: string; estudante_id: string; nota: number | null }>(() =>
    svc.from('simulado_sessoes_prova').select('id, estudante_id, nota').eq('simulado_id', simuladoId).eq('is_teste', false).eq('deletado', false).eq('status', 'finalizada').order('id', { ascending: true }))
  const best = new Map<string, { id: string; nota: number }>()
  for (const s of sess as any[]) {
    const n = s.nota != null ? Number(s.nota) : -1
    const cur = best.get(s.estudante_id)
    if (!cur || n > cur.nota) best.set(s.estudante_id, { id: s.id, nota: n })
  }
  const reps = [...best.values()]
  const notas = reps.map((r) => r.nota).filter((n) => n >= 0)
  const participantes = reps.length
  const notaMediaTurma = notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null

  const acPorDisc = new Map<string, { ac: number; tt: number }>()
  let totAc = 0
  const repIds = reps.map((r) => r.id)
  if (repIds.length) {
    // fetchAllByIn: respostas de TODAS as sessões da turma (participantes×questões pode passar de 1000).
    const resp = await fetchAllByIn<{ sessao_id: string; questao_id: string; correta: boolean }>(repIds, (chunk) =>
      svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta').in('sessao_id', chunk).order('id', { ascending: true }))
    for (const r of resp as any[]) {
      if (foraSet.has(r.questao_id)) continue // anulada não entra na comparação
      if (r.correta) totAc++
      const d = discDeQ.get(r.questao_id) ?? 'Sem disciplina'
      const v = acPorDisc.get(d) ?? { ac: 0, tt: 0 }; v.tt++; if (r.correta) v.ac++; acPorDisc.set(d, v)
    }
  }
  const acertoMedioTurma = participantes && totalQ ? Math.round((totAc / (participantes * totalQ)) * 100) : null
  const porDiscTurma = [...acPorDisc.entries()].map(([nome, v]) => ({ nome, turmaPct: v.tt ? Math.round((v.ac / v.tt) * 100) : 0 }))

  return { participantes, notaMediaTurma, acertoMedioTurma, notas, discDeQ: [...discDeQ.entries()], fora: [...foraSet], porDiscTurma }
}

/** Comparativo do desempenho vs. a turma (1 melhor tentativa por aluno). A parte da TURMA é cacheada
 *  por simulado (idêntica p/ todos); só o recorte do ALUNO (posição/percentil/% por disciplina) é
 *  computado a cada chamada (barato: 1 query da própria sessão). */
export async function montarComparativo(
  svc: SupabaseClient,
  simuladoId: string,
  opts: { minhaNota: number | null; minhaSessaoId: string | null },
  tenantId: string | null,
): Promise<Comparativo> {
  const turma = await remember(
    chaveRelatorio(tenantId, 'comparativo-turma', simuladoId),
    TTL_RELATORIO,
    () => computarTurma(svc, simuladoId),
  )

  const notas = turma.notas
  let minhaPosicao: number | null = null, percentil: number | null = null
  if (opts.minhaNota != null && notas.length) {
    minhaPosicao = notas.filter((n) => n > opts.minhaNota!).length + 1
    percentil = Math.round((notas.filter((n) => n <= opts.minhaNota!).length / notas.length) * 100)
  }

  const foraSet = new Set(turma.fora)
  const discDeQ = new Map(turma.discDeQ)
  const minhaDisc = new Map<string, { ac: number; tt: number }>()
  if (opts.minhaSessaoId) {
    const { data: mr } = await svc.from('simulado_respostas_objetivas').select('questao_id, correta').eq('sessao_id', opts.minhaSessaoId)
    for (const r of (mr ?? []) as any[]) { if (foraSet.has(r.questao_id)) continue; const d = discDeQ.get(r.questao_id) ?? 'Sem disciplina'; const v = minhaDisc.get(d) ?? { ac: 0, tt: 0 }; v.tt++; if (r.correta) v.ac++; minhaDisc.set(d, v) }
  }

  const porDisciplina = turma.porDiscTurma.map(({ nome, turmaPct }) => {
    const minha = minhaDisc.get(nome)
    return { nome, turmaPct, minhaPct: minha && minha.tt ? Math.round((minha.ac / minha.tt) * 100) : null }
  }).sort((a, b) => a.nome.localeCompare(b.nome))

  return {
    participantes: turma.participantes,
    notaMediaTurma: turma.notaMediaTurma,
    acertoMedioTurma: turma.acertoMedioTurma,
    minhaPosicao, percentil, porDisciplina,
  }
}
