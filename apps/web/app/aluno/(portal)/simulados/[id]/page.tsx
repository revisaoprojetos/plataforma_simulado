import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { ChevronLeft, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { montarComparativo } from '@/lib/simulado/comparativo'
import { montarResultadoAluno, type SessaoInput } from '@/lib/simulado/resultado-aluno'
import { montarDesempenhoAluno } from '@/lib/simulado/desempenho-aluno'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'
import { tiposDeSimulados } from '@/lib/simulado/tipo'
import { modalidadesDoAluno, type ModalidadeAluno } from '@/lib/caderno-designer/entrega-aluno'
import { modalidadesDoAlunoV2, temEntregaV2, carregarEntregaBanco } from '@/lib/caderno-teste/entrega-aluno'
import { MeuSimuladoView } from '@/components/aluno/meu-simulado-view'
import { NpsAvaliacao } from '@/components/aluno/nps-avaliacao'

const notaTone = (n: number) => (n >= 70 ? 'text-emerald-600 dark:text-emerald-400' : n >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')
const nota = (n: number | null) => (n == null ? '—' : Number(n).toFixed(1).replace('.', ','))

export default async function ResultadoAlunoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()
  const estId = sessao!.estudanteId

  // Simulado + sessões finalizadas do aluno em paralelo (as sessões definem o early-return).
  const [{ data: sim }, { data: sess }] = await Promise.all([
    svc.from('simulado_simulados').select('id, titulo, regras, status, data_fim, embed_token').eq('id', id).maybeSingle(),
    svc.from('simulado_sessoes_prova')
      .select('id, status, nota, iniciado_em, finalizado_em, posicao_ranking, tentativa_num')
      .eq('estudante_id', estId).eq('simulado_id', id).eq('is_teste', false).eq('deletado', false).eq('status', 'finalizada'),
  ])
  if (!sim) notFound()
  const finalizadas = (sess ?? []) as any[]
  if (!finalizadas.length) {
    return (
      <div className="space-y-4">
        <Voltar />
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">Você ainda não concluiu este simulado.</div>
      </div>
    )
  }
  // Melhor tentativa (nota; desempate pela mais recente) — usada no hero e no comparativo.
  const melhor = [...finalizadas].sort((a, b) => (Number(b.nota ?? -1) - Number(a.nota ?? -1)) || (new Date(b.finalizado_em ?? 0).getTime() - new Date(a.finalizado_em ?? 0).getTime()))[0]

  // Independentes: classificação (p/ liberações), tipo do simulado e avaliação NPS — em paralelo.
  const [{ data: estRow }, tipo, avResult] = await Promise.all([
    svc.from('simulado_estudantes').select('classificacao').eq('id', estId).maybeSingle(),
    tiposDeSimulados(svc, [id]).then((m) => m.get(id) ?? null),
    // NPS: tolerante — se a tabela simulado_avaliacoes ainda não foi migrada (avErr), não mostra o card.
    svc.from('simulado_avaliacoes').select('id').eq('estudante_id', estId).eq('simulado_id', id).maybeSingle()
      .then((r) => ({ avRow: r.data, avErr: r.error })),
  ])
  const { notaLiberada, gabaritoLiberado, cadernoParaAluno } = resolverLiberacoes(sim.regras as any, sim, { classificacao: (estRow as any)?.classificacao ?? null })
  const mostrarNps = !avResult.avErr && !avResult.avRow

  const sessoesInput: SessaoInput[] = finalizadas.map((s) => ({
    id: s.id, tentativa_num: s.tentativa_num, nota: s.nota, iniciado_em: s.iniciado_em, finalizado_em: s.finalizado_em, posicao_ranking: s.posicao_ranking,
  }))

  // Resultado + comparativo + desempenho + caderno do aluno, TODOS em paralelo. A resolução do
  // caderno (regras.caderno_id → banco_base_id → banco das questões que mais cobre a prova e tem
  // caderno) e suas modalidades rodam junto do resultado pesado, em vez de depois dele.
  const [{ tentativas, questoes }, comparativo, desempenho, cadernoInfo] = await Promise.all([
    montarResultadoAluno(svc, id, sessoesInput, gabaritoLiberado),
    montarComparativo(svc, id, { minhaNota: melhor.nota != null ? Number(melhor.nota) : null, minhaSessaoId: melhor.id }),
    montarDesempenhoAluno(svc, estId),
    (async (): Promise<{ cadernoId: string | null; modalidades: ModalidadeAluno[] }> => {
      const bancoBaseId = (sim.regras as any)?.banco_base_id as string | undefined
      // Entrega V2 (flag por simulado): se ligada e o banco tem entrega utilizável, entrega o V2.
      if ((sim.regras as any)?.entrega_v2 === true && bancoBaseId) {
        const entrega = await carregarEntregaBanco(svc, null, bancoBaseId)
        if (temEntregaV2(entrega)) return { cadernoId: null, modalidades: modalidadesDoAlunoV2(entrega) }
      }
      let cadernoId = ((sim.regras as any)?.caderno_id as string | undefined) ?? null
      if (!cadernoId && bancoBaseId) {
        const { data: banco } = await svc.from('simulado_pastas').select('caderno_id').eq('id', bancoBaseId).maybeSingle()
        cadernoId = ((banco as any)?.caderno_id as string | undefined) ?? null
      }
      if (!cadernoId) {
        const { data: pq } = await svc.from('simulado_prova_questoes').select('questao_id').eq('simulado_id', id)
        const qIds = [...new Set((pq ?? []).map((r: any) => r.questao_id).filter(Boolean))]
        if (qIds.length) {
          const { data: qp } = await svc.from('simulado_questao_pasta').select('questao_id, pasta_id').in('questao_id', qIds)
          const pastaIds = [...new Set((qp ?? []).map((r: any) => r.pasta_id))]
          const { data: pastas } = pastaIds.length ? await svc.from('simulado_pastas').select('id, caderno_id').in('id', pastaIds) : { data: [] as any[] }
          const cadDaPasta = new Map<string, string>((pastas ?? []).filter((p: any) => p.caderno_id).map((p: any) => [p.id, p.caderno_id]))
          const cont = new Map<string, number>()
          for (const r of qp ?? []) if (cadDaPasta.has((r as any).pasta_id)) cont.set((r as any).pasta_id, (cont.get((r as any).pasta_id) ?? 0) + 1)
          const escolha = [...cont.entries()].sort((a, b) => b[1] - a[1])[0]
          if (escolha) cadernoId = cadDaPasta.get(escolha[0])!
        }
      }
      let modalidades: ModalidadeAluno[] = []
      if (cadernoId) {
        const { data: cad } = await svc.from('simulado_cadernos_designer').select('config').eq('id', cadernoId).maybeSingle()
        modalidades = modalidadesDoAluno((cad as any)?.config, tipo)
      }
      return { cadernoId, modalidades }
    })(),
  ])
  const { cadernoId, modalidades } = cadernoInfo

  return (
    <div className="animate-page space-y-5">
      <Voltar />

      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/25 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resultado</p>
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{sim.titulo}</h1>
            {finalizadas.length > 1 && <p className="mt-1 text-sm text-muted-foreground">{finalizadas.length} tentativas realizadas</p>}
          </div>
          <div className="shrink-0 text-right">
            {notaLiberada ? (
              <>
                <div className={cn('text-4xl font-extrabold tabular-nums', melhor.nota != null && notaTone(Number(melhor.nota)))}>{nota(melhor.nota)}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">melhor nota</div>
              </>
            ) : (
              <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Aguardando liberação</div>
            )}
          </div>
        </div>
      </div>

      {mostrarNps && <NpsAvaliacao sessaoId={melhor.id} />}

      <MeuSimuladoView
        tentativas={tentativas}
        questoes={questoes}
        comparativo={comparativo}
        desempenho={desempenho}
        notaLiberada={notaLiberada}
        gabaritoLiberado={gabaritoLiberado}
        cadernoLiberado={cadernoParaAluno}
        cadernoId={cadernoId}
        modalidades={modalidades}
        estId={estId}
        simuladoId={id}
        simuladoTitulo={sim.titulo}
      />
    </div>
  )
}

function Voltar() {
  return <Link href="/aluno/simulados" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" /> Meus simulados</Link>
}
