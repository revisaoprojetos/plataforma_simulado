import {
  Rocket, Flame, Zap, Trophy, Medal, Award, Crown, Gem, Star, Target,
  Brain, BookOpen, GraduationCap, CalendarCheck, Clock, Heart, ThumbsUp, Sparkles, Shield, CheckCircle2,
  type LucideIcon,
} from 'lucide-react'

// Catálogo único de ícones de conquistas — usado no admin (editor) e no portal do aluno.
export const ICONES_CONQUISTA: Record<string, LucideIcon> = {
  rocket: Rocket, flame: Flame, zap: Zap, trophy: Trophy, medal: Medal, award: Award,
  crown: Crown, gem: Gem, star: Star, target: Target, brain: Brain, book: BookOpen,
  graduation: GraduationCap, calendar: CalendarCheck, clock: Clock, heart: Heart,
  thumbs: ThumbsUp, sparkles: Sparkles, shield: Shield, check: CheckCircle2,
}

export const ICONE_LABEL: Record<string, string> = {
  rocket: 'Foguete', flame: 'Chama', zap: 'Raio', trophy: 'Troféu', medal: 'Medalha', award: 'Prêmio',
  crown: 'Coroa', gem: 'Gema', star: 'Estrela', target: 'Alvo', brain: 'Cérebro', book: 'Livro',
  graduation: 'Formatura', calendar: 'Calendário', clock: 'Relógio', heart: 'Coração',
  thumbs: 'Curtida', sparkles: 'Brilho', shield: 'Escudo', check: 'Concluído',
}

export const ICONE_OPCOES = Object.keys(ICONES_CONQUISTA).map((v) => ({ v, label: ICONE_LABEL[v] ?? v }))

export const iconeConquista = (chave: string): LucideIcon => ICONES_CONQUISTA[chave] ?? Award

// Paleta padrão + cor determinística por chave (fallback quando a conquista não tem cor definida).
export const CORES_CONQUISTA = ['#f59e0b', '#0ea5e9', '#8b5cf6', '#10b981', '#ef4444', '#ec4899', '#14b8a6', '#6366f1', '#f97316', '#84cc16']
export function corConquista(chave: string): string {
  let h = 0
  for (let i = 0; i < chave.length; i++) h = (h * 31 + chave.charCodeAt(i)) >>> 0
  return CORES_CONQUISTA[h % CORES_CONQUISTA.length]
}

// Animação de hover por ícone (classes .ico-* definidas em globals.css; rodam no hover do card .group).
const ANIM_POR_ICONE: Record<string, string> = {
  rocket: 'ico-rocket',   // voa para fora e volta do outro lado
  flame: 'ico-flame',     // tremor de fogo
  trophy: 'ico-spin',     // girando
  medal: 'ico-swing',     // balançando
  gem: 'ico-glow',        // soltando brilho
  crown: 'ico-bob',       // flutuando
  star: 'ico-spin',       // girando
  zap: 'ico-flash',       // piscando
  award: 'ico-pop',       // pulsando
  target: 'ico-pop',
  brain: 'ico-heartbeat',
  heart: 'ico-heartbeat',
  sparkles: 'ico-glow',
  shield: 'ico-bob',
  book: 'ico-bob',
  graduation: 'ico-bob',
  calendar: 'ico-bob',
  clock: 'ico-spin',
  thumbs: 'ico-pop',
  check: 'ico-pop',
}
export const animConquista = (chave: string): string => ANIM_POR_ICONE[chave] ?? 'ico-bob'
