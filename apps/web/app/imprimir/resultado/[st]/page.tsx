import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { PrintButton } from '@/components/aluno/print-button'

const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']

export default async function ResultadoImprimirPage({ params, searchParams }: { params: Promise<{ st: string }>; searchParams: Promise<{ sem?: string; mod?: string }> }) {
  const { st } = await params
  const { sem, mod } = await searchParams
  const svc = await createServiceClient()

  const { data: sessao } = await svc
    .from('simulado_sessoes_prova')
    .select('id, simulado_id, estudante_id, status, nota, posicao_ranking')
    .eq('id', st)
    .maybeSingle()
  if (!sessao || sessao.status !== 'finalizada') notFound()

  const [{ data: simulado }, { data: estudante }, { data: partRows }] = await Promise.all([
    svc.from('simulado_simulados').select('titulo, status, data_fim, regras').eq('id', sessao.simulado_id).single(),
    svc.from('simulado_estudantes').select('nome').eq('id', sessao.estudante_id).maybeSingle(),
    svc.from('simulado_sessoes_prova').select('estudante_id').eq('simulado_id', sessao.simulado_id).eq('is_teste', false).eq('status', 'finalizada'),
  ])
  const totalParticipantes = new Set((partRows ?? []).map((p: any) => p.estudante_id)).size

  const regras = (simulado?.regras as { liberar_gabarito?: string }) ?? {}
  const liberar = regras.liberar_gabarito ?? 'apos_janela'
  const agora = new Date()
  let gabaritoLiberado = liberar === 'imediato'
  if (liberar === 'apos_janela') gabaritoLiberado = simulado?.status === 'encerrado' || (!!simulado?.data_fim && new Date(simulado.data_fim) < agora)
  // ?sem=1 força a versão SEM gabarito (o caderno que o aluno fez, só com as marcações).
  if (sem === '1') gabaritoLiberado = false
  // ?mod=completo → caderno completo (com comentário do professor, quando há gabarito).
  const completo = mod === 'completo'

  const { data: sq } = await svc
    .from('simulado_prova_questoes')
    .select('ordem, questoes:simulado_questoes(id, tipo, enunciado, comentario_professor, disciplinas:simulado_disciplinas(nome), alternativas:simulado_alternativas(id, texto, ordem, correta))')
    .eq('simulado_id', sessao.simulado_id)
    .eq('anulada', false)
    .order('ordem')

  const { data: respostas } = await svc
    .from('simulado_respostas_objetivas')
    .select('questao_id, alternativa_id, correta')
    .eq('sessao_id', st)
  const respMap = new Map((respostas ?? []).map((r: any) => [r.questao_id, r]))

  const { data: discResp } = await svc
    .from('simulado_respostas_discursivas')
    .select('questao_id, texto, status, nota, feedback')
    .eq('sessao_id', st)
  const discMap = new Map((discResp ?? []).map((d: any) => [d.questao_id, d]))

  const total = (sq ?? []).length
  const acertos = (respostas ?? []).filter((r: any) => r.correta).length

  // Desempenho por matéria.
  const agg = new Map<string, { acertos: number; total: number }>()
  for (const row of sq ?? []) {
    const q = (row as any).questoes
    const disc = q?.disciplinas?.nome ?? 'Sem matéria'
    const cur = agg.get(disc) ?? { acertos: 0, total: 0 }
    cur.total += 1
    if (respMap.get(q?.id)?.correta) cur.acertos += 1
    agg.set(disc, cur)
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <style>{`
        @media print { .no-print { display: none !important; } @page { margin: 16mm 14mm; } }
        .folha { max-width: 720px; margin: 0 auto; padding: 24px; font-family: Georgia, 'Times New Roman', serif; }
        .qa { break-inside: avoid; }
      `}</style>

      <PrintButton label="Imprimir / Salvar PDF do relatório" />

      <div className="folha">
        <h1 className="text-center text-xl font-bold">{simulado?.titulo ?? 'Simulado'}</h1>
        <p className="mb-4 text-center text-sm">Relatório de desempenho — {estudante?.nome ?? 'Aluno'}</p>

        {/* Resumo */}
        <div className="mb-5 grid grid-cols-4 gap-2 text-center">
          <div className="rounded border border-black/20 p-2"><div className="text-lg font-bold">{Number(sessao.nota ?? 0).toFixed(1)}</div><div className="text-xs">Nota</div></div>
          <div className="rounded border border-black/20 p-2"><div className="text-lg font-bold">{acertos}/{total}</div><div className="text-xs">Acertos</div></div>
          <div className="rounded border border-black/20 p-2"><div className="text-lg font-bold">{sessao.posicao_ranking ?? '—'}º</div><div className="text-xs">Ranking</div></div>
          <div className="rounded border border-black/20 p-2"><div className="text-lg font-bold">{totalParticipantes ?? 0}</div><div className="text-xs">Participantes</div></div>
        </div>

        {/* Por matéria */}
        {gabaritoLiberado && agg.size > 0 && (
          <div className="mb-5">
            <h2 className="mb-2 text-sm font-bold">Desempenho por matéria</h2>
            <table className="w-full text-sm">
              <tbody>
                {[...agg.entries()].map(([disc, v]) => (
                  <tr key={disc} className="border-b border-black/10">
                    <td className="py-1">{disc}</td>
                    <td className="py-1 text-right">{v.acertos}/{v.total} ({v.total ? Math.round((v.acertos / v.total) * 100) : 0}%)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Caderno de respostas + gabarito */}
        <h2 className="mb-2 text-sm font-bold">Caderno de respostas {gabaritoLiberado ? '+ gabarito' : '(suas marcações)'}</h2>
        <div className="space-y-4">
          {(sq ?? []).map((row: any, idx: number) => {
            const q = row.questoes
            const resp = respMap.get(q?.id)
            const alts = (q?.alternativas ?? []).slice().sort((a: any, b: any) => a.ordem - b.ordem)
            const d = q?.tipo === 'discursiva' ? discMap.get(q?.id) : null
            return (
              <div key={q?.id} className="qa text-[15px] leading-relaxed">
                <p className="mb-1"><strong>{idx + 1}.</strong> {q?.enunciado}</p>
                {q?.tipo === 'discursiva' ? (
                  <div className="ml-4 space-y-1">
                    <p className="text-xs uppercase tracking-wide text-black/50">Resposta discursiva</p>
                    <div className="whitespace-pre-wrap rounded border border-black/15 p-2 text-sm">{d?.texto || '(em branco)'}</div>
                    {d?.status === 'corrigida' ? (
                      <p className="text-sm"><strong>Nota:</strong> {Number(d.nota ?? 0).toFixed(1)}{d.feedback ? ` — ${d.feedback}` : ''}</p>
                    ) : (
                      <p className="text-xs italic">Aguardando correção.</p>
                    )}
                  </div>
                ) : (
                  <div className="ml-4 space-y-0.5">
                    {alts.map((a: any, i: number) => {
                      const marcou = resp?.alternativa_id === a.id
                      const correta = gabaritoLiberado && a.correta
                      return (
                        <p key={a.id} className={correta ? 'font-semibold' : ''}>
                          {marcou ? '●' : '○'} {gabaritoLiberado && a.correta ? '✓ ' : ''}{LETRA[i] ?? i + 1}) {a.texto}
                          {marcou && ' — (sua resposta)'}
                        </p>
                      )
                    })}
                  </div>
                )}
                {completo && gabaritoLiberado && q?.comentario_professor && (
                  <div className="ml-4 mt-1 rounded border border-black/10 bg-black/[0.03] p-2 text-sm">
                    <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-black/50">Comentário</p>
                    <p className="whitespace-pre-wrap">{q.comentario_professor}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {!gabaritoLiberado && (
          <p className="mt-4 text-center text-xs italic">O gabarito será liberado conforme a configuração do simulado.</p>
        )}
      </div>
    </div>
  )
}
