import { redirect } from 'next/navigation'
import { Route } from 'lucide-react'
import { carregarTrilhasAluno } from '@/lib/aluno/trilhas'
import { TrilhaGigante } from '@/components/aluno/trilha-simulados'
import { GamificacaoRail } from '@/components/aluno/gamificacao-rail'
import { MascoteTour } from '@/components/mascote/mascote-tour'

export default async function TrilhaAlunoPage() {
  const { trilhas, gamAtivo, gam } = await carregarTrilhasAluno()
  // Trilha é recurso de gamificação — some por completo quando a gamificação está desativada.
  if (!gamAtivo) redirect('/aluno')
  const totalSims = trilhas.reduce((a, t) => a + t.total, 0)
  const totalDone = trilhas.reduce((a, t) => a + t.done, 0)

  return (
    <div className="animate-page space-y-6">
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--brand-accent)', boxShadow: '0 0 10px 1px color-mix(in oklab, var(--brand-accent) 60%, transparent)' }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--brand-accent)' }}>Sua jornada</span>
        </div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-[2rem]"><Route className="h-6 w-6 text-primary" /> Trilha</h1>
        <p className="mt-1 text-muted-foreground">
          {totalSims > 0
            ? <>Sua trilha completa de simulados, dividida por grupo — <span className="font-semibold text-foreground">{totalDone}/{totalSims}</span> concluídos.</>
            : 'Você ainda não tem simulados na sua trilha.'}
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Coluna principal: a trilha gigante */}
        <div data-tour="trilha-pagina" className="min-w-0">
          {trilhas.length > 0 ? (
            <div className="overflow-x-auto pb-10">
              <TrilhaGigante trilhas={trilhas} gamAtivo={gamAtivo} />
            </div>
          ) : (
            <div className="rounded-2xl border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
              Assim que houver simulados disponíveis para você, eles aparecerão aqui como uma trilha.
            </div>
          )}
        </div>

        {/* Coluna direita: meta, sequência, missões, liga, conquistas (igual à Início) */}
        {gam && <GamificacaoRail resumo={gam.resumo} missoes={gam.missoes} semana={gam.semana} conquistas={gam.conquistas} config={gam.config} />}
      </div>

      {/* Continuação do tour da mascote (2º capítulo): retoma aqui quando veio da Início.
          Sem gate por gamAtivo — o tour se auto-gate pela fase salva (só roda se veio da Início). */}
      <MascoteTour ativo />
    </div>
  )
}
