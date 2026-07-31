'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'

/**
 * Botão flutuante de recolher/expandir, à FRENTE da sidebar, na altura da divisória
 * entre o cabeçalho (logo) e o primeiro item do menu (~56px = altura do header h-14).
 * Renderize-o como filho do container `relative` da coluna principal (fica em `left-0`,
 * centrado sobre a borda). Substitui o antigo SidebarTrigger da topbar (removida).
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
      className="absolute left-0 top-14 z-50 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-md transition-all duration-200 hover:scale-110 hover:border-primary/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
    </button>
  )
}
