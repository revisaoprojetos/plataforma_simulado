import { obterPainelLiberacao } from './actions'
import { LiberacaoClient } from './liberacao-client'
import { AdaptativoTabs } from '@/components/admin/adaptativo-tabs'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — liberação dos materiais por data do plano de cada aluno.
export default async function CronogramaAdaptativoPage() {
  const r = await obterPainelLiberacao()
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cronograma adaptativo · Liberação</h1>
        <p className="text-muted-foreground">
          Controle quando os materiais do cronograma ficam disponíveis para cada aluno. Com o bloqueio ligado,
          o aluno só abre e baixa o material quando a meta dele chega — no cronograma e na Biblioteca.
        </p>
      </div>
      <AdaptativoTabs />
      {!r.ok || !r.painel ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{r.error ?? 'Falha ao carregar.'}</div>
      ) : (
        <LiberacaoClient inicial={r.painel} />
      )}
    </div>
  )
}
