'use client'

import type { ComponentType } from 'react'
import {
  Home,
  ClipboardList,
  Library,
  Gavel,
  CalendarDays,
  Lightbulb,
  BookOpen,
  Trophy,
  type LucideProps,
} from 'lucide-react'

/**
 * Mapa nome (string do contrato AlunoNavItem.icon) → componente lucide.
 * Os nomes canônicos vêm da spec 03 §2.1 (Home, ClipboardList, Library, Gavel,
 * CalendarDays, Lightbulb, BookOpen, Trophy). Fallback = Home.
 */
const MAPA: Record<string, ComponentType<LucideProps>> = {
  Home,
  ClipboardList,
  Library,
  Gavel,
  CalendarDays,
  Lightbulb,
  BookOpen,
  Trophy,
}

export function NavIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = MAPA[name] ?? Home
  return <Icon {...props} />
}

/** Marca "R" da Revisão (contorno preenchido branco). `fill` controla a cor. */
export function MarcaR({ size = 40, fill = '#FFFFFF', className }: { size?: number; fill?: string; className?: string }) {
  return (
    <svg viewBox="0 0 68 66" aria-hidden="true" className={className} style={{ width: size * 1.025, height: size }}>
      <path
        fillRule="evenodd"
        fill={fill}
        d="M6 5.5H32C43.5 5.5 49 13 49 23C49 31 45 37 39.5 40.5L62 61H6Z M9.2 9.2H19.2V57.6H9.2Z"
      />
    </svg>
  )
}
