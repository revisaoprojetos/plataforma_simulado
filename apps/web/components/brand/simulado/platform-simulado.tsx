'use client'

// Switch por marca do FLUXO DO SIMULADO (spec 06). Fase 5 — PREVIEW/mock apenas.
// Produção (motor de prova em /simulado/[token]) permanece intacta; wiring ao backend é rodada futura.

import { SimuladoRevisao } from './simulado-revisao'
import { SimuladoVND } from './simulado-vnd'
import { SimuladoMEQ } from './simulado-meq'
import type { Brand, Tela, SimScreenProps } from './types'

export interface PlatformSimuladoProps extends SimScreenProps {
  brand: Brand
  tela: Tela
}

export function PlatformSimulado({ brand, ...rest }: PlatformSimuladoProps) {
  if (brand === 'vnd') return <SimuladoVND {...rest} />
  if (brand === 'meq') return <SimuladoMEQ {...rest} />
  return <SimuladoRevisao {...rest} />
}
