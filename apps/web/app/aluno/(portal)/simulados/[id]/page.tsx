import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { ChevronLeft, Lock, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { montarItensSimulado } from '@/lib/aluno/simulado-item'
import { montarComparativo } from '@/lib/simulado/comparativo'
import { montarResultadoAluno, type SessaoInput } from '@/lib/simulado/resultado-aluno'
import { montarDesempenhoAluno } from '@/lib/simulado/desempenho-aluno'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'
import { tiposDeSimulados } from '@/lib/simulado/tipo'
import { modalidadesDoAlunoV2, temEntregaV2, carregarEntregaBanco, type ModalidadeAluno } from '@/lib/caderno-teste/entrega-aluno'
import { MeuSimuladoView } from '@/components/aluno/meu-simulado-view'
import { AvaliacaoSimulado } from '@/components/aluno/avaliacao-simulado'

const notaTone = (n: number) => (n >= 70 ? 'text-emerald-600 dark:text-emerald-400' : n >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')
const nota = (n: number | null) => (n == null ? '—' : Number(n).toFixed(1).replace('.', ','))

export default async function ResultadoAlunoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sessao = await getSessaoAluno()
  const svc = createAdminClient()
  const estId = sessao!.estudanteId

  // Simulado + sessões finalizadas do aluno em paralelo (as sessões definem o early-return).
  const [{ data: sim }, { data: sess }] = await Promise.all([
    // owner_estudante_id IS NULL: esta é a tela de resultado OFICIAL — simulados pessoais têm fluxo próprio (Personalizados).
    svc.from('simulado_simulados').select('id, titulo, regras, status, modo_aplicacao, data_inicio, data_fim, embed_token, created_at').eq('id', id).is('owner_estudante_id', null).maybeSingle(),
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

  // Independentes: classificação (p/ liberações), tipo do simulado, avaliação NPS e acessos avulsos
  // (prazo, p/ o "Refazer") — em paralelo.
  const [{ data: estRow }, tipo, avResult, { data: acessos }] = await Promise.all([
    svc.from('simulado_estudantes').select('classificacao').eq('id', estId).maybeSingle(),
    tiposDeSimulados(svc, [id]).then((m) => m.get(id) ?? null),
    // NPS: tolerante — se a tabela simulado_avaliacoes ainda não foi migrada (avErr), não mostra o card.
    svc.from('simulado_avaliacoes').select('id').eq('estudante_id', estId).eq('simulado_id', id).maybeSingle()
      .then((r) => ({ avRow: r.data, avErr: r.error })),
    svc.from('simulado_acessos').select('expira_em').eq('estudante_id', estId).eq('simulado_id', id),
  ])
  const { notaLiberada, gabaritoLiberado, cadernoParaAluno } = resolverLiberacoes(sim.regras as any, sim, { classificacao: (estRow as any)?.classificacao ?? null })
  const mostrarNps = !avResult.avErr && !avResult.avRow

  // Refazer (parte interna): pode abrir nova tentativa agora? Deriva do MESMO estado dos cards
  // (janela aberta, publicado, com token e vagas) — o botão saiu da FRENTE do card para cá.
  const expira = ((acessos ?? []) as any[]).reduce<string | null>((max, a) => (a.expira_em && (!max || new Date(a.expira_em) > new Date(max))) ? a.expira_em : max, null)
  const estadoSim = montarItensSimulado([sim], new Map([[id, finalizadas]]), new Map([[id, expira]]), new Map())[0]
  const podeRefazer = !!(estadoSim?.refazer && estadoSim?.podeFazer)
  const refazerHref = podeRefazer && sim.embed_token ? `/simulado/${sim.embed_token}` : null

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
      // Entrega V2 (fonte única): modalidades vêm do caderno_entrega do banco do simulado.
      const bancoBaseId = (sim.regras as any)?.banco_base_id as string | undefined
      const entrega = bancoBaseId ? await carregarEntregaBanco(svc, null, bancoBaseId) : null
      return { cadernoId: null, modalidades: temEntregaV2(entrega) ? modalidadesDoAlunoV2(entrega) : [] }
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
            {finalizadas.length > 1 && <p className="mt-1 text-sm text-muted-foreground">{finalizadas.length} realizações</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-3">
            {notaLiberada ? (
              <div className="text-right">
                <div className={cn('text-4xl font-extrabold tabular-nums', melhor.nota != null && notaTone(Number(melhor.nota)))}>{nota(melhor.nota)}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">melhor nota</div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Aguardando liberação</div>
            )}
            {/* Refazer — agora na PARTE INTERNA (saiu da frente do card). */}
            {podeRefazer && refazerHref && (
              <a href={refazerHref}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90">
                <RotateCcw className="h-4 w-4" /> Refazer simulado
              </a>
            )}
          </div>
        </div>
      </div>

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
        cadernosInline
        feedback={<AvaliacaoSimulado sessaoId={melhor.id} mostrarNps={mostrarNps} />}
      />
    </div>
  )
}

function Voltar() {
  return <Link href="/aluno/simulados" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" /> Meus simulados</Link>
}
