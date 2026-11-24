import { obterPainelLiberacao } from './actions'
import { LiberacaoClient } from './liberacao-client'
import { TituloTela } from '@/components/admin/cronograma/titulo-tela'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — liberação dos materiais por data do plano de cada aluno.
export default async function CronogramaAdaptativoPage() {
  const r = await obterPainelLiberacao()
  return (
    <div className="w-full space-y-4">
      <TituloTela titulo="Liberação" descricao={<>Controle quando os materiais do cronograma ficam disponíveis para cada aluno. Com o bloqueio ligado,
          o aluno só abre e baixa o material quando a meta dele chega — no cronograma e na Biblioteca.</>} />
      {!r.ok || !r.painel ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{r.error ?? 'Falha ao carregar.'}</div>
      ) : (
        <LiberacaoClient inicial={r.painel} />
      )}
    </div>
  )
}
