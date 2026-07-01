'use client'

import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Botão sol/lua para alternar o tema claro/escuro nas top bars do simulado. */
export function ThemeToggle({ dark, onToggle, className }: { dark: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={dark ? 'Tema claro' : 'Tema escuro'}
      aria-label={dark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground', className)}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
