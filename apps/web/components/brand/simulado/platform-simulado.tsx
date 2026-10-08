'use client'

// Switch por marca do FLUXO DO SIMULADO (spec 06).
// CODE-SPLIT por marca (next/dynamic): cada marca (entrada+prova+resultado) é pesada; carregar as 3
// em TODA página de simulado inflava o bundle e a compilação do dev (>1min no 1º acesso). Agora só a
// marca efetivamente usada é baixada/compilada.

import dynamic from 'next/dynamic'
import type { Brand, Tela, SimScreenProps } from './types'

const SimuladoRevisao = dynamic(() => import('./simulado-revisao').then((m) => m.SimuladoRevisao))
const SimuladoVND = dynamic(() => import('./simulado-vnd').then((m) => m.SimuladoVND))
const SimuladoMEQ = dynamic(() => import('./simulado-meq').then((m) => m.SimuladoMEQ))

export interface PlatformSimuladoProps extends SimScreenProps {
  brand: Brand
  tela: Tela
}

export function PlatformSimulado({ brand, ...rest }: PlatformSimuladoProps) {
  if (brand === 'vnd') return <SimuladoVND {...rest} />
  if (brand === 'meq') return <SimuladoMEQ {...rest} />
  return <SimuladoRevisao {...rest} />
}
