// Tipos de actions.ts — sem 'use server' para não quebrar o next build

export type ModeloRow = {
  id: string; nome: string; modalidade: string | null; origem: string | null
  pasta_id: string | null; cor: string | null; capa_url: string | null; capa_card_url: string | null; atualizado_em: string | null
  config?: unknown // { v, item } — usado para a prévia da 1ª folha no card
}

export type PastaModeloRow = {
  id: string; nome: string; pai_id: string | null; cor: string | null; capa_url: string | null; capa_card_url: string | null
}
