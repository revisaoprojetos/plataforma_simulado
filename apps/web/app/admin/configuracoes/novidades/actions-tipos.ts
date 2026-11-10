// Tipos exportados por configuracoes/novidades/actions.ts — fora do 'use server' para não quebrar o next build.

import type { Novidade, CategoriaNovidade } from '@/lib/novidades/novidades'

export type NovidadeAdmin = Novidade & { ativo: boolean; criado_em: string }
export type NovidadeInput = {
  categoria: CategoriaNovidade
  titulo: string
  descricao?: string | null
  destaque?: boolean
  coverUrl?: string | null
  ctaLabel?: string | null
  ctaUrl?: string | null
  cta2Label?: string | null
  cta2Url?: string | null
  publicadoEm?: string | null
  ativo?: boolean
}
