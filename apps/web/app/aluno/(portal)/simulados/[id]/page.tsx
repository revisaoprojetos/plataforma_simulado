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
import { filtrarModsPorTipo, tiposDeSimulados } from '@/lib/simulado/tipo'
import { mesclarModalidades } from '@/lib/caderno-designer/types'
import { MeuSimuladoView } from '@/components/aluno/meu-simulado-view'

const notaTone = (n: number) => (n >= 7 ? 'text-emerald-600 dark:text-emerald-400' : n >= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')
const nota = (n: number | null) => (n == null ? '—' : Number(n).toFixed(1).replace('.', ','))

export default async function ResultadoAlunoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()
  const estId = sessao!.estudanteId

  const { data: sim } = await svc.from('simulado_simulados').select('id, titulo, regras, status, data_fim, embed_token').eq('id', id).maybeSingle()
  if (!sim) notFound()

  const { data: sess } = await svc
    .from('simulado_sessoes_prova')
    .select('id, status, nota, iniciado_em, finalizado_em, posicao_ranking, tentativa_num')
    .eq('estudante_id', estId).eq('simulado_id', id).eq('is_teste', false).eq('deletado', false).eq('status', 'finalizada')
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

  // Liberações independentes (nota / gabarito / caderno) — considerando a classificação do aluno.
  const { data: estRow } = await svc.from('simulado_estudantes').select('classificacao').eq('id', estId).maybeSingle()
  const { notaLiberada, gabaritoLiberado, cadernoParaAluno } = resolverLiberacoes(sim.regras as any, sim, { classificacao: (estRow as any)?.classificacao ?? null })
  // Caderno do designer: regras.caderno_id → banco_base_id → banco das questões.
  // O último caso espelha o admin (simulado → prova_questoes → questao_pasta →
  // pastas.caderno_id, o banco que mais cobre a prova e tem caderno) para achar o
  // caderno mesmo quando o vínculo não está em `regras`.
  let cadernoId = ((sim.regras as any)?.caderno_id as string | undefined) ?? null
  const bancoBaseId = (sim.regras as any)?.banco_base_id as string | undefined
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
      const melhor = [...cont.entries()].sort((a, b) => b[1] - a[1])[0]
      if (melhor) cadernoId = cadDaPasta.get(melhor[0])!
    }
  }

  const sessoesInput: SessaoInput[] = finalizadas.map((s) => ({
    id: s.id, tentativa_num: s.tentativa_num, nota: s.nota, iniciado_em: s.iniciado_em, finalizado_em: s.finalizado_em, posicao_ranking: s.posicao_ranking,
  }))

  const [{ tentativas, questoes }, comparativo, desempenho] = await Promise.all([
    montarResultadoAluno(svc, id, sessoesInput, gabaritoLiberado),
    montarComparativo(svc, id, { minhaNota: melhor.nota != null ? Number(melhor.nota) : null, minhaSessaoId: melhor.id }),
    montarDesempenhoAluno(svc, estId),
  ])

  // Modalidades do CADERNO DO DESIGNER (só as que têm documento com conteúdo real),
  // filtradas pelo tipo do simulado. `temGabarito` = tem versão com correção (o
  // Diagnóstico não tem). Docs vazios (sem blocos além do plano-fundo) são ignorados
  // para não exibir botão de caderno em branco.
  const tipo = (await tiposDeSimulados(svc, [id])).get(id) ?? null
  const temConteudo = (d: any) => !!d && Array.isArray(d.pages) && d.pages.some((p: any) => (p.blocks ?? []).some((b: any) => b.type !== 'plano-fundo'))
  let modalidades: { id: string; nome: string; temGabarito: boolean }[] = []
  if (cadernoId) {
    const { data: cad } = await svc.from('simulado_cadernos_designer').select('config').eq('id', cadernoId).maybeSingle()
    const cfg = ((cad as any)?.config ?? {}) as any
    const docs = (cfg.docsV2 ?? {}) as Record<string, unknown>
    // "Caderno de Perguntas" é entrega-padrão (aparece mesmo sem doc próprio, via semente)
    // e nunca tem versão com gabarito — é só o enunciado + alternativas.
    modalidades = filtrarModsPorTipo(mesclarModalidades(cfg.modalidadesV2), tipo)
      .filter((m) => temConteudo(docs[m.id]) || m.id === 'caderno_perguntas')
      .map((m) => ({ id: m.id, nome: m.nome, temGabarito: m.id !== 'diagnostico' && m.id !== 'caderno_perguntas' }))
  }

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
