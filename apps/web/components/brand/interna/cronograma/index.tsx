'use client'

// CRONOGRAMA (spec 05 §3) — switch por marca. Cada marca tem composição PRÓPRIA
// (Revisão/VND/MEQ): gerar (wizard 4 passos) · meus cronogramas · plano aberto (grade+lista).
// Preview sobre mock (produção intacta). Responsivo (≤640px = board mobile) por marca.

import type { InternaScreenProps } from '../types'
import { useIsMobile } from '../perfil/use-is-mobile'
import { CronogramaRevisao } from './cronograma-revisao'
import { CronogramaVnd } from './cronograma-vnd'
import { CronogramaMeq } from './cronograma-meq'

export function PlatformCronograma({ brand, theme, tab }: InternaScreenProps) {
  const mobile = useIsMobile()
  if (brand === 'vnd') return <CronogramaVnd theme={theme} tab={tab} mobile={mobile} />
  if (brand === 'meq') return <CronogramaMeq theme={theme} tab={tab} mobile={mobile} />
  return <CronogramaRevisao theme={theme} tab={tab} mobile={mobile} />
}
