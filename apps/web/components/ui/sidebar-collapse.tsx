'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'

/**
 * Botão flutuante de recolher/expandir, posicionado no MEIO da divisória entre a
 * sidebar e a área de conteúdo. Renderize-o como filho do container `relative` da
 * coluna principal (fica em `left-0`, centrado sobre a borda). Substitui o antigo
 * SidebarTrigger da topbar (que foi removida).
 */
export function SidebarEdgeToggle() {
  const { toggleSidebar, state } = useSidebar()
  const collapsed = state === 'collapsed'
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      title={collapsed ? 'Expandir menu' : 'Recolher menu'}
      aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
      className="absolute left-0 top-1/2 z-30 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-md transition-all hover:scale-105 hover:border-primary/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
    </button>
  )
}
