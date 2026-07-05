// Mala direta: carrega os alunos vinculados a um banco e suas variáveis reais
// (nome, contato, desempenho e acertos por disciplina) para preencher o caderno.
// Usado pelo editor (preview por aluno) e pela impressão (?aluno / ?todos).

export type Registro = { id: string; nome: string; vars: Record<string, string>; respostas: Record<string, string> }

const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']

function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

/** `svc` = createAdminClient(); filtra por tenant manualmente.
 *  `sessaoId` (opcional): usa exatamente essa tentativa. Sem ele, usa a mais recente de cada aluno.
 *  Cada tentativa é uma sessão distinta — nunca se mistura respostas de sessões diferentes. */
export async function carregarRegistros(svc: any, tenantId: string, bancoId: string, bancoNome: string, sessaoId?: string): Promise<Registro[]> {
  // Questões do banco + disciplina de cada uma.
  const { data: vinc } = await svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', tenantId)
  const qids = (vinc ?? []).map((v: any) => v.questao_id)
  const totalQ = qids.length

  const discDaQuestao = new Map<string, string>()
  const discTotais = new Map<string, number>()
  if (qids.length) {
    const { data: qs } = await svc.from('simulado_questoes').select('id, disciplinas:simulado_disciplinas(nome)').in('id', qids)
    for (const q of qs ?? []) {
      const d = (q as any).disciplinas?.nome ?? 'Geral'
      discDaQuestao.set(q.id, d)
      discTotais.set(d, (discTotais.get(d) ?? 0) + 1)
    }
  }

  // Alunos vinculados ao banco.
  const { data: pe } = await svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', bancoId).eq('tenant_id', tenantId)
  const estIds = (pe ?? []).map((r: any) => r.estudante_id)
  if (!estIds.length) return []
  const { data: alunos } = await svc.from('simulado_estudantes').select('id, nome, email, telefone, cpf, classificacao').in('id', estIds).order('nome')

  // Letra de cada alternativa (por ordem) → fallback p/ respostas antigas sem a letra.
  const altLetra = new Map<string, string>() // alternativaId → "A"/"B"…
  const corretaLetra = new Map<string, string>() // questaoId → letra da alternativa correta
  if (qids.length) {
    const { data: alts } = await svc.from('simulado_alternativas').select('id, questao_id, ordem, correta').in('questao_id', qids)
    const porQ = new Map<string, any[]>()
    for (const a of alts ?? []) { const arr = porQ.get(a.questao_id) ?? []; arr.push(a); porQ.set(a.questao_id, arr) }
    for (const [qid, arr] of porQ) arr.sort((x, y) => x.ordem - y.ordem).forEach((a, i) => {
      altLetra.set(a.id, LETRA[i] ?? '?')
      if (a.correta) corretaLetra.set(qid, LETRA[i] ?? '?')
    })
  }

  // Respostas POR SESSÃO: cada tentativa é uma sessão distinta. Escolhemos UMA sessão
  // por aluno (a indicada em `sessaoId`, ou a mais recente) e usamos só as respostas dela —
  // assim acerto e letra marcada vêm sempre da MESMA tentativa (nunca se mistura).
  const respPorAluno = new Map<string, Map<string, boolean>>()
  const marcadaPorAluno = new Map<string, Map<string, string>>() // est → (questaoId → letra)
  const infoPorAluno = new Map<string, Record<string, string>>() // est → { data, inicio, termino, tempo_total, respondidas, em_branco }
  if (qids.length) {
    let sq = svc.from('simulado_sessoes_prova').select('id, estudante_id, iniciado_em, finalizado_em, status').in('estudante_id', estIds).eq('is_teste', false).eq('deletado', false)
    if (sessaoId) sq = sq.eq('id', sessaoId)
    const { data: sessoes } = await sq
    const allSessIds = (sessoes ?? []).map((s: any) => s.id)

    // Carrega as respostas de TODAS as sessões candidatas (pra saber quais têm respostas).
    const respPorSessao = new Map<string, any[]>()
    if (allSessIds.length) {
      const { data: resp } = await svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta, alternativa_id, snapshot_gabarito').in('sessao_id', allSessIds).in('questao_id', qids)
      for (const r of resp ?? []) { const arr = respPorSessao.get((r as any).sessao_id) ?? []; arr.push(r); respPorSessao.set((r as any).sessao_id, arr) }
    }

    // 1 sessão por aluno (a indicada, ou a "melhor"): prioriza ter RESPOSTAS, depois
    // FINALIZADA, depois a mais recente. Evita pegar uma tentativa vazia/abandonada.
    const porAluno = new Map<string, any[]>()
    for (const s of sessoes ?? []) { const arr = porAluno.get((s as any).estudante_id) ?? []; arr.push(s); porAluno.set((s as any).estudante_id, arr) }
    const score = (id: string) => { const rs = respPorSessao.get(id) ?? []; return { n: rs.length, ok: rs.filter((r: any) => r.correta).length } }
    for (const [est, lista] of porAluno) {
      // Melhor tentativa: mais respostas (mais completa) → mais acertos → finalizada → mais recente.
      lista.sort((a: any, b: any) => {
        const sa = score(a.id), sb = score(b.id)
        if (sa.n !== sb.n) return sb.n - sa.n
        if (sa.ok !== sb.ok) return sb.ok - sa.ok
        const fa = a.status === 'finalizada' ? 1 : 0, fb = b.status === 'finalizada' ? 1 : 0
        if (fa !== fb) return fb - fa
        return String(b.iniciado_em ?? '').localeCompare(String(a.iniciado_em ?? ''))
      })
      const rs = respPorSessao.get(lista[0].id) ?? []
      const m = new Map<string, boolean>()
      const mm = new Map<string, string>()
      for (const r of rs) {
        m.set((r as any).questao_id, !!(r as any).correta)
        const snap = (r as any).snapshot_gabarito
        const altId = (r as any).alternativa_id ?? snap?.alternativa_id
        const letraSnap = snap?.letra
        // ignora letra inválida ('?' de dados antigos); cai no id válido ou, se acertou, na correta.
        const letra = (letraSnap && letraSnap !== '?')
          ? letraSnap
          : (altId ? altLetra.get(altId) : undefined) ?? ((r as any).correta ? corretaLetra.get((r as any).questao_id) : undefined)
        if (letra) mm.set((r as any).questao_id, letra)
      }
      respPorAluno.set(est, m)
      marcadaPorAluno.set(est, mm)

      // Dados da sessão para o bloco Identificação (data/horários/contagens).
      const sess: any = lista[0]
      const tz = 'America/Sao_Paulo'
      const ini = sess?.iniciado_em ? new Date(sess.iniciado_em) : null
      const fim = sess?.finalizado_em ? new Date(sess.finalizado_em) : null
      const hhmm = (dt: Date | null) => (dt ? dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: tz }) : '')
      const tempoMin = ini && fim ? Math.max(0, Math.round((fim.getTime() - ini.getTime()) / 60000)) : null
      const respondidas = mm.size
      infoPorAluno.set(est, {
        data: ini ? ini.toLocaleDateString('pt-BR', { timeZone: tz }) : '',
        inicio: hhmm(ini),
        termino: hhmm(fim),
        tempo_total: tempoMin != null ? `${tempoMin}min` : '',
        respondidas: String(respondidas),
        em_branco: String(Math.max(0, totalQ - respondidas)),
      })
    }
  }

  return (alunos ?? []).map((a: any) => {
    const m = respPorAluno.get(a.id) ?? new Map<string, boolean>()
    const acertos = [...m.values()].filter(Boolean).length
    const nota = totalQ ? Math.round((acertos / totalQ) * 10 * 10) / 10 : 0
    const porDisc = new Map<string, number>()
    for (const [qid, ok] of m) if (ok) { const d = discDaQuestao.get(qid) ?? 'Geral'; porDisc.set(d, (porDisc.get(d) ?? 0) + 1) }

    const vars: Record<string, string> = {
      nome: a.nome ?? '', email: a.email ?? '', telefone: a.telefone ?? '', cpf: a.cpf ?? '', classificacao: a.classificacao ?? '',
      simulado: bancoNome, acertos: String(acertos), total_questoes: String(totalQ),
      nota: nota.toFixed(1).replace('.', ','), percentual: totalQ ? `${Math.round((acertos / totalQ) * 100)}%` : '0%',
      ...(infoPorAluno.get(a.id) ?? { data: '', inicio: '', termino: '', tempo_total: '', respondidas: '', em_branco: '' }),
    }
    for (const [d, tot] of discTotais) {
      const s = slug(d)
      vars[`acerto_${s}`] = String(porDisc.get(d) ?? 0)
      vars[`total_${s}`] = String(tot)
      vars[`pct_${s}`] = tot ? `${Math.round(((porDisc.get(d) ?? 0) / tot) * 100)}%` : '0%'
    }
    return { id: a.id, nome: a.nome ?? a.email ?? 'Aluno', vars, respostas: Object.fromEntries(marcadaPorAluno.get(a.id) ?? []) }
  })
}
