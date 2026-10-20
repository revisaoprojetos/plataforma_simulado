import type { Provedor } from '../config'

// NÍVEIS do sistema multi-agents — modelo barato/rápido embaixo, forte/caro em cima. A ideia é otimizar
// tokens e agilidade: o Haiku filtra/roteia barato (triagem), o Sonnet faz o grosso em paralelo
// (execução) e o Opus só entra no que é difícil/consolidação. Cada nível tem um modelo por provedor.
export type Nivel = 'triagem' | 'execucao' | 'consolidacao'

export const NIVEIS: Nivel[] = ['triagem', 'execucao', 'consolidacao']

export const NIVEL_LABEL: Record<Nivel, string> = {
  triagem: 'Triagem (rápido/barato)',
  execucao: 'Execução (equilíbrio)',
  consolidacao: 'Consolidação (forte)',
}

// Modelo de cada nível por provedor. Anthropic é o alvo (escolha do usuário); os demais ficam mapeados
// pra não travar se a chave do tenant for de outro provedor.
export const MODELO_POR_NIVEL: Record<Provedor, Record<Nivel, string>> = {
  anthropic: { triagem: 'claude-haiku-4-5-20251001', execucao: 'claude-sonnet-4-6', consolidacao: 'claude-opus-4-8' },
  openai: { triagem: 'gpt-4o-mini', execucao: 'gpt-4o', consolidacao: 'gpt-4o' },
  gemini: { triagem: 'gemini-2.0-flash', execucao: 'gemini-2.5-flash', consolidacao: 'gemini-1.5-pro' },
}

// Custo aproximado em US$ por MILHÃO de tokens (entrada/saída) — só pra ESTIMAR custo e orientar a
// otimização; ajuste conforme a tabela real do provedor. Modelo ausente = custo 0 (não estimado).
export const CUSTO_MTOK: Record<string, { entrada: number; saida: number }> = {
  'claude-haiku-4-5-20251001': { entrada: 1, saida: 5 },
  'claude-sonnet-4-6': { entrada: 3, saida: 15 },
  'claude-opus-4-8': { entrada: 15, saida: 75 },
  'gpt-4o-mini': { entrada: 0.15, saida: 0.6 },
  'gpt-4o': { entrada: 2.5, saida: 10 },
}

/** Modelo a usar para um nível no provedor do tenant (cai no modelo da config se não mapeado). */
export function modeloDoNivel(provider: Provedor, nivel: Nivel, fallback: string): string {
  return MODELO_POR_NIVEL[provider]?.[nivel] || fallback
}

/** Custo estimado (US$) de um uso de tokens num dado modelo. */
export function custoUSD(modelo: string, usage: { entrada: number; saida: number }): number {
  const c = CUSTO_MTOK[modelo]
  if (!c) return 0
  return (usage.entrada * c.entrada + usage.saida * c.saida) / 1_000_000
}
