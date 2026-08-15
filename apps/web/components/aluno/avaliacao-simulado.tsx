'use client'

import { NpsAvaliacao } from '@/components/aluno/nps-avaliacao'
import { ReportarSimuladoCard } from '@/components/aluno/reportar-simulado-card'

/**
 * Conteúdo da aba "Avaliação" da tela de resultado: FEEDBACK (NPS "Como foi sua experiência?")
 * + REPORT ("Reportar um problema"). Fica numa aba própria p/ manter a "Visão geral" mais limpa.
 */
export function AvaliacaoSimulado({ sessaoId, mostrarNps = true }: { sessaoId?: string | null; mostrarNps?: boolean }) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      {mostrarNps && <NpsAvaliacao sessaoId={sessaoId} />}
      <ReportarSimuladoCard sessaoId={sessaoId} />
    </div>
  )
}
