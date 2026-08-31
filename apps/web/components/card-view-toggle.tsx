'use client'

import { useEffect, useState } from 'react'
import { LayoutGrid, StretchHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Estilo de visualização dos cards de simulado: 'poster' (atual, 4:5) ou 'ticket' (baixo/retangular). */
export type CardView = 'poster' | 'ticket'

/** Persiste a escolha por área (localStorage). `scope` separa admin × aluno (ex.: 'admin-simulados'). */
export function useCardView(scope: string, inicial: CardView = 'poster'): [CardView, (v: CardView) => void] {
  const [view, setView] = useState<CardView>(inicial)
  useEffect(() => {
    try { const v = localStorage.getItem(`cardview:${scope}`); if (v === 'poster' || v === 'ticket') setView(v) } catch { /* storage indisponível */ }
  }, [scope])
  const set = (v: CardView) => {
    setView(v)
    try { localStorage.setItem(`cardview:${scope}`, v) } catch { /* storage indisponível */ }
  }
  return [view, set]
}

/** Alternador segmentado Pôster ↔ Ticket (mesmo visual dos demais toggles de vista do sistema). */
export function CardViewToggle({ value, onChange, className }: { value: CardView; onChange: (v: CardView) => void; className?: string }) {
  const opts: [CardView, string, typeof LayoutGrid][] = [
    ['poster', 'Pôster', LayoutGrid],
    ['ticket', 'Ticket', StretchHorizontal],
  ]
  return (
    <div className={cn('flex gap-1 rounded-lg bg-[var(--tab-bg,var(--muted))] p-1', className)}>
      {opts.map(([v, label, Icon]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          title={`Visualização em ${label.toLowerCase()}`}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors',
            value === v
              ? 'bg-[var(--tab-active,var(--background))] text-[color:var(--tab-active-foreground,var(--foreground))] shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}
