import { createAdminClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, TrendingDown, BarChart3 } from 'lucide-react'

interface Props {
  simuladoId: string
}

/** Relatório de desempenho do simulado: ranking, questões com maior erro e matérias. */
export async function SimuladoRelatorio({ simuladoId }: Props) {
  const svc = createAdminClient()

  // Sessões finalizadas (exceto testes) com aluno.
  const { data: sessoes } = await svc
    .from('simulado_sessoes_prova')
    .select('id, nota, posicao_ranking, estudantes:simulado_estudantes(nome)')
    .eq('simulado_id', simuladoId)
    .eq('is_teste', false)
    .eq('status', 'finalizada')
    .order('posicao_ranking', { ascending: true })

  const sessoesArr = sessoes ?? []
  const sessaoIds = sessoesArr.map((s: any) => s.id)

  // Questões do simulado + matéria.
  const { data: pq } = await svc
    .from('simulado_prova_questoes')
    .select('questao_id, ordem, questoes:simulado_questoes(id, enunciado, disciplinas:simulado_disciplinas(nome))')
    .eq('simulado_id', simuladoId)
    .eq('anulada', false)
    .order('ordem')

  const questoesInfo = new Map<string, { enunciado: string; disciplina: string; ordem: number }>()
  for (const row of pq ?? []) {
    const q = (row as any).questoes
    if (q?.id) questoesInfo.set(q.id, { enunciado: q.enunciado ?? '', disciplina: q.disciplinas?.nome ?? 'Sem matéria', ordem: (row as any).ordem ?? 0 })
  }

  // Respostas de todas as sessões finalizadas.
  let respostas: Array<{ questao_id: string; correta: boolean | null }> = []
  if (sessaoIds.length) {
    const { data } = await svc
      .from('simulado_respostas_objetivas')
      .select('questao_id, correta')
      .in('sessao_id', sessaoIds)
    respostas = (data as any) ?? []
  }

  // Erros por questão + acertos por matéria.
  const porQuestao = new Map<string, { erros: number; total: number }>()
  const porMateria = new Map<string, { acertos: number; total: number }>()
  for (const r of respostas) {
    const pqs = porQuestao.get(r.questao_id) ?? { erros: 0, total: 0 }
    pqs.total += 1
    if (!r.correta) pqs.erros += 1
    porQuestao.set(r.questao_id, pqs)

    const disc = questoesInfo.get(r.questao_id)?.disciplina ?? 'Sem matéria'
    const pm = porMateria.get(disc) ?? { acertos: 0, total: 0 }
    pm.total += 1
    if (r.correta) pm.acertos += 1
    porMateria.set(disc, pm)
  }

  const questoesMaiorErro = [...porQuestao.entries()]
    .map(([qid, v]) => ({
      enunciado: questoesInfo.get(qid)?.enunciado ?? '—',
      ordem: questoesInfo.get(qid)?.ordem ?? 0,
      erros: v.erros,
      total: v.total,
      taxaErro: v.total > 0 ? Math.round((v.erros / v.total) * 100) : 0,
    }))
    .sort((a, b) => b.taxaErro - a.taxaErro)
    .slice(0, 8)

  const materias = [...porMateria.entries()]
    .map(([disciplina, v]) => ({ disciplina, acertos: v.acertos, total: v.total, percentual: v.total > 0 ? Math.round((v.acertos / v.total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total)

  if (sessoesArr.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nenhuma sessão finalizada ainda. O relatório aparece quando os alunos concluírem o simulado.
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Ranking */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-amber-500" /> Ranking da turma ({sessoesArr.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">#</th>
                  <th className="px-4 py-2 text-left font-medium">Aluno</th>
                  <th className="px-4 py-2 text-right font-medium">Nota</th>
                </tr>
              </thead>
              <tbody>
                {sessoesArr.map((s: any, i: number) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-4 py-2 font-mono text-muted-foreground">{s.posicao_ranking ?? i + 1}º</td>
                    <td className="px-4 py-2 font-medium">{s.estudantes?.nome ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-semibold">{(s.nota ?? 0).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Desempenho por matéria */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" /> Desempenho por matéria
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {materias.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
          {materias.map((m) => (
            <div key={m.disciplina} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{m.disciplina}</span>
                <span className="text-muted-foreground">{m.percentual}% ({m.acertos}/{m.total})</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${m.percentual >= 70 ? 'bg-green-500' : m.percentual >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${m.percentual}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Questões com maior erro */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="h-4 w-4 text-red-500" /> Questões com maior erro
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {questoesMaiorErro.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
          {questoesMaiorErro.map((q, i) => (
            <div key={i} className="flex items-start justify-between gap-3 border-b pb-2 text-sm last:border-0">
              <span className="line-clamp-2 flex-1 text-muted-foreground">
                <span className="mr-1 font-mono text-xs">Q{q.ordem + 1}.</span>
                {q.enunciado}
              </span>
              <Badge variant={q.taxaErro >= 50 ? 'destructive' : 'secondary'}>{q.taxaErro}% erro</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
