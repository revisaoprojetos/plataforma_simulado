// Tipos de actions.ts — sem 'use server' para não quebrar o next build
import type { SoftDeleteTabela } from '@/lib/soft-delete'
export type { SoftDeleteTabela }

export type LixeiraItem = {
  tabela: SoftDeleteTabela
  tipo: string
  id: string
  rotulo: string
  deletado_em: string | null
  deletado_por_nome: string | null
}
