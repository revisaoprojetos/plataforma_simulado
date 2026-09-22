import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { getGamConfig } from '@/lib/gamificacao'
import { normalizarPontuacaoLeitura } from '@/lib/leitura/pontuacao'

/**
 * Relatório completo de um módulo do Desafio de Lei Seca: adesão (total + por dia), sequências
 * (distribuição/maiores), pontuação (maiores), estatísticas por aula e o detalhe por aluno×aula com os
 * horários de leitura e quiz. Base do dashboard admin + da exportação Excel. Egress: fetchAllByIn sempre.
 */
export interface RelatorioPorDia { dia: string; alunos: number; aulas: number }
export interface RelatorioPorAula { docId: string; titulo: string; ordem: number; concluiram: number; leituraMediaSeg: number; quizMediaSeg: number }
export interface RelatorioTop { estudanteId: string; nome: string; email: string | null; valor: number }
export interface RelatorioDetalhe {
  estudanteId: string; nome: string; email: string | null
  docId: string; aula: string; ordem: number
  leituraInicio: string | null; leituraFim: string | null; leituraSeg: number
  quizInicio: string | null; quizFim: string | null; quizSeg: number
  acertos: number; total: number; pontos: number
}
export interface RelatorioModulo {
  moduloNome: string
  totalAlunos: number
  totalAulas: number
  aulasConcluidasTotal: number
  mediaAulasPorAluno: number
  porDia: RelatorioPorDia[]
  seqMedia: number; seqMaior: number; seqDistribuicao: { seq: number; alunos: number }[]; topSequencia: RelatorioTop[]
  pontosMedia: number; pontosMaior: number; pontosTotal: number; topPontos: RelatorioTop[]
  porAula: RelatorioPorAula[]
}

const NADA = '00000000-0000-0000-0000-000000000000'

/** Carrega o material bruto do módulo (aulas, quiz, respostas, progresso, XP, alunos). */
async function carregarBase(moduloId: string, tenantId: string) {
  const svc = createAdminClient()
  const geral = moduloId === '__geral__'
  let dq = svc.from('simulado_documentos').select('id, titulo, ordem').eq('tenant_id', tenantId).eq('deletado', false).eq('publicado', true)
  dq = geral ? dq.is('pasta_id', null) : dq.eq('pasta_id', moduloId)
  const { data: docs } = await dq.order('ordem', { ascending: true })
  const docList = (docs ?? []) as { id: string; titulo: string; ordem: number }[]
  const docIds = docList.map((d) => d.id)
  let moduloNome = 'Módulo'
  if (!geral) { try { const { data } = await svc.from('simulado_pastas').select('nome').eq('id', moduloId).eq('tenant_id', tenantId).maybeSingle(); moduloNome = (data as any)?.nome ?? 'Módulo' } catch { /* ignore */ } }

  if (!docIds.length) return { svc, moduloNome, docList, docIds, quizPorDoc: new Map<string, Set<string>>(), resp: [], prog: [], xp: [], pontuacao: normalizarPontuacaoLeitura(null), tz: 'America/Sao_Paulo' }

  let tz = 'America/Sao_Paulo'; let pontuacaoRaw: unknown = null
  try { const cfg = await getGamConfig(svc, tenantId); tz = cfg?.timezone || tz } catch { /* ignore */ }
  if (!geral) { try { const { data } = await svc.from('simulado_pastas').select('pontuacao').eq('id', moduloId).eq('tenant_id', tenantId).maybeSingle(); pontuacaoRaw = (data as any)?.pontuacao ?? null } catch { /* ignore */ } }
  const pontuacao = normalizarPontuacaoLeitura(pontuacaoRaw)

  const [quiz, resp, prog, xp] = await Promise.all([
    fetchAllByIn<{ documento_id: string; questao_id: string }>(docIds, (chunk) =>
      svc.from('simulado_documento_quiz_questoes').select('documento_id, questao_id').eq('tenant_id', tenantId).eq('deletado', false).in('documento_id', chunk)).catch(() => []),
    fetchAllByIn<{ estudante_id: string; documento_id: string; questao_id: string; correta: boolean; respondido_em: string | null }>(docIds, (chunk) =>
      svc.from('simulado_leitura_respostas').select('estudante_id, documento_id, questao_id, correta, respondido_em').eq('tenant_id', tenantId).in('documento_id', chunk)),
    fetchAllByIn<{ estudante_id: string; documento_id: string; iniciado_em: string | null; concluido_em: string | null; tempo_seg: number | null }>(docIds, (chunk) =>
      svc.from('simulado_leitura_progresso').select('estudante_id, documento_id, iniciado_em, concluido_em, tempo_seg').eq('tenant_id', tenantId).in('documento_id', chunk)).catch(() => []),
    fetchAllByIn<{ estudante_id: string; ref_id: string; xp: number }>([...docIds, ...docIds.map((id) => `quiz:${id}`)], (chunk) =>
      svc.from('simulado_xp_eventos').select('estudante_id, ref_id, xp').eq('tenant_id', tenantId).eq('origem', 'leitura').in('ref_id', chunk)).catch(() => []),
  ])
  const quizPorDoc = new Map<string, Set<string>>()
  for (const q of quiz) (quizPorDoc.get(q.documento_id) ?? quizPorDoc.set(q.documento_id, new Set()).get(q.documento_id)!).add(q.questao_id)
  return { svc, moduloNome, docList, docIds, quizPorDoc, resp, prog, xp, pontuacao, tz }
}

