import type { Nivel } from '@/lib/ia/agentes/niveis'

export interface NivelAgregado { nivel: Nivel; label: string; modelo: string; itens: number; entrada: number; saida: number; custoUSD: number }
export type ResultadoDemo =
  | { ok: false; erro: string }
  | { ok: true; uso: { entrada: number; saida: number; custoUSD: number; chamadas: number }; niveis: NivelAgregado[]; resultados: any[]; trace: any[] }
