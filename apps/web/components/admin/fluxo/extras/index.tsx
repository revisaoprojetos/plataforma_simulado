import type { ComponentType } from 'react'
import { SimuladorFaixa } from './simulador-faixa'

export interface PropsExtra {
  /** Destaca esses nós no canvas (null limpa). */
  onCaminho: (ids: string[] | null) => void
  /** Troca o diagrama exibido. */
  irPara: (diagramaId: string) => void
}

/** Complementos de UI que um adaptador pode pedir em `DadosFluxo.extras` (por nome). Novo extra = um componente + uma linha aqui. */
export const EXTRAS: Record<string, ComponentType<PropsExtra>> = {
  'simulador-faixa': SimuladorFaixa,
}
