import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { tipoDoSimulado } from '@/lib/simulado/tipo'
import type { DadosRelatorioSimulado, LinhaExportSimulado } from './relatorio-simulado-view'

const fmtDur = (min: number) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min` }
const fmtSeg = (seg: number) => { const s = Math.round(seg); const m = Math.floor(s / 60), r = s % 60; return m > 0 ? `${m}min ${String(r).padStart(2, '0')}s` : `${r}s` }
const labelClass = (c?: string | null) => (c === 'passaporte' ? 'Passaporte' : c === 'normal' ? 'Normal' : (c ?? '—'))

/** Monta o relatório completo de um simulado (KPIs, gráficos, ranking e linhas do export). */
export async function montarRelatorioSimulado(svc: SupabaseClient, simId: string, tenantId: string | null): Promise<DadosRelatorioSimulado | null> {
  const { data: alvo } = await svc.from('simulado_simulados').select('id, titulo, modo_aplicacao, regras').eq('id', simId).eq('deletado', false).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').maybeSingle()
  if (!alvo) return null

  // Questões do simulado (ordem, tipo, disciplina, enunciado).
  const { data: pq } = await svc
    .from('simulado_prova_questoes')
    .select('questao_id, ordem, questoes:simulado_questoes(id, tipo, enunciado, disciplinas:simulado_disciplinas(nome))')
    .eq('simulado_id', simId).order('ordem')
  const ordemDeQ = new Map<string, number>()
  const discDeQ = new Map<string, string>()
  const enunDeQ = new Map<string, string>()
  const tipoDeQ = new Map<string, string | null>()
  const qids: string[] = []
  const tiposQ: (string | null)[] = []
  for (const r of (pq ?? []) as any[]) {
    const qid = r.questoes?.id ?? r.questao_id
    qids.push(qid)
    ordemDeQ.set(qid, r.ordem ?? 0)
    discDeQ.set(qid, r.questoes?.disciplinas?.nome ?? 'Sem disciplina')
    enunDeQ.set(qid, String(r.questoes?.enunciado ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
    tipoDeQ.set(qid, r.questoes?.tipo ?? null)
    tiposQ.push(r.questoes?.tipo)
  }

  // Alternativas das questões (para o detalhamento por questão).
  const altPorQ = new Map<string, { id: string; texto: string; ordem: number; correta: boolean }[]>()
  if (qids.length) {
    const { data: alts } = await svc.from('simulado_alternativas').select('id, questao_id, texto, ordem, correta').in('questao_id', qids)
    for (const a of (alts ?? []) as any[]) {
      const arr = altPorQ.get(a.questao_id) ?? []
      arr.push({ id: a.id, texto: String(a.texto ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(), ordem: a.ordem ?? 0, correta: !!a.correta })
      altPorQ.set(a.questao_id, arr)
    }
    for (const arr of altPorQ.values()) arr.sort((x, y) => x.ordem - y.ordem)
  }
  // Índices para validar/mapear a alternativa escolhida (alternativas podem ter sido recriadas).
  const altSetPorQ = new Map<string, Set<string>>()
  const corretaAltPorQ = new Map<string, string>()
  for (const [qid, arr] of altPorQ) {
    altSetPorQ.set(qid, new Set(arr.map((a) => a.id)))
    const c = arr.find((a) => a.correta); if (c) corretaAltPorQ.set(qid, c.id)
  }

  // Sessões reais (não teste). fetchAll: sem paginar o PostgREST corta em 1000 e as contagens
  // (matriculados/acessaram/finalizados) saem truncadas.
  const sessoes = await fetchAll<any>(() => svc
    .from('simulado_sessoes_prova')
    .select('id, estudante_id, status, nota, tentativa_num, iniciado_em, finalizado_em')
    .eq('simulado_id', simId).eq('is_teste', false).eq('deletado', false).order('id'))
  const sess = sessoes as any[]
  const finalizadasAll = sess.filter((s) => s.status === 'finalizada')

  // Configuração de tentativas do simulado.
  const regras = ((alvo as any)?.regras ?? {}) as any
  const modo = (alvo as any)?.modo_aplicacao ?? 'aberto'
  const retentRaw = Number(regras.retentativas)
  const retentativas = Number.isFinite(retentRaw) && retentRaw > 0 ? retentRaw : 1
  const permiteVarias = modo === 'aberto' || retentativas > 1
  const politica = (regras.politica_nota ?? 'ultima') as 'ultima' | 'melhor' | 'media'

  const totalQuestoes = (pq ?? []).length
  const discOrdem = new Map<string, number>()
  for (const [qid, disc] of discDeQ) { const o = ordemDeQ.get(qid) ?? 0; if (!discOrdem.has(disc) || o < discOrdem.get(disc)!) discOrdem.set(disc, o) }
  const disciplinas = [...discOrdem.entries()].sort((a, b) => a[1] - b[1]).map(([d]) => d)

  // Respostas de TODAS as tentativas finalizadas (1º passo: contagem por sessão).
  const acPorSess = new Map<string, number>(), ttPorSess = new Map<string, number>()
  const allFinIds = finalizadasAll.map((s) => s.id)
  let respAll: any[] = []
  if (allFinIds.length) {
    // Lotes + paginação: evita URL gigante e o teto de 1000 do PostgREST
    // (simulado grande = dezenas de milhares de respostas).
    respAll = await fetchAllByIn<any>(allFinIds, (chunk) =>
      svc.from('simulado_respostas_objetivas')
        .select('sessao_id, questao_id, alternativa_id, correta, snapshot_gabarito, tempo_resposta_seg')
        .in('sessao_id', chunk)
        .order('id'))
    for (const r of respAll) {
      ttPorSess.set(r.sessao_id, (ttPorSess.get(r.sessao_id) ?? 0) + 1)
      if (r.correta) acPorSess.set(r.sessao_id, (acPorSess.get(r.sessao_id) ?? 0) + 1)
    }
  }

  // Escolhe a tentativa representativa de cada aluno: prioriza tentativas COM respostas
  // (ignora abandonadas/vazias que distorcem nota/acerto/tempo), depois aplica a política de nota.
  const tentPorAluno = new Map<string, any[]>()
  for (const s of finalizadasAll) { const arr = tentPorAluno.get(s.estudante_id) ?? []; arr.push(s); tentPorAluno.set(s.estudante_id, arr) }
  const respondeu = (s: any) => ((ttPorSess.get(s.id) ?? 0) > 0 ? 1 : 0)
  const finalizadas: any[] = []
  for (const [, arr] of tentPorAluno) {
    const ord = [...arr]
    if (politica === 'melhor') ord.sort((a, b) => respondeu(b) - respondeu(a) || Number(b.nota ?? -1) - Number(a.nota ?? -1) || new Date(b.finalizado_em ?? 0).getTime() - new Date(a.finalizado_em ?? 0).getTime())
    else ord.sort((a, b) => respondeu(b) - respondeu(a) || new Date(b.finalizado_em ?? 0).getTime() - new Date(a.finalizado_em ?? 0).getTime() || (b.tentativa_num ?? 0) - (a.tentativa_num ?? 0))
    const rep = ord[0]
    // Média: só das tentativas efetivamente realizadas (com respostas); se nenhuma teve, usa todas.
    const comResp = arr.filter((a) => respondeu(a))
    const baseMedia = comResp.length ? comResp : arr
    const notasAl = baseMedia.map((a) => a.nota).filter((n) => n != null).map(Number)
    const notaEfetiva = politica === 'media'
      ? (notasAl.length ? Math.round((notasAl.reduce((x, y) => x + y, 0) / notasAl.length) * 100) / 100 : null)
      : (rep.nota != null ? Number(rep.nota) : null)
    finalizadas.push({ ...rep, nota: notaEfetiva })
  }
  const sessIds = finalizadas.map((s) => s.id)
  const repSet = new Set(sessIds)

  // 2º passo: estatísticas por questão só das tentativas representativas.
  const acPorDisc = new Map<string, { ac: number; tt: number }>()
  const acPorQ = new Map<string, { ac: number; tt: number }>()
  const discAcPorSess = new Map<string, Record<string, number>>()
  const escolhaPorQ = new Map<string, Map<string, number>>()
  const tempoPorQ = new Map<string, { soma: number; n: number }>()
  for (const r of respAll) {
    if (!repSet.has(r.sessao_id)) continue
    if (r.tempo_resposta_seg != null && r.tempo_resposta_seg > 0) { const tp = tempoPorQ.get(r.questao_id) ?? { soma: 0, n: 0 }; tp.soma += Number(r.tempo_resposta_seg); tp.n++; tempoPorQ.set(r.questao_id, tp) }
    const disc = discDeQ.get(r.questao_id) ?? 'Sem disciplina'
    const d = acPorDisc.get(disc) ?? { ac: 0, tt: 0 }; d.tt++; if (r.correta) d.ac++; acPorDisc.set(disc, d)
    const q = acPorQ.get(r.questao_id) ?? { ac: 0, tt: 0 }; q.tt++; if (r.correta) q.ac++; acPorQ.set(r.questao_id, q)
    if (r.correta) { const g = discAcPorSess.get(r.sessao_id) ?? {}; g[disc] = (g[disc] ?? 0) + 1; discAcPorSess.set(r.sessao_id, g) }
    let escolhida: string | null = r.alternativa_id ?? r.snapshot_gabarito?.alternativa_id ?? null
    const setQ = altSetPorQ.get(r.questao_id)
    if (escolhida && setQ && !setQ.has(escolhida)) escolhida = r.correta ? (corretaAltPorQ.get(r.questao_id) ?? null) : null
    if (escolhida) { let m = escolhaPorQ.get(r.questao_id); if (!m) { m = new Map(); escolhaPorQ.set(r.questao_id, m) } m.set(escolhida, (m.get(escolhida) ?? 0) + 1) }
  }

  // Estudantes: nome, e-mail, telefone e classificação.
  const estIds = [...new Set(sess.map((s) => s.estudante_id).filter(Boolean))]
  const infoEst = new Map<string, { nome: string; email: string | null; telefone: string | null; classificacao: string | null }>()
  if (estIds.length) {
    const ests = await fetchAllByIn<any>(estIds, (chunk) => svc.from('simulado_estudantes').select('id, nome, email, telefone, classificacao').in('id', chunk))
    for (const e of ests) infoEst.set(e.id, { nome: e.nome ?? 'Estudante', email: e.email ?? null, telefone: e.telefone ?? null, classificacao: e.classificacao ?? null })
  }

  // Config + levantamento de tentativas (para simulados que permitem várias).
  const politicaLabel = politica === 'melhor' ? 'Melhor nota' : politica === 'media' ? 'Média das tentativas' : 'Última tentativa'
  const modoLabel = modo === 'aberto' ? 'Aberto — liberado, várias tentativas' : modo === 'janela_fixa' ? 'Janela fixa' : 'Prazo relativo'
  const config = {
    modo, modoLabel, permiteVarias,
    tentativasPermitidas: modo === 'aberto' ? 'Ilimitado' : String(retentativas),
    politica, politicaLabel,
  }
  const tentativasResumo = {
    totalTentativas: finalizadasAll.length,
    mediaPorAluno: tentPorAluno.size ? Math.round((finalizadasAll.length / tentPorAluno.size) * 10) / 10 : 0,
    alunosComMaisDeUma: [...tentPorAluno.values()].filter((a) => a.length > 1).length,
  }
  const porAlunoTentativas = permiteVarias
    ? [...tentPorAluno.entries()].map(([estId, arr]) => {
      const cron = [...arr].sort((a, b) => new Date(a.finalizado_em ?? 0).getTime() - new Date(b.finalizado_em ?? 0).getTime())
      const primeira = cron[0]?.nota != null ? Number(cron[0].nota) : null
      const rep = finalizadas.find((f) => f.estudante_id === estId)
      const considerada = rep?.nota != null ? Number(rep.nota) : null
      return {
        nome: infoEst.get(estId)?.nome ?? 'Estudante',
        tentativas: arr.length,
        primeiraNota: primeira,
        notaConsiderada: considerada,
        delta: primeira != null && considerada != null ? Math.round((considerada - primeira) * 10) / 10 : null,
      }
    }).sort((a, b) => b.tentativas - a.tentativas || (b.notaConsiderada ?? -1) - (a.notaConsiderada ?? -1))
    : []

  // Total de estudantes matriculados no simulado: toda matrícula (liberada ou bloqueada) + acesso avulso + quem já tem sessão.
  const atribuidosSet = new Set<string>(sess.map((s) => s.estudante_id).filter(Boolean))
  const mats = await fetchAll<any>(() => svc.from('simulado_matriculas').select('estudante_id').eq('simulado_id', simId).order('estudante_id'))
  for (const m of mats) if (m.estudante_id) atribuidosSet.add(m.estudante_id)
  const acs = await fetchAll<any>(() => svc.from('simulado_acessos').select('estudante_id').eq('simulado_id', simId).order('estudante_id'))
  for (const a of acs) if (a.estudante_id) atribuidosSet.add(a.estudante_id)

  // Engajamento: acessos e uso de relatório por aluno (distintos).
  const acessaramSet = new Set(sess.filter((s) => s.iniciado_em).map((s) => s.estudante_id).filter(Boolean))
  const finalizaramSet = new Set(finalizadas.map((s) => s.estudante_id).filter(Boolean))
  const visSet = new Set<string>(), baixSet = new Set<string>()
  const { data: eventos } = await svc.from('simulado_relatorio_eventos').select('estudante_id, tipo').eq('simulado_id', simId).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
  for (const ev of (eventos ?? []) as any[]) {
    if (!ev.estudante_id) continue
    if (ev.tipo === 'visualizou') visSet.add(ev.estudante_id)
    else if (ev.tipo === 'baixou') baixSet.add(ev.estudante_id)
  }
  const engajamento = {
    atribuidos: atribuidosSet.size,
    acessaram: acessaramSet.size,
    finalizaram: finalizaramSet.size,
    visualizaramRelatorio: visSet.size,
    baixaramRelatorio: baixSet.size,
  }

  // Métricas.
  const notas = finalizadas.map((s) => (s.nota != null ? Number(s.nota) : null)).filter((n): n is number => n != null)
  const notaMedia = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null
  const melhorNota = notas.length ? Math.max(...notas) : null
  // Acerto médio sobre o TOTAL de questões (coerente com a nota; questões em branco contam como erro).
  let totAc = 0
  for (const s of finalizadas) totAc += acPorSess.get(s.id) ?? 0
  const acertoMedio = finalizadas.length && totalQuestoes ? Math.round((totAc / (finalizadas.length * totalQuestoes)) * 100) : null
  const temposMin = finalizadas.filter((s) => s.iniciado_em && s.finalizado_em)
    .map((s) => (new Date(s.finalizado_em).getTime() - new Date(s.iniciado_em).getTime()) / 60000).filter((m) => m >= 0)
  const tempoMedioMin = temposMin.length ? Math.round(temposMin.reduce((a, b) => a + b, 0) / temposMin.length) : null

  // Comparativo por classificação (passaporte × normal).
  const clsAgg = new Map<string, { n: number; notas: number[]; ac: number; tt: number }>()
  for (const s of finalizadas) {
    const cls = infoEst.get(s.estudante_id)?.classificacao ?? 'outro'
    const g = clsAgg.get(cls) ?? { n: 0, notas: [], ac: 0, tt: 0 }
    g.n++
    if (s.nota != null) g.notas.push(Number(s.nota))
    g.ac += acPorSess.get(s.id) ?? 0; g.tt += ttPorSess.get(s.id) ?? 0
    clsAgg.set(cls, g)
  }
  const ordemCls: Record<string, number> = { passaporte: 0, normal: 1, outro: 2 }
  const labelCls = (c: string) => (c === 'passaporte' ? 'Passaporte' : c === 'normal' ? 'Normal' : 'Outros')
  const porClassificacao = [...clsAgg.entries()].map(([chave, g]) => ({
    chave, label: labelCls(chave), alunos: g.n,
    notaMedia: g.notas.length ? Math.round((g.notas.reduce((a, b) => a + b, 0) / g.notas.length) * 10) / 10 : null,
    acertoMedio: g.tt ? Math.round((g.ac / g.tt) * 100) : null,
  })).sort((a, b) => (ordemCls[a.chave] ?? 9) - (ordemCls[b.chave] ?? 9))

  // Dispersão da turma (mediana, desvio-padrão, mín/máx).
  const notasOrd = [...notas].sort((a, b) => a - b)
  const mediana = notasOrd.length ? (notasOrd.length % 2 ? notasOrd[(notasOrd.length - 1) / 2] : (notasOrd[notasOrd.length / 2 - 1] + notasOrd[notasOrd.length / 2]) / 2) : null
  const desvio = notas.length && notaMedia != null ? Math.sqrt(notas.reduce((s, n) => s + (n - notaMedia) ** 2, 0) / notas.length) : null
  const dispersao = {
    mediana: mediana != null ? Math.round(mediana * 10) / 10 : null,
    desvio: desvio != null ? Math.round(desvio * 10) / 10 : null,
    min: notasOrd.length ? Math.round(notasOrd[0] * 10) / 10 : null,
    max: notasOrd.length ? Math.round(notasOrd[notasOrd.length - 1] * 10) / 10 : null,
  }

  // Histograma de acertos (nº de questões corretas por aluno finalizado).
  const acertosFin = finalizadas.map((s) => acPorSess.get(s.id) ?? 0)
  let histogramaAcertos: { rotulo: string; alunos: number }[] = []
  if (totalQuestoes > 0) {
    if (totalQuestoes <= 15) {
      histogramaAcertos = Array.from({ length: totalQuestoes + 1 }, (_, k) => ({ rotulo: String(k), alunos: acertosFin.filter((a) => a === k).length }))
    } else {
      const passo = Math.ceil((totalQuestoes + 1) / 10)
      for (let lo = 0; lo <= totalQuestoes; lo += passo) {
        const hi = Math.min(totalQuestoes, lo + passo - 1)
        histogramaAcertos.push({ rotulo: lo === hi ? String(lo) : `${lo}–${hi}`, alunos: acertosFin.filter((a) => a >= lo && a <= hi).length })
      }
    }
  }

  const porDisciplina = [...acPorDisc.entries()].map(([nome, v]) => ({ nome, ac: v.ac, tt: v.tt, pct: v.tt ? Math.round((v.ac / v.tt) * 100) : 0 })).sort((a, b) => b.pct - a.pct)
  // Ordem da prova (Q1 → última) — sequência linear das questões no gráfico.
  const porQuestao = [...acPorQ.entries()]
    .map(([qid, v]) => ({ ord: ordemDeQ.get(qid) ?? 0, rotulo: `Q${(ordemDeQ.get(qid) ?? 0) + 1}`, ac: v.ac, tt: v.tt, pct: v.tt ? Math.round((v.ac / v.tt) * 100) : 0 }))
    .sort((a, b) => a.ord - b.ord)
    .slice(0, 60)
    .map(({ ord, ...r }) => r)

  // Detalhamento por questão (todas, na ordem da prova) — para a mentoria dos professores.
  const questoes = qids.map((qid) => {
    const v = acPorQ.get(qid) ?? { ac: 0, tt: 0 }
    const escolhas = escolhaPorQ.get(qid) ?? new Map<string, number>()
    const alts = altPorQ.get(qid) ?? []
    const tp = tempoPorQ.get(qid)
    return {
      ordem: (ordemDeQ.get(qid) ?? 0) + 1,
      disciplina: discDeQ.get(qid) ?? 'Sem disciplina',
      tipo: tipoDeQ.get(qid) ?? null,
      enunciado: enunDeQ.get(qid) ?? '',
      respondida: v.tt,
      acertos: v.ac,
      erros: Math.max(0, v.tt - v.ac),
      pct: v.tt ? Math.round((v.ac / v.tt) * 100) : 0,
      tempoMedioSeg: tp && tp.n ? Math.round(tp.soma / tp.n) : null,
      alternativas: alts.map((a) => ({
        texto: a.texto,
        correta: a.correta,
        escolhas: escolhas.get(a.id) ?? 0,
        pctEscolha: v.tt ? Math.round(((escolhas.get(a.id) ?? 0) / v.tt) * 100) : 0,
      })),
    }
  }).sort((a, b) => a.ordem - b.ordem)

  const faixas = [[0, 2], [2, 4], [4, 6], [6, 8], [8, 10.0001]]
  const distribuicao = faixas.map(([lo, hi]) => ({ faixa: `${lo}–${hi === 10.0001 ? 10 : hi}`, alunos: notas.filter((n) => n >= lo && n < hi).length }))

  // Linhas por estudante (ordenadas por classificação).
  const finRows = finalizadas.map((s) => {
    const ac = acPorSess.get(s.id) ?? 0, tt = ttPorSess.get(s.id) ?? 0
    const tempoSeg = s.iniciado_em && s.finalizado_em ? Math.max(0, (new Date(s.finalizado_em).getTime() - new Date(s.iniciado_em).getTime()) / 1000) : null
    return { estId: s.estudante_id as string, sessId: s.id as string, info: infoEst.get(s.estudante_id), nota: s.nota != null ? Number(s.nota) : null, ac, tt, tempoSeg }
  }).sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1) || (b.tt ? b.ac / b.tt : 0) - (a.tt ? a.ac / a.tt : 0))

  const ranking = finRows.map((r, i) => ({
    pos: i + 1, nome: r.info?.nome ?? 'Estudante', nota: r.nota,
    acerto: r.tt ? Math.round((r.ac / r.tt) * 100) : 0, tempo: r.tempoSeg != null ? fmtDur(r.tempoSeg / 60) : '—',
  }))

  const linhas: LinhaExportSimulado[] = finRows.map((r, i) => {
    const respondidas = r.tt, acertos = r.ac
    const disc = discAcPorSess.get(r.sessId) ?? {}
    return {
      posicao: i + 1,
      nome: r.info?.nome ?? 'Estudante',
      email: r.info?.email ?? '',
      telefone: r.info?.telefone ?? '',
      classificacao: labelClass(r.info?.classificacao),
      pontuacao: r.nota,
      acertos,
      erros: Math.max(0, respondidas - acertos),
      emBranco: Math.max(0, totalQuestoes - respondidas),
      media: respondidas ? Math.round((acertos / respondidas) * 100) : 0,
      tempoTotal: r.tempoSeg != null ? fmtDur(r.tempoSeg / 60) : '—',
      mediaTempo: r.tempoSeg != null && totalQuestoes ? fmtSeg(r.tempoSeg / totalQuestoes) : '—',
      porDisciplina: disciplinas.map((d) => disc[d] ?? 0),
    }
  })

  return {
    titulo: (alvo as any)?.titulo ?? 'Simulado', tipo: tipoDoSimulado(tiposQ),
    totalSessoes: atribuidosSet.size, finalizadas: finalizadas.length, notaMedia, melhorNota, acertoMedio, tempoMedioMin,
    porDisciplina, porQuestao, distribuicao, ranking, disciplinas, linhas, questoes, engajamento,
    porClassificacao, dispersao, histogramaAcertos, config, tentativasResumo, porAlunoTentativas,
  }
}
