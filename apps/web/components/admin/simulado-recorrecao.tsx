import { createAdminClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AnularQuestaoButton } from '@/components/admin/anular-questao-button'
import { TrendingUp, TrendingDown, Minus, Ban } from 'lucide-react'

export async function SimuladoRecorrecao({ simuladoId }: { simuladoId: string }) {
  const svc = createAdminClient()

  // Questões do simulado.
  const { data: pq } = await svc
    .from('simulado_prova_questoes')
    .select('questao_id, ordem, anulada')
    .eq('simulado_id', simuladoId)
    .order('ordem')
  const qIds = (pq ?? []).map((x: any) => x.questao_id)
  const { data: questoes } = qIds.length
    ? await svc.from('simulado_questoes').select('id, enunciado').in('id', qIds)
    : { data: [] as any[] }
  const enunMap = new Map((questoes ?? []).map((q: any) => [q.id, q.enunciado]))

  // Histórico de re-correções + impactos.
  const { data: recs } = await svc
    .from('simulado_recorrecoes')
    .select('id, questao_id, tipo, motivo, politica, executado_em')
    .eq('simulado_id', simuladoId)
    .order('executado_em', { ascending: false })
  const recIds = (recs ?? []).map((r: any) => r.id)
  const { data: impactos } = recIds.length
    ? await svc.from('simulado_recorrecao_impactos').select('recorrecao_id, estudante_id, nota_antes, nota_depois, delta, ranking_antes, ranking_depois, classificacao').in('recorrecao_id', recIds)
    : { data: [] as any[] }
  const estIds = [...new Set((impactos ?? []).map((i: any) => i.estudante_id))]
  const { data: ests } = estIds.length
    ? await svc.from('simulado_estudantes').select('id, nome').in('id', estIds)
    : { data: [] as any[] }
  const estMap = new Map((ests ?? []).map((e: any) => [e.id, e.nome]))
  const impPorRec = new Map<string, any[]>()
  for (const im of impactos ?? []) {
    const arr = impPorRec.get(im.recorrecao_id) ?? []; arr.push(im); impPorRec.set(im.recorrecao_id, arr)
  }

  return (
    <div className="space-y-5">
      {/* Anular questões */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Anular questão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(pq ?? []).length === 0 && <p className="text-sm text-muted-foreground">Simulado sem questões.</p>}
          {(pq ?? []).map((x: any) => (
            <div key={x.questao_id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <p className="line-clamp-2 flex-1 text-sm">
                <span className="mr-1 font-mono text-xs text-muted-foreground">Q{(x.ordem ?? 0) + 1}.</span>
                {enunMap.get(x.questao_id) ?? '—'}
              </p>
              {x.anulada ? (
                <Badge variant="destructive"><Ban className="mr-1 h-3 w-3" /> Anulada</Badge>
              ) : (
                <AnularQuestaoButton simuladoId={simuladoId} questaoId={x.questao_id} />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Relatório antes/depois */}
      {(recs ?? []).map((r: any) => {
        const imp = (impPorRec.get(r.id) ?? []).slice().sort((a, b) => b.delta - a.delta)
        const benef = imp.filter((i) => i.classificacao === 'beneficiado').length
        const prej = imp.filter((i) => i.classificacao === 'prejudicado').length
        return (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="text-base">
                Anulação — Q. {(enunMap.get(r.questao_id) ?? '').slice(0, 50)}…
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Política: {r.politica === 'pontua_todos' ? 'Pontua todos' : 'Desconsidera'}
                {r.motivo ? ` · ${r.motivo}` : ''} · {new Date(r.executado_em).toLocaleString('pt-BR')}
              </p>
              <div className="flex gap-3 pt-1 text-xs">
                <span className="text-green-600">↑ {benef} beneficiado(s)</span>
                <span className="text-red-600">↓ {prej} prejudicado(s)</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Aluno</th>
                      <th className="px-4 py-2 text-right font-medium">Nota antes</th>
                      <th className="px-4 py-2 text-right font-medium">Nota depois</th>
                      <th className="px-4 py-2 text-right font-medium">Δ</th>
                      <th className="px-4 py-2 text-right font-medium">Posição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imp.map((i, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-4 py-2 font-medium">{estMap.get(i.estudante_id) ?? 'Aluno'}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{Number(i.nota_antes).toFixed(1)}</td>
                        <td className="px-4 py-2 text-right font-semibold">{Number(i.nota_depois).toFixed(1)}</td>
                        <td className="px-4 py-2 text-right">
                          <span className={`inline-flex items-center gap-1 ${i.delta > 0 ? 'text-green-600' : i.delta < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                            {i.delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : i.delta < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                            {i.delta > 0 ? '+' : ''}{Number(i.delta).toFixed(1)}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {i.ranking_antes ?? '—'}º → <strong className="text-foreground">{i.ranking_depois ?? '—'}º</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
