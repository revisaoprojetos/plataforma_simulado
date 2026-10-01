'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Bloco colapsável PADRÃO da plataforma (use sempre que houver expandir/recolher).
 *
 * - Animação suave de altura via grid `0fr ↔ 1fr` + `overflow-hidden` (sem max-height mágico).
 * - O conteúdo fica SEMPRE montado (só colapsa a altura) → não perde estado "não salvo"/foco/registro.
 * - Fechado = barra fina com o título + ▼; aberto = o conteúdo com um ▲ no topo-direito (padrão).
 * - A barra (fechada) e o conteúdo (aberto) animam em sentidos opostos ao mesmo tempo (sem "pulo").
 */
export function BlocoColapsavel({ titulo, aberto, onToggle, children, className }: {
  titulo: string
  aberto: boolean
  onToggle: () => void
  children: React.ReactNode
  className?: string
}) {
  const DUR = 'transition-all duration-300 ease-out motion-reduce:transition-none'
  return (
    <div className={className}>
      {/* Barra (visível fechado) — colapsa a altura ao abrir. */}
      <div className={cn('grid', DUR)} style={{ gridTemplateRows: aberto ? '0fr' : '1fr', opacity: aberto ? 0 : 1 }}>
        <div className="overflow-hidden">
          <button type="button" onClick={onToggle}
            className="flex w-full items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-muted/40">
            <span className="flex-1 truncate text-sm font-semibold">{titulo}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Conteúdo (visível aberto) — cresce a altura ao abrir. */}
      <div className={cn('grid', DUR)} style={{ gridTemplateRows: aberto ? '1fr' : '0fr', opacity: aberto ? 1 : 0 }}>
        <div className="overflow-hidden">
          <div className="relative">
            <button type="button" onClick={onToggle} title="Recolher" aria-label={`Recolher ${titulo}`}
              className="absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <ChevronUp className="h-4 w-4" />
            </button>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
