// Tipos de actions.ts — sem 'use server' para não quebrar o next build
import type { RegraFiltros, InicioConfig, FimConfig } from '@/lib/integracoes/liberacao/tipos'
export type { RegraFiltros, InicioConfig, FimConfig }

export interface SalvarRegraInput {
  id?: string
  nome: string
  status?: 'active' | 'paused'
  prioridade?: number
  filtros: RegraFiltros
  inicio: InicioConfig
  fim: FimConfig
  produtoIds: string[]
}
