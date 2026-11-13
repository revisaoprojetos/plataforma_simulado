// Tipos das ações em LOTE da Biblioteca (fora do 'use server' para não quebrar o next build).
import type { Categoria } from './actions-tipos'

/** Limites: ids de ENTRADA por chamada e documentos RESOLVIDOS (pastas expandidas). */
export const LOTE_MAX_IDS = 500
export const LOTE_MAX_DOCS = 1000

export type StatusLote = 'rascunho' | 'publicado' | 'arquivado'
export type ModoAcessoLote = 'herdar' | 'todos' | 'restrito' | 'bloquear'

/** Alvo do lote: documentos e/ou pastas (pasta vale para os documentos contidos). */
export type AlvoLote = {
  docIds: string[]
  pastaIds: string[]
  incluirSubpastas: boolean
  categoria: Categoria
}

export type AcaoLote =
  | { tipo: 'mover'; destinoId: string | null }
  | { tipo: 'categoria'; categoria: Categoria }
  | { tipo: 'status'; status: StatusLote }
  | { tipo: 'acesso'; modo: ModoAcessoLote; grupoIds?: string[]; gruposModo?: 'substituir' | 'adicionar' }
  | { tipo: 'visibilidade'; oculto: boolean }
  | { tipo: 'legenda'; ocultarTabela?: boolean | null; categorias?: boolean }
  | { tipo: 'lixeira' }

export type PreviaLote = {
  ok: boolean; error?: string
  totalDocs: number
  totalPastas: number
  /** true = a pasta tem mais documentos que o limite por chamada (nada é aplicado). */
  excedeu: boolean
  /** Primeiros documentos (amostra p/ a prévia). */
  amostra: { id: string; titulo: string }[]
  /** Todos os ids resolvidos (≤ LOTE_MAX_DOCS) — usado p/ "Registrar atualização". */
  docIds: string[]
}

export type ItemResultadoLote = { id: string; titulo: string; ok: boolean; erro?: string }

export type ResultadoLote = {
  ok: boolean; error?: string
  total: number; sucesso: number; falhas: number
  itens: ItemResultadoLote[]
  porAcao: { tipo: AcaoLote['tipo']; ok: number; falhas: number }[]
}
