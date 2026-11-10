// Tipos exportados por biblioteca/capa-actions.ts — fora do 'use server' para não quebrar o next build.

import type { ModoCP, Resolvido } from '@/lib/conteudo/capa-pagina'

export type AlvoCP = { tipo: 'pasta' | 'documento'; id: string }

export interface DadosCP {
  capaUrl: string | null
  capaModo: ModoCP
  paginaInicial: number | null
  paginaInicialModo: ModoCP
}

export interface EstadoCP {
  ok: boolean; error?: string
  migrado: boolean
  titulo: string
  atual: DadosCP
  herdado: { capa: Resolvido<string>; pagina: Resolvido<number> }
  alcance?: number
}
