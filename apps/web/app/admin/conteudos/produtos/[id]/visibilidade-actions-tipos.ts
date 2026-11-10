import type { Segmento } from '@/lib/segmentos/tipos'

export type SegmentoAdmin = Segmento & { uso: number }

export interface AlvosProduto {
  modulos: { id: string; titulo: string; pai_id: string | null }[]
  aulas: { id: string; titulo: string; modulo_id: string }[]
}

export type AlvoNome = { titulo: string; sub: string | null }
