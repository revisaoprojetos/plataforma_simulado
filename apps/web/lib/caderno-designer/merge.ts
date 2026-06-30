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
  if (qids.length) {
    let sq = svc.from('simulado_sessoes_prova').select('id, estudante_id, iniciado_em').in('estudante_id', estIds).eq('is_teste', false).eq('deletado', false)
    if (sessaoId) sq = sq.eq('id', sessaoId)
    const { data: sessoes } = await sq
    // 1 sessão por aluno: a indicada, ou a mais recente (maior iniciado_em).
    const sessaoDoAluno = new Map<string, { id: string; quando: string }>()
    for (const s of sessoes ?? []) {
      const est = (s as any).estudante_id
      const quando = String((s as any).iniciado_em ?? '')
      const atual = sessaoDoAluno.get(est)
      if (!atual || quando > atual.quando) sessaoDoAluno.set(est, { id: (s as any).id, quando })
    }
    const sessEst = new Map<string, string>([...sessaoDoAluno.entries()].map(([est, s]) => [s.id, est]))
    const sessIds = [...sessEst.keys()]
    if (sessIds.length) {
      const { data: resp } = await svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta, alternativa_id, snapshot_gabarito').in('sessao_id', sessIds).in('questao_id', qids)
      for (const r of resp ?? []) {
        const est = sessEst.get((r as any).sessao_id); if (!est) continue
        const m = respPorAluno.get(est) ?? new Map<string, boolean>()
        m.set((r as any).questao_id, !!(r as any).correta) // uma sessão → valor direto, sem OR.
        respPorAluno.set(est, m)
        // Letra marcada: usa o valor JÁ ARMAZENADO (snapshot_gabarito.letra); só
        // recai no mapeamento por id para respostas antigas sem a letra gravada.
        const snap = (r as any).snapshot_gabarito
        const altId = (r as any).alternativa_id ?? snap?.alternativa_id
        // 1) letra gravada → 2) mapeia o id válido → 3) se acertou, a marcada é a correta.
        const letra = snap?.letra ?? (altId ? altLetra.get(altId) : undefined) ?? ((r as any).correta ? corretaLetra.get((r as any).questao_id) : undefined)
        if (letra) {
          const mm = marcadaPorAluno.get(est) ?? new Map<string, string>()
          mm.set((r as any).questao_id, letra)
          marcadaPorAluno.set(est, mm)
        }
      }
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
