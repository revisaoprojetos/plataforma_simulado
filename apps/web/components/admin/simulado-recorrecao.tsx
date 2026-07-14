import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AdicionarCorrecao, type QuestaoCorrecao } from '@/components/admin/adicionar-correcao'
import { RemoverCorrecaoButton } from '@/components/admin/remover-correcao-button'
import { TrendingUp, TrendingDown, Ban, Repeat, Users } from 'lucide-react'

/** Busca nomes de estudantes por id em lotes (evita URL gigante no .in()). */
async function nomesPorIds(svc: ReturnType<typeof createAdminClient>, ids: string[]) {
  const map = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await svc.from('simulado_estudantes').select('id, nome').in('id', ids.slice(i, i + 100))
    for (const e of data ?? []) map.set((e as any).id, (e as any).nome)
  }
  return map
}

const nota1 = (n: any) => Number(n ?? 0).toFixed(1)

export async function SimuladoRecorrecao({ simuladoId }: { simuladoId: string }) {
  const svc = createAdminClient()

  // Questões do simulado.
  const { data: pq } = await svc
    .from('simulado_prova_questoes')
    .select('questao_id, ordem, anulada')
    .eq('simulado_id', simuladoId)
    .order('ordem')
  const qIds = (pq ?? []).map((x: any) => x.questao_id)
  const ordemMap = new Map((pq ?? []).map((x: any) => [x.questao_id, x.ordem]))

  const { data: questoes } = qIds.length
    ? await svc.from('simulado_questoes').select('id, enunciado').in('id', qIds)
    : { data: [] as any[] }
  const enunMap = new Map((questoes ?? []).map((q: any) => [q.id, q.enunciado]))

  const { data: alternativas } = qIds.length
    ? await svc.from('simulado_alternativas').select('id, questao_id, texto, ordem, correta').in('questao_id', qIds)
    : { data: [] as any[] }
  const altsPorQ = new Map<string, any[]>()
  for (const a of alternativas ?? []) {
    const arr = altsPorQ.get(a.questao_id) ?? []; arr.push(a); altsPorQ.set(a.questao_id, arr)
  }

  // Re-correções + impactos (paginado — pode passar de 1000).
  const { data: recs } = await svc
    .from('simulado_recorrecoes')
    .select('id, questao_id, tipo, motivo, politica, executado_em')
    .eq('simulado_id', simuladoId)
    .order('executado_em', { ascending: false })
  const corrigidasIds = new Set((recs ?? []).map((r: any) => r.questao_id))
  const recIds = (recs ?? []).map((r: any) => r.id)

  const impactos = recIds.length
    ? await fetchAll<any>(() => svc
        .from('simulado_recorrecao_impactos')
        .select('recorrecao_id, estudante_id, nota_antes, nota_depois, delta, ranking_antes, ranking_depois, classificacao')
        .in('recorrecao_id', recIds)
        .order('recorrecao_id'))
    : []
  const estMap = await nomesPorIds(svc, [...new Set(impactos.map((i: any) => i.estudante_id))])
  const impPorRec = new Map<string, any[]>()
  for (const im of impactos) {
    const arr = impPorRec.get(im.recorrecao_id) ?? []; arr.push(im); impPorRec.set(im.recorrecao_id, arr)
  }

  // Questões ainda SEM correção (para o seletor).
  const questoesForm: QuestaoCorrecao[] = (pq ?? [])
    .filter((x: any) => !corrigidasIds.has(x.questao_id) && !x.anulada)
    .map((x: any) => ({
      id: x.questao_id,
      ordem: x.ordem ?? 0,
      enunciado: enunMap.get(x.questao_id) ?? '—',
      alternativas: (altsPorQ.get(x.questao_id) ?? []).map((a: any) => ({ id: a.id, ordem: a.ordem ?? 0, texto: a.texto ?? '', correta: !!a.correta })),
    }))

  const isTroca = (t: string) => t === 'troca_alternativa'
  const rotulo = (t: string) => (isTroca(t) ? 'Troca de alternativa' : 'Anulação')

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      {/* ESQUERDA: relatórios antes/depois (rola) */}
      <div className="order-2 space-y-4 lg:order-1">
        {(recs ?? []).length === 0 && (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma correção aplicada ainda. Use “Adicionar correção”.</CardContent></Card>
        )}
        {(recs ?? []).map((r: any) => {
          const imp = (impPorRec.get(r.id) ?? []).slice().sort((a, b) => b.delta - a.delta)
          const benef = imp.filter((i) => i.classificacao === 'beneficiado').length
          const prej = imp.filter((i) => i.classificacao === 'prejudicado').length
          return (
            <Card key={r.id} className="overflow-hidden">
              <CardHeader className="gap-2 border-b bg-muted/30">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-sm font-semibold leading-snug">
                    <span className="mr-1.5 font-mono text-muted-foreground">Q{ordemMap.get(r.questao_id) ?? '?'}</span>
                    {(enunMap.get(r.questao_id) ?? '').replace(/\s+/g, ' ').slice(0, 70)}…
                  </CardTitle>
                  <Badge variant={isTroca(r.tipo) ? 'secondary' : 'destructive'} className="shrink-0">
                    {isTroca(r.tipo) ? <><Repeat className="mr-1 h-3 w-3" /> Gabarito</> : <><Ban className="mr-1 h-3 w-3" /> Anulada</>}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 font-medium text-green-600">
                    <TrendingUp className="h-3 w-3" /> {benef} beneficiado(s)
                  </span>
                  {prej > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 font-medium text-red-600">
                      <TrendingDown className="h-3 w-3" /> {prej} prejudicado(s)
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {isTroca(r.tipo) ? 'já acertou ou marcou a nova' : (r.politica === 'pontua_todos' ? 'pontua todos' : 'desconsidera')}
                    {r.motivo ? ` · ${r.motivo}` : ''}
                  </span>
                </div>
              </CardHeader>
              {imp.length > 0 && (
                <CardContent className="p-0">
                  <div className="max-h-80 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">Aluno</th>
                          <th className="px-3 py-2 text-right font-medium">Antes</th>
                          <th className="px-3 py-2 text-right font-medium">Depois</th>
                          <th className="px-4 py-2 text-right font-medium">Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {imp.map((i, idx) => (
                          <tr key={idx} className="border-t transition-colors hover:bg-muted/40">
                            <td className="px-4 py-1.5 font-medium">{estMap.get(i.estudante_id) ?? '—'}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{nota1(i.nota_antes)}</td>
                            <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{nota1(i.nota_depois)}</td>
                            <td className="px-4 py-1.5 text-right">
                              <span className={`tabular-nums ${i.delta > 0 ? 'text-green-600' : i.delta < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                                {i.delta > 0 ? '+' : ''}{nota1(i.delta)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      {/* DIREITA: fixa no topo — adicionar + questões corrigidas */}
      <div className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-[148px]">
        <div>
          <h3 className="text-base font-semibold">Re-correção</h3>
          <p className="text-xs text-muted-foreground">Anulações e trocas de gabarito.</p>
        </div>

        <AdicionarCorrecao simuladoId={simuladoId} questoes={questoesForm} />

        {(recs ?? []).length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4" /> Questões corrigidas
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{(recs ?? []).length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 pt-0">
              {(recs ?? []).map((r: any) => (
                <div key={r.id} className={`flex w-full items-center gap-2 rounded-lg border py-1.5 pl-2.5 pr-1 text-xs ${isTroca(r.tipo) ? 'border-secondary-foreground/20 bg-secondary/40' : 'border-destructive/20 bg-destructive/5'}`}>
                  {isTroca(r.tipo) ? <Repeat className="h-3.5 w-3.5 shrink-0 text-secondary-foreground" /> : <Ban className="h-3.5 w-3.5 shrink-0 text-destructive" />}
                  <span className="font-mono font-medium">Q{ordemMap.get(r.questao_id) ?? '?'}</span>
                  <span className="text-muted-foreground">{isTroca(r.tipo) ? 'gabarito' : 'anulada'}</span>
                  <span className="ml-auto"><RemoverCorrecaoButton simuladoId={simuladoId} questaoId={r.questao_id} /></span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
