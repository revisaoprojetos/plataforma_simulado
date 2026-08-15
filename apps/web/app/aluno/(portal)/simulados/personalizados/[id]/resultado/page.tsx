import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { ChevronLeft, RotateCcw, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { montarResultadoAluno, type SessaoInput } from '@/lib/simulado/resultado-aluno'
import { MeuSimuladoView } from '@/components/aluno/meu-simulado-view'
import { ExcluirPersonalizadoButton } from '@/components/aluno/excluir-personalizado-button'
import type { Comparativo } from '@/lib/simulado/comparativo'

export const dynamic = 'force-dynamic'

const notaTone = (n: number) => (n >= 70 ? 'text-emerald-600 dark:text-emerald-400' : n >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')
const fmtNota = (n: number | null) => (n == null ? '—' : Number(n).toFixed(1).replace('.', ','))
// Simulado pessoal não tem turma: comparativo vazio + tab escondida.
const COMPARATIVO_VAZIO: Comparativo = { participantes: 0, notaMediaTurma: null, acertoMedioTurma: null, minhaPosicao: null, percentil: null, porDisciplina: [] }

/**
 * DETALHE de um simulado personalizado (acesso pelo card, IGUAL à página de resultado oficial):
 * hero + MeuSimuladoView (Visão geral / Questões) com tentativas, métrica, progresso e revisão.
 * Sem tab "Comparativo" (não há turma). Sem tentativa concluída → volta à HUD de fazer.
 * Escopado por posse (tenant + owner_estudante_id) via service role.
 */
export default async function ResultadoPersonalizadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sessao = await getSessaoAluno()
  const svc = createAdminClient()
  const estId = sessao!.estudanteId
  const tenantId = sessao!.tenantId

  // Simulado do próprio aluno (posse) + sessões finalizadas dele nesse simulado.
  const { data: sim } = await svc.from('simulado_simulados')
    .select('id, titulo')
    .eq('id', id).eq('tenant_id', tenantId).eq('owner_estudante_id', estId).eq('deletado', false).maybeSingle()
  if (!sim) redirect('/aluno/simulados?aba=personalizados')

  const { data: sess } = await svc.from('simulado_sessoes_prova')
    .select('id, status, nota, iniciado_em, finalizado_em, posicao_ranking, tentativa_num')
    .eq('estudante_id', estId).eq('simulado_id', id).eq('is_teste', false).eq('deletado', false).eq('status', 'finalizada')
  const finalizadas = (sess ?? []) as any[]
  if (!finalizadas.length) redirect(`/aluno/simulados/personalizados/${id}/fazer`)

  // Melhor tentativa (nota; desempate pela mais recente) — para o hero.
  const melhor = [...finalizadas].sort((a, b) => (Number(b.nota ?? -1) - Number(a.nota ?? -1)) || (new Date(b.finalizado_em ?? 0).getTime() - new Date(a.finalizado_em ?? 0).getTime()))[0]
  const sessoesInput: SessaoInput[] = finalizadas.map((s) => ({
    id: s.id, tentativa_num: s.tentativa_num, nota: s.nota, iniciado_em: s.iniciado_em, finalizado_em: s.finalizado_em, posicao_ranking: s.posicao_ranking,
  }))
  // Pessoal: gabarito SEMPRE revelado (é o estudo do próprio aluno).
  const { tentativas, questoes } = await montarResultadoAluno(svc, id, sessoesInput, true)

  return (
    <div className="animate-page space-y-5">
      <Link href="/aluno/simulados?aba=personalizados" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Meus simulados
      </Link>

      {/* HERO — igual ao resultado oficial, com Refazer + Editar (personalizado). */}
      <div className="relative overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/25 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resultado · Personalizado</p>
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{sim.titulo}</h1>
            {finalizadas.length > 1 && <p className="mt-1 text-sm text-muted-foreground">{finalizadas.length} tentativas realizadas</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-3">
            <div className="text-right">
              <div className={cn('text-4xl font-extrabold tabular-nums', melhor.nota != null && notaTone(Number(melhor.nota)))}>{fmtNota(melhor.nota)}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">melhor nota</div>
            </div>
            <div className="flex items-center gap-2">
              <ExcluirPersonalizadoButton simuladoId={id} titulo={sim.titulo} />
              <Link href={`/aluno/simulados/personalizados/${id}`} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted">
                <Pencil className="h-4 w-4" /> Editar
              </Link>
              <Link href={`/aluno/simulados/personalizados/${id}/fazer`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90">
                <RotateCcw className="h-4 w-4" /> Refazer
              </Link>
            </div>
          </div>
        </div>
      </div>

      <MeuSimuladoView
        tentativas={tentativas}
        questoes={questoes}
        comparativo={COMPARATIVO_VAZIO}
        desempenho={[]}
        notaLiberada
        gabaritoLiberado
        cadernoLiberado={false}
        cadernoId={null}
        modalidades={[]}
        estId={estId}
        simuladoId={id}
        simuladoTitulo={sim.titulo}
        ocultarComparativo
      />
    </div>
  )
}
