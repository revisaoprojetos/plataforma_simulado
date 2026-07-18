import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { getCurrentTenantId } from '@/lib/tenant'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { BarChart3, Users } from 'lucide-react'

/**
 * Relatório por aluno vinculado ao banco: desempenho nas questões do banco
 * (acertos/erros/em branco/nota), se finalizou (respondeu todas) e acertos
 * por disciplina do bloco. Baseado nas respostas reais dos simulados.
 */
export async function BancoRelatorio({ bancoId, cor = '#6d28d9' }: { bancoId: string; cor?: string }) {
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  // Questões do banco + disciplina de cada uma.
  const { data: vinc } = await svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
  const qids = (vinc ?? []).map((v: any) => v.questao_id)
  const totalQ = qids.length

  let questoes: any[] = []
  if (qids.length) {
    questoes = await fetchAllByIn<any>(qids, (chunk) =>
      svc.from('simulado_questoes').select('id, disciplinas:simulado_disciplinas(nome)').in('id', chunk))
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
  const { data: pe, error: peErr } = await svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', bancoId).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
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
    // fetchAllByIn: estIds pode ter centenas/milhares → `.in()` estoura a URL (400) e o relatório
    // vinha VAZIO ("nenhum aluno vinculado") mesmo com alunos vinculados.
    alunos = await fetchAllByIn<any>(estIds, (chunk) =>
      svc.from('simulado_estudantes').select('id, nome, email, telefone').in('id', chunk))
    alunos.sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'))
  }

  // Respostas dos alunos às questões do banco (via sessões).
  const respPorAluno = new Map<string, Map<string, boolean>>() // estId -> (questaoId -> acertou)
  // Data/hora em que o aluno finalizou (sessão finalizada mais recente com resposta do banco).
  const finalizadoEm = new Map<string, string>()
  if (estIds.length && qids.length) {
    // Paginado por chunks de ids (fetchAllByIn) — sessões e respostas podem ter centenas/milhares.
    const sessoes = await fetchAllByIn<any>(estIds, (chunk) => svc
      .from('simulado_sessoes_prova')
      .select('id, estudante_id, status, finalizado_em')
      .in('estudante_id', chunk)
      .eq('is_teste', false)
      .eq('deletado', false))
    const sessInfo = new Map<string, { estudante_id: string; status: string; finalizado_em: string | null }>(
      sessoes.map((s: any) => [s.id, { estudante_id: s.estudante_id, status: s.status, finalizado_em: s.finalizado_em }]),
    )
    const sessIds = [...sessInfo.keys()]
    if (sessIds.length) {
      const resp = await fetchAllByIn<any>(sessIds, (chunk) =>
        svc.from('simulado_respostas_objetivas').select('sessao_id, questao_id, correta').in('sessao_id', chunk).in('questao_id', qids), { chunk: 50 })
      for (const r of resp) {
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
    const nota = totalQ > 0 ? Math.round((acertos / totalQ) * 100 * 10) / 10 : 0 // escala 0–100
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

  const mediaGeral = linhas.length ? linhas.reduce((s, l) => s + l.nota, 0) / linhas.length : 0
  const tone = (n: number) => (n >= 70 ? 'text-emerald-600 dark:text-emerald-400' : n >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')
  const pill = 'inline-flex min-w-7 justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold'

  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
      {/* Cabeçalho + resumo */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5" style={{ background: `linear-gradient(90deg, ${cor}1f, transparent 55%)` }}>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: cor }}><BarChart3 className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-semibold leading-tight">Desempenho por aluno</h3>
            <p className="text-xs text-muted-foreground">Acertos, erros e nota nas questões do banco</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground"><Users className="h-3 w-3" /> {alunos.length} aluno(s)</span>
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">Média <span className={tone(mediaGeral)}>{mediaGeral.toFixed(1)}</span></span>
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">{totalQ} questões</span>
        </div>
      </div>

      <CardContent className="max-h-[65vh] overflow-auto p-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/80 text-xs text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Nome</th>
              <th className="px-3 py-2 text-left font-medium">E-mail</th>
              <th className="px-3 py-2 text-left font-medium">Telefone</th>
              <th className="px-3 py-2 text-center font-medium">Acertos</th>
              <th className="px-3 py-2 text-center font-medium">Incorretas</th>
              <th className="px-3 py-2 text-center font-medium">Em branco</th>
              <th className="px-3 py-2 text-center font-medium">Pontuação</th>
              <th className="px-3 py-2 text-center font-medium">Finalizado</th>
              {disciplinas.map((d) => <th key={d} className="whitespace-nowrap px-3 py-2 text-center font-medium">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ a, acertos, incorretas, emBranco, nota, finalizadoData, porDisc }) => (
              <tr key={a.id} className="border-t transition-colors hover:bg-muted/40">
                <td className="whitespace-nowrap px-3 py-2 font-medium">{a.nome}</td>
                <td className="px-3 py-2 text-muted-foreground">{a.email ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{a.telefone ?? '—'}</td>
                <td className="px-3 py-2 text-center"><span className={cn(pill, 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400')}>{acertos}</span></td>
                <td className="px-3 py-2 text-center"><span className={cn(pill, 'bg-rose-500/10 text-rose-600 dark:text-rose-400')}>{incorretas}</span></td>
                <td className="px-3 py-2 text-center"><span className={cn(pill, 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>{emBranco}</span></td>
                <td className={cn('px-3 py-2 text-center font-bold', tone(nota))}>{nota.toFixed(1)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-center text-sm">
                  {finalizadoData ? <span className="text-foreground">{finalizadoData}</span> : <span className="text-muted-foreground">—</span>}
                </td>
                {disciplinas.map((d) => (
                  <td key={d} className="whitespace-nowrap px-3 py-2 text-center text-muted-foreground">
                    <span className="font-medium text-foreground">{porDisc.get(d) ?? 0}</span><span className="opacity-50">/{discTotais.get(d)}</span>
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
