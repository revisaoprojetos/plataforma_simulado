import { Suspense } from 'react'
import { obterPainelLiberacao } from './actions'
import { LiberacaoClient } from './liberacao-client'
import { TituloTela } from '@/components/admin/cronograma/titulo-tela'
import { EsqueletoTela } from '@/components/admin/cronograma/esqueleto-tela'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — liberação dos materiais por data do plano de cada aluno.
// Título primeiro; o painel (mapa de documentos cacheado 5 min + contagens) chega por streaming.
export default function CronogramaAdaptativoPage() {
  return (
    <div className="w-full space-y-4">
      <TituloTela titulo="Liberação" descricao={<>Controle quando os materiais do cronograma ficam disponíveis para cada aluno. Com o bloqueio ligado,
          o aluno só abre e baixa o material quando a meta dele chega — no cronograma e na Biblioteca.</>} />
      <Suspense fallback={<EsqueletoTela linhas={6} />}><CorpoLiberacao /></Suspense>
    </div>
  )
}

async function CorpoLiberacao() {
  const r = await obterPainelLiberacao()
  return !r.ok || !r.painel ? (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{r.error ?? 'Falha ao carregar.'}</div>
  ) : (
    <LiberacaoClient inicial={r.painel} />
  )
}
