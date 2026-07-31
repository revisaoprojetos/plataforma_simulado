'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'

/**
 * Botão flutuante de recolher/expandir, À FRENTE da sidebar, na altura da divisória
 * entre o cabeçalho (logo) e o primeiro item do menu (top-14 = 56px do header).
 *
 * É `fixed` (não `absolute`) de propósito: a coluna de conteúdo tem `overflow-hidden`,
 * que cortava a metade do botão que fica sobre a sidebar. Como `fixed` escapa do clip,
 * ele aparece inteiro. O `left` segue a largura real da sidebar (via CSS vars) e desliza
 * junto com o colapso. `mode` diz como fica a largura recolhida (ícone x escondida).
 */
export function SidebarEdgeToggle({ mode = 'icon' }: { mode?: 'icon' | 'offcanvas' }) {
  const { toggleSidebar, state, isMobile } = useSidebar()
  const collapsed = state === 'collapsed'
  const left = isMobile
    ? '0px'
    : collapsed
      ? (mode === 'offcanvas' ? '0px' : 'var(--sidebar-width-icon)')
      : 'var(--sidebar-width)'

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      title={collapsed ? 'Expandir menu' : 'Recolher menu'}
      aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
      style={{ left, top: '3.5rem' }}
      className="fixed z-50 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-md transition-[left,transform,background-color,border-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-110 hover:border-primary/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
    </button>
  )
}
