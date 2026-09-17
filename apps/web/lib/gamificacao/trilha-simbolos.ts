import {
  Check, Star, Play, Lock, Trophy, Crown, Flag, Flame, Zap, Heart, Award, Medal,
  Rocket, Target, BookOpen, GraduationCap, Sparkles, Gem, Sword, Shield, Brain,
  CircleCheck, ThumbsUp, Smile, type LucideIcon,
} from 'lucide-react'

/**
 * Símbolos dos nós da trilha (gamificação), configuráveis por tenant em "Aparência".
 * Guardado migration-free em `simulado_tenants.tema.gam_trilha_simbolos` (jsonb).
 */
export type SimboloEstado = 'concluido' | 'atual' | 'disponivel'

export interface SimboloConfig {
  /** 'icone' = usa um ícone da lista curada; 'imagem' = usa uma imagem importada (URL). */
  tipo: 'icone' | 'imagem'
  /** Nome do ícone (chave em ICONES_TRILHA) quando tipo='icone'. */
  icone: string
  /** URL da imagem quando tipo='imagem'. */
  imagemUrl: string | null
  /** Tamanho relativo do símbolo em px (o nó em si tem tamanho fixo). */
  tamanho: number
  /** Cor de fundo do nó (círculo). null = usa o padrão do estado. */
  corFundo: string | null
  /** Cor do ícone (ou tinta da imagem). null = usa o padrão do estado. */
  corSimbolo: string | null
}

export type TrilhaSimbolos = Record<SimboloEstado, SimboloConfig>

/** Ícones oferecidos no seletor (curados — nomes estáveis usados na config). */
export const ICONES_TRILHA: Record<string, LucideIcon> = {
  Check, CircleCheck, Star, Play, Lock, Trophy, Crown, Flag, Flame, Zap, Heart,
  Award, Medal, Rocket, Target, BookOpen, GraduationCap, Sparkles, Gem, Sword,
  Shield, Brain, ThumbsUp, Smile,
}

/** Lista ordenada dos nomes p/ o seletor. */
export const ICONES_TRILHA_NOMES = Object.keys(ICONES_TRILHA)

export const DEFAULT_TRILHA_SIMBOLOS: TrilhaSimbolos = {
  concluido: { tipo: 'icone', icone: 'Check', imagemUrl: null, tamanho: 28, corFundo: null, corSimbolo: null },
  atual: { tipo: 'icone', icone: 'Star', imagemUrl: null, tamanho: 28, corFundo: null, corSimbolo: null },
  disponivel: { tipo: 'icone', icone: 'Play', imagemUrl: null, tamanho: 24, corFundo: null, corSimbolo: null },
}

/** Cores PADRÃO de cada estado (valores CSS, espelham a trilha) — usadas quando não há override. */
export const DEFAULT_CORES: Record<SimboloEstado, { fundo: string; borda: string; simbolo: string }> = {
  concluido: { fundo: '#10b981', borda: '#059669', simbolo: '#ffffff' },
  atual: { fundo: 'color-mix(in oklab, var(--primary) 16%, var(--card))', borda: 'var(--primary)', simbolo: 'var(--primary)' },
  disponivel: { fundo: 'var(--muted)', borda: 'var(--border)', simbolo: 'var(--muted-foreground)' },
}

/** Fallback em HEX p/ os seletores de cor (o input type=color não aceita var()/color-mix). */
export const DEFAULT_CORES_HEX: Record<SimboloEstado, { fundo: string; simbolo: string }> = {
  concluido: { fundo: '#10b981', simbolo: '#ffffff' },
  atual: { fundo: '#6d28d9', simbolo: '#6d28d9' },
  disponivel: { fundo: '#e5e7eb', simbolo: '#6b7280' },
}

/** Cores EFETIVAS do nó (override do tenant ou o padrão do estado). */
export function coresNo(estado: SimboloEstado, c: SimboloConfig): { fundo: string; borda: string; simbolo: string } {
  const d = DEFAULT_CORES[estado]
  return {
    fundo: c.corFundo || d.fundo,
    borda: c.corFundo ? `color-mix(in oklab, ${c.corFundo} 82%, #000)` : d.borda,
    simbolo: c.corSimbolo || d.simbolo,
  }
}

export const SIMBOLO_ESTADOS: { id: SimboloEstado; label: string; hint: string }[] = [
  { id: 'concluido', label: 'Concluído', hint: 'Nós já finalizados pelo aluno.' },
  { id: 'atual', label: 'Em andamento', hint: 'O nó atual (destaque).' },
  { id: 'disponivel', label: 'Disponível', hint: 'Nós liberados ainda não feitos.' },
]

/** Normaliza uma config parcial (do jsonb) contra os defaults — tolerante a campos ausentes. */
function normalizar(base: SimboloConfig, raw: unknown): SimboloConfig {
  const r = (raw ?? {}) as Partial<SimboloConfig>
  const tipo = r.tipo === 'imagem' ? 'imagem' : 'icone'
  const tamanho = typeof r.tamanho === 'number' && r.tamanho >= 12 && r.tamanho <= 64 ? r.tamanho : base.tamanho
  const icone = typeof r.icone === 'string' && ICONES_TRILHA[r.icone] ? r.icone : base.icone
  const imagemUrl = typeof r.imagemUrl === 'string' && r.imagemUrl ? r.imagemUrl : null
  const corFundo = typeof r.corFundo === 'string' && r.corFundo ? r.corFundo : null
  const corSimbolo = typeof r.corSimbolo === 'string' && r.corSimbolo ? r.corSimbolo : null
  // Se pediu imagem mas não tem URL, cai no ícone (evita nó vazio).
  return { tipo: tipo === 'imagem' && !imagemUrl ? 'icone' : tipo, icone, imagemUrl, tamanho, corFundo, corSimbolo }
}

/** Resolve os símbolos a partir do jsonb cru (`{ concluido, atual, disponivel }`), com fallback aos defaults. */
export function resolverSimbolosRaw(raw0: unknown): TrilhaSimbolos {
  const raw = (raw0 ?? {}) as Record<string, unknown>
  return {
    concluido: normalizar(DEFAULT_TRILHA_SIMBOLOS.concluido, raw.concluido),
    atual: normalizar(DEFAULT_TRILHA_SIMBOLOS.atual, raw.atual),
    disponivel: normalizar(DEFAULT_TRILHA_SIMBOLOS.disponivel, raw.disponivel),
  }
}

/** Resolve os símbolos a partir do tema do tenant (jsonb `gam_trilha_simbolos`). */
export function resolverTrilhaSimbolos(tema: unknown): TrilhaSimbolos {
  return resolverSimbolosRaw((tema as { gam_trilha_simbolos?: unknown } | null)?.gam_trilha_simbolos)
}
