import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

/**
 * Relatório por aluno vinculado ao banco: desempenho nas questões do banco
 * (acertos/erros/em branco/nota), se finalizou (respondeu todas) e acertos
 * por disciplina do bloco. Baseado nas respostas reais dos simulados.
 */
export async function BancoRelatorio({ bancoId }: { bancoId: string }) {
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  // Questões do banco + disciplina de cada uma.
  const { data: vinc } = await svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', tenantId ?? '')
  const qids = (vinc ?? []).map((v: any) => v.questao_id)
  const totalQ = qids.length

  let questoes: any[] = []
  if (qids.length) {
    const { data } = await svc.from('simulado_questoes').select('id, disciplinas:simulado_disciplinas(nome)').in('id', qids)
    questoes = data ?? []
  }
  const discDaQuestao = new Map<string, string>()
  const discTotais = new Map<string, number>()
  for (const q of questoes) {
    const d = q.disciplinas?.nome ?? 'Sem disciplina'
    discDaQuestao.set(q.id, d)
    discTotais.set(d, (discTotais.get(d) ?? 0) + 1)
  }
  const disciplinas = [...discTotais.keys()].sort()

  // Alunos vinculados.
  const { data: pe, error: peErr } = await svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', bancoId).eq('tenant_id', tenantId ?? '')
  if (peErr) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
        Recurso indisponível: rode o SQL pendente (tabela <code>simulado_pasta_estudantes</code>) no Supabase e recarregue.
      </div>
    )
  }
  const estIds = (pe ?? []).map((r: any) => r.estudante_id)
  let alunos: any[] = []
  if (estIds.length) {
    const { data } = await svc.from('simulado_estudantes').select('id, nome, email, telefone').in('id', estIds).order('nome')
    alunos = data ?? []
  }

  // Respostas dos alunos às questões do banco (via sessões).
  const respPorAluno = new Map<string, Map<string, boolean>>() // estId -> (questaoId -> acertou)
  // Data/hora em que o aluno finalizou (sessão finalizada mais recente com resposta do banco).
  const finalizadoEm = new Map<string, string>()
  if (estIds.length && qids.length) {
    const { data: sessoes } = await svc
      .from('simulado_sessoes_prova')
      .select('id, estudante_id, status, finalizado_em')
      .in('estudante_id', estIds)
      .eq('is_teste', false)
      .eq('deletado', false)
    const sessInfo = new Map<string, { estudante_id: string; status: string; finalizado_em: string | null }>(
      (sessoes ?? []).map((s: any) => [s.id, { estudante_id: s.estudante_id, status: s.status, finalizado_em: s.finalizado_em }]),
    )
    const sessIds = [...sessInfo.keys()]
    if (sessIds.length) {
      const { data: resp } = await svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta').in('sessao_id', sessIds).in('questao_id', qids)
      for (const r of resp ?? []) {
        const sess = sessInfo.get((r as any).sessao_id)
        if (!sess) continue
        const est = sess.estudante_id
        const m = respPorAluno.get(est) ?? new Map<string, boolean>()
        m.set((r as any).questao_id, (m.get((r as any).questao_id) ?? false) || (r as any).correta)
        respPorAluno.set(est, m)
        // mantém a data de finalização mais recente
        if (sess.status === 'finalizada' && sess.finalizado_em) {
          const atual = finalizadoEm.get(est)
          if (!atual || new Date(sess.finalizado_em).getTime() > new Date(atual).getTime()) finalizadoEm.set(est, sess.finalizado_em)
        }
      }
    }
  }

  const fmtData = (d?: string | null) => {
    if (!d) return null
    const dt = new Date(d)
    return `${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }

  const linhas = alunos.map((a) => {
    const m = respPorAluno.get(a.id) ?? new Map<string, boolean>()
    const respondidas = m.size
    const acertos = [...m.values()].filter(Boolean).length
    const incorretas = respondidas - acertos
    const emBranco = totalQ - respondidas
    const nota = totalQ > 0 ? Math.round((acertos / totalQ) * 10 * 10) / 10 : 0
    const finalizadoData = fmtData(finalizadoEm.get(a.id))
    // acertos por disciplina
    const porDisc = new Map<string, number>()
    for (const [qid, ok] of m) if (ok) { const d = discDaQuestao.get(qid) ?? 'Sem disciplina'; porDisc.set(d, (porDisc.get(d) ?? 0) + 1) }
    return { a, acertos, incorretas, emBranco, nota, finalizadoData, porDisc }
  })

  if (alunos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">Nenhum aluno vinculado. Vincule alunos na aba <strong>Estudantes</strong> para ver o relatório.</p>
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Nome</th>
              <th className="px-3 py-2 text-left font-medium">E-mail</th>
              <th className="px-3 py-2 text-left font-medium">Telefone</th>
              <th className="px-3 py-2 text-center font-medium">Acertos</th>
              <th className="px-3 py-2 text-center font-medium">Incorretas</th>
              <th className="px-3 py-2 text-center font-medium">Em branco</th>
              <th className="px-3 py-2 text-center font-medium">Pontuação</th>
              <th className="px-3 py-2 text-center font-medium">Finalizado</th>
              {disciplinas.map((d) => <th key={d} className="px-3 py-2 text-center font-medium whitespace-nowrap">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ a, acertos, incorretas, emBranco, nota, finalizadoData, porDisc }) => (
              <tr key={a.id} className="border-t">
                <td className="px-3 py-2 font-medium whitespace-nowrap">{a.nome}</td>
                <td className="px-3 py-2 text-muted-foreground">{a.email ?? '—'}</td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{a.telefone ?? '—'}</td>
                <td className="px-3 py-2 text-center font-medium text-green-600">{acertos}</td>
                <td className="px-3 py-2 text-center text-red-600">{incorretas}</td>
                <td className="px-3 py-2 text-center font-medium text-yellow-500">{emBranco}</td>
                <td className="px-3 py-2 text-center font-semibold">{nota.toFixed(1)}</td>
                <td className="px-3 py-2 text-center whitespace-nowrap text-sm">
                  {finalizadoData ? <span className="text-foreground">{finalizadoData}</span> : <span className="text-muted-foreground">—</span>}
                </td>
                {disciplinas.map((d) => (
                  <td key={d} className="px-3 py-2 text-center whitespace-nowrap text-muted-foreground">
                    {porDisc.get(d) ?? 0}<span className="opacity-50">/{discTotais.get(d)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