const diaEm = (iso: string, tz: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz })
const seg = (a: string | null, b: string | null) => (a && b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000)) : 0)

/** Agrega por (aluno, doc): conclusão do quiz + horários (leitura via progresso, quiz via respondido_em). */
function agregar(base: Awaited<ReturnType<typeof carregarBase>>) {
  const { docList, quizPorDoc, resp, prog, xp, tz } = base
  const tituloDe = new Map(docList.map((d) => [d.id, d.titulo]))
  const ordemDe = new Map(docList.map((d) => [d.id, d.ordem]))
  const progDe = new Map<string, { inicio: string | null; fim: string | null; seg: number }>()
  for (const p of prog) progDe.set(`${p.estudante_id}|${p.documento_id}`, { inicio: p.iniciado_em, fim: p.concluido_em, seg: p.tempo_seg ?? seg(p.iniciado_em, p.concluido_em) })
  const xpDe = new Map<string, number>()
  for (const e of xp) { const k = `${e.estudante_id}|${String(e.ref_id).replace(/^quiz:/, '')}`; xpDe.set(k, (xpDe.get(k) ?? 0) + (e.xp || 0)) }

  // (aluno, doc) → respostas do quiz do módulo
  type Cell = { answered: Set<string>; correct: number; primeira: string | null; ultima: string | null }
  const cells = new Map<string, Cell>()
  for (const r of resp) {
    const qs = quizPorDoc.get(r.documento_id); if (!qs || !qs.has(r.questao_id)) continue
    const k = `${r.estudante_id}|${r.documento_id}`
    const c = cells.get(k) ?? { answered: new Set(), correct: 0, primeira: null, ultima: null }
    c.answered.add(r.questao_id); if (r.correta) c.correct++
    if (r.respondido_em) { if (!c.primeira || r.respondido_em < c.primeira) c.primeira = r.respondido_em; if (!c.ultima || r.respondido_em > c.ultima) c.ultima = r.respondido_em }
    cells.set(k, c)
  }

  const detalhes: RelatorioDetalhe[] = []
  const diasPorAluno = new Map<string, Set<string>>()      // sequência = dias com aula completa
  const aulasPorAluno = new Map<string, number>()
  const pontosPorAluno = new Map<string, number>()
  const porAulaAgg = new Map<string, { concluiram: number; leituraSeg: number[]; quizSeg: number[] }>()
  const diaAgg = new Map<string, { alunos: Set<string>; aulas: number }>()

  for (const [k, c] of cells) {
    const [estudanteId, docId] = k.split('|')
    const qs = quizPorDoc.get(docId)!
    const feita = qs.size > 0 && [...qs].every((qid) => c.answered.has(qid))
    if (!feita) continue
    const prg = progDe.get(k)
    const pontos = xpDe.get(k) ?? 0
    detalhes.push({
      estudanteId, nome: '', email: null, docId, aula: tituloDe.get(docId) ?? 'Aula', ordem: ordemDe.get(docId) ?? 0,
      leituraInicio: prg?.inicio ?? null, leituraFim: prg?.fim ?? null, leituraSeg: prg?.seg ?? 0,
      quizInicio: c.primeira, quizFim: c.ultima, quizSeg: seg(c.primeira, c.ultima),
      acertos: c.correct, total: qs.size, pontos,
    })
    aulasPorAluno.set(estudanteId, (aulasPorAluno.get(estudanteId) ?? 0) + 1)
    pontosPorAluno.set(estudanteId, (pontosPorAluno.get(estudanteId) ?? 0) + pontos)
    const diaConc = c.ultima ? diaEm(c.ultima, tz) : null
    if (diaConc) {
      ;(diasPorAluno.get(estudanteId) ?? diasPorAluno.set(estudanteId, new Set()).get(estudanteId)!).add(diaConc)
      const da = diaAgg.get(diaConc) ?? { alunos: new Set<string>(), aulas: 0 }; da.alunos.add(estudanteId); da.aulas++; diaAgg.set(diaConc, da)
    }
    const pa = porAulaAgg.get(docId) ?? { concluiram: 0, leituraSeg: [], quizSeg: [] }
    pa.concluiram++; if (prg?.seg) pa.leituraSeg.push(prg.seg); const qseg = seg(c.primeira, c.ultima); if (qseg) pa.quizSeg.push(qseg); porAulaAgg.set(docId, pa)
  }

  // Sequência (maior corrida de dias consecutivos) + atual por aluno.
  const seqMaiorPorAluno = new Map<string, number>()
  for (const [est, diasSet] of diasPorAluno) {
    const dias = [...diasSet].sort(); let run = 0, melhor = 0, prev = ''
    for (const d of dias) { run = prev && Date.parse(d + 'T00:00:00Z') - Date.parse(prev + 'T00:00:00Z') === 86_400_000 ? run + 1 : 1; if (run > melhor) melhor = run; prev = d }
    seqMaiorPorAluno.set(est, melhor)
  }
  return { detalhes, aulasPorAluno, pontosPorAluno, seqMaiorPorAluno, porAulaAgg, diaAgg, base }
}

