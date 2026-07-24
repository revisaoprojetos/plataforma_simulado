import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { type QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import { QuestaoCard } from '@/components/aluno/questao-card'
import { Card, CardContent } from '@/components/ui/card'
import { Sparkles, Target, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'

export default async function RecomendadoPage() {
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()

  // 1) Histórico de respostas objetivas do aluno (todas as sessões).
  const { data: sessoes } = await svc
    .from('simulado_sessoes_prova')
    .select('id')
    .eq('estudante_id', sessao!.estudanteId)
  const sessaoIds = (sessoes ?? []).map((s: any) => s.id)

  const { data: resp } = sessaoIds.length
    ? await svc.from('simulado_respostas_objetivas').select('questao_id, correta').in('sessao_id', sessaoIds)
    : { data: [] as any[] }

  // 2) Mapeia questão → disciplina.
  const answeredIds = [...new Set((resp ?? []).map((r: any) => r.questao_id))]
  const { data: qDisc } = answeredIds.length
    ? await svc.from('simulado_questoes').select('id, disciplina_id').in('id', answeredIds)
    : { data: [] as any[] }
  const qDiscMap = new Map((qDisc ?? []).map((q: any) => [q.id, q.disciplina_id]))

  // 3) Estatística por disciplina + questões dominadas/erradas.
  const stats = new Map<string, { acertos: number; total: number }>()
  const dominadas = new Set<string>()
  const erradas = new Set<string>()
  for (const r of resp ?? []) {
    const d = qDiscMap.get(r.questao_id) ?? '__sem'
    const cur = stats.get(d) ?? { acertos: 0, total: 0 }
    cur.total += 1
    if (r.correta) { cur.acertos += 1; dominadas.add(r.questao_id) } else { erradas.add(r.questao_id) }
    stats.set(d, cur)
  }

  const discIds = [...stats.keys()].filter((d) => d !== '__sem')
  const { data: discNomes } = discIds.length
    ? await svc.from('simulado_disciplinas').select('id, nome').in('id', discIds)
    : { data: [] as any[] }
  const discNomeMap = new Map((discNomes ?? []).map((d: any) => [d.id, d.nome]))

  const diagnostico = [...stats.entries()]
    .filter(([d]) => d !== '__sem')
    .map(([d, v]) => ({ id: d, nome: discNomeMap.get(d) ?? 'Matéria', pct: v.total ? Math.round((v.acertos / v.total) * 100) : 0, acertos: v.acertos, total: v.total }))
    .sort((a, b) => a.pct - b.pct)

  // 4) Disciplinas fracas (≤ 70%) → questões recomendadas (não dominadas).
  const fracas = diagnostico.filter((d) => d.pct <= 70).map((d) => d.id)
  let recomendadas: QuestaoAluno[] = []

  if (fracas.length) {
    const selCand = (cols: string) => svc
      .from('simulado_questoes')
      .select(cols)
      .eq('tenant_id', sessao!.tenantId)
      .eq('status', 'publicada')
      .in('disciplina_id', fracas)
      .limit(50)
    // Tolerante à coluna imagem_url ainda não migrada.
    let candR: { data: any[] | null; error: unknown } = await selCand('id, tipo, enunciado, imagem_url, disciplina_id, ano, comentario_professor')
    if ((candR as any).error && /imagem_url|column/i.test(String((candR as any).error?.message))) {
      candR = await selCand('id, tipo, enunciado, disciplina_id, ano, comentario_professor')
    }
    const cand = candR.data

    // Prioriza: erradas antes, depois nunca respondidas. Exclui dominadas.
    const naoDominadas = (cand ?? []).filter((q: any) => !dominadas.has(q.id))
    naoDominadas.sort((a: any, b: any) => (erradas.has(b.id) ? 1 : 0) - (erradas.has(a.id) ? 1 : 0))
    const escolhidas = naoDominadas.slice(0, 10)
    const ids = escolhidas.map((q: any) => q.id)

    const [{ data: alts }, { data: favs }] = await Promise.all([
      ids.length ? svc.from('simulado_alternativas').select('id, questao_id, texto, ordem, correta').in('questao_id', ids) : Promise.resolve({ data: [] as any[] }),
      ids.length ? svc.from('simulado_favoritos').select('questao_id').eq('estudante_id', sessao!.estudanteId).in('questao_id', ids) : Promise.resolve({ data: [] as any[] }),
    ])
    const altMap = new Map<string, any[]>()
    for (const a of alts ?? []) { const arr = altMap.get(a.questao_id) ?? []; arr.push(a); altMap.set(a.questao_id, arr) }
    const favSet = new Set((favs ?? []).map((f: any) => f.questao_id))

    recomendadas = escolhidas.map((q: any) => ({
      id: q.id,
      tipo: q.tipo,
      enunciado: q.enunciado ?? '',
      imagem_url: q.imagem_url ?? null,
      disciplina: discNomeMap.get(q.disciplina_id) ?? null,
      ano: q.ano ?? null,
      comentario_professor: q.comentario_professor ?? null,
      favorito: favSet.has(q.id),
      alternativas: (altMap.get(q.id) ?? []).map((a) => ({ id: a.id, texto: a.texto, ordem: a.ordem ?? 0, correta: !!a.correta })),
    }))
  }

  const semHistorico = (resp ?? []).length === 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Sparkles className="h-6 w-6 text-primary" /> Recomendado para você
        </h1>
        <p className="text-muted-foreground">Questões escolhidas com base no seu desempenho, focando onde você mais erra.</p>
      </div>

      {semHistorico ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Lightbulb className="h-8 w-8" />
            <p className="text-sm">Resolva algumas questões ou um simulado para receber recomendações personalizadas.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Diagnóstico */}
          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-primary" /> Seu diagnóstico por matéria</h2>
              {diagnostico.map((d) => (
                <div key={d.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{d.nome}</span>
                    <span className="text-muted-foreground">{d.pct}% ({d.acertos}/{d.total})</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full', d.pct >= 70 ? 'bg-green-500' : d.pct >= 50 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${d.pct}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Recomendadas */}
          <div>
            <h2 className="mb-3 text-lg font-semibold">
              {recomendadas.length > 0 ? `${recomendadas.length} questões para reforçar` : 'Mandou bem!'}
            </h2>
            {recomendadas.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Você está com bom desempenho em todas as matérias com histórico. Continue praticando no banco de questões.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {recomendadas.map((q, i) => <QuestaoCard key={q.id} questao={q} numero={i + 1} />)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
