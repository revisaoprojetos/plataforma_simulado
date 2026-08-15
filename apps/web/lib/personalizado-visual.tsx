import type { ComponentType } from 'react'
import {
  Wand2, Sparkles, Star, Target, Trophy, Flame, Rocket, Lightbulb,
  BookOpen, Scale, Gavel, Landmark, GraduationCap, Brain, ListChecks, PenLine,
} from 'lucide-react'

/** Paleta de cores e ícones da "capa" (frente do card) dos simulados personalizados do aluno. */
export const PERSONALIZADO_CORES = ['#6d28d9', '#8b5cf6', '#4f7fff', '#0ea5e9', '#06b6d4', '#10b981', '#84cc16', '#f59e0b', '#ef4444', '#f43f7f', '#ec4899', '#64748b']

export const PERSONALIZADO_ICONES: Record<string, ComponentType<{ className?: string }>> = {
  varinha: Wand2, brilho: Sparkles, estrela: Star, alvo: Target, trofeu: Trophy, fogo: Flame,
  foguete: Rocket, lampada: Lightbulb, livro: BookOpen, balanca: Scale, martelo: Gavel,
  predio: Landmark, formatura: GraduationCap, cerebro: Brain, lista: ListChecks, caneta: PenLine,
}
export const ICONES_LISTA = Object.keys(PERSONALIZADO_ICONES)

export const COR_PADRAO = '#6d28d9'   // roxo da marca (default histórico do card)
export const ICONE_PADRAO = 'varinha' // Wand2 (default histórico do card)

/** Componente do ícone escolhido (cai no padrão se a chave for inválida/ausente). */
export function iconePersonalizado(icone?: string | null): ComponentType<{ className?: string }> {
  return PERSONALIZADO_ICONES[icone ?? ''] ?? PERSONALIZADO_ICONES[ICONE_PADRAO]
}

export type VisualPersonalizado = { cor: string; icone: string }

/** Lê o visual de `regras.visual` (jsonb) com defaults — tolerante a valores inválidos. */
export function resolverVisualPessoal(regras: any): VisualPersonalizado {
  const v = (regras && typeof regras === 'object' ? regras.visual : null) ?? {}
  const cor = typeof v.cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.cor) ? v.cor : COR_PADRAO
  const icone = typeof v.icone === 'string' && PERSONALIZADO_ICONES[v.icone] ? v.icone : ICONE_PADRAO
  return { cor, icone }
}