const media = (arr: number[]) => (arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : 0)

/** Dashboard (agregados) do módulo — sem o detalhe por aluno×aula (esse vai no Excel). */
export async function carregarRelatorioModulo(moduloId: string, tenantId: string): Promise<RelatorioModulo> {
  const base = await carregarBase(moduloId, tenantId)
  const ag = agregar(base)
  const alunosIds = [...ag.aulasPorAluno.keys()]
  const nomes = alunosIds.length
    ? new Map((await fetchAllByIn<{ id: string; nome: string; email: string | null }>(alunosIds, (chunk) => base.svc.from('simulado_estudantes').select('id, nome, email').in('id', chunk).eq('tenant_id', tenantId))).map((e) => [e.id, e]))
    : new Map<string, { id: string; nome: string; email: string | null }>()
  const nomeDe = (id: string) => nomes.get(id)?.nome ?? 'Aluno'
  const emailDe = (id: string) => nomes.get(id)?.email ?? null

  const totalAlunos = alunosIds.length
  const aulasConcluidasTotal = [...ag.aulasPorAluno.values()].reduce((s, x) => s + x, 0)
  const porDia: RelatorioPorDia[] = [...ag.diaAgg.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dia, v]) => ({ dia, alunos: v.alunos.size, aulas: v.aulas }))

  const seqs = [...ag.seqMaiorPorAluno.values()]
  const seqMedia = seqs.length ? Math.round((seqs.reduce((s, x) => s + x, 0) / seqs.length) * 10) / 10 : 0
  const seqMaior = seqs.length ? Math.max(...seqs) : 0
  const distMap = new Map<number, number>(); for (const s of seqs) distMap.set(s, (distMap.get(s) ?? 0) + 1)
  const seqDistribuicao = [...distMap.entries()].sort((a, b) => a[0] - b[0]).map(([s, n]) => ({ seq: s, alunos: n }))
  const topSequencia: RelatorioTop[] = [...ag.seqMaiorPorAluno.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, v]) => ({ estudanteId: id, nome: nomeDe(id), email: emailDe(id), valor: v }))

  const pts = [...ag.pontosPorAluno.values()]
  const pontosTotal = pts.reduce((s, x) => s + x, 0)
  const pontosMedia = pts.length ? Math.round(pontosTotal / pts.length) : 0
  const pontosMaior = pts.length ? Math.max(...pts) : 0
  const topPontos: RelatorioTop[] = [...ag.pontosPorAluno.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, v]) => ({ estudanteId: id, nome: nomeDe(id), email: emailDe(id), valor: v }))

  const porAula: RelatorioPorAula[] = base.docList.map((d) => { const pa = ag.porAulaAgg.get(d.id); return { docId: d.id, titulo: d.titulo, ordem: d.ordem, concluiram: pa?.concluiram ?? 0, leituraMediaSeg: media(pa?.leituraSeg ?? []), quizMediaSeg: media(pa?.quizSeg ?? []) } })

  return {
    moduloNome: base.moduloNome, totalAlunos, totalAulas: base.docList.length, aulasConcluidasTotal,
    mediaAulasPorAluno: totalAlunos ? Math.round((aulasConcluidasTotal / totalAlunos) * 10) / 10 : 0,
    porDia, seqMedia, seqMaior, seqDistribuicao, topSequencia,
    pontosMedia, pontosMaior, pontosTotal, topPontos, porAula,
  }
}

/** Detalhe por aluno×aula (para a aba "Detalhado" do Excel) — com nomes preenchidos. */
export async function carregarRelatorioDetalhado(moduloId: string, tenantId: string): Promise<{ moduloNome: string; detalhes: RelatorioDetalhe[] }> {
  const base = await carregarBase(moduloId, tenantId)
  const ag = agregar(base)
  const ids = [...new Set(ag.detalhes.map((d) => d.estudanteId))]
  const nomes = ids.length
    ? new Map((await fetchAllByIn<{ id: string; nome: string; email: string | null }>(ids, (chunk) => base.svc.from('simulado_estudantes').select('id, nome, email').in('id', chunk).eq('tenant_id', tenantId))).map((e) => [e.id, e]))
    : new Map<string, { id: string; nome: string; email: string | null }>()
  const detalhes = ag.detalhes
    .map((d) => ({ ...d, nome: nomes.get(d.estudanteId)?.nome ?? 'Aluno', email: nomes.get(d.estudanteId)?.email ?? null }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.ordem - b.ordem)
  return { moduloNome: base.moduloNome, detalhes }
}
