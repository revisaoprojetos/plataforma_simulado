'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

/**
 * Botão flutuante de recolher/expandir, À FRENTE da sidebar, na altura da divisória
 * entre o cabeçalho (logo) e o primeiro item do menu (top-14 = 56px do header).
 *
 * É `fixed` (não `absolute`) de propósito: a coluna de conteúdo tem `overflow-hidden`,
 * que cortava a metade do botão que fica sobre a sidebar. Como `fixed` escapa do clip,
 * ele aparece inteiro. O `left` segue a largura real da sidebar (via CSS vars) e desliza
 * junto com o colapso. `mode` diz como fica a largura recolhida (ícone x escondida).
 *
 * `variant`:
 *  - 'default' → pílula neutra (visual legado; usado no admin).
 *  - 'revisao' → botão redondo roxo SEM borda, 30×30, na altura do logo, com UMA única
 *    seta (chevron-esquerda) que GIRA 180° ao recolher. Transição .38s cubic-bezier(.22,1,.36,1),
 *    hover scale 1.1 + anel. Spec 03 §2.2 (redesign da marca Revisão).
 */
export function SidebarEdgeToggle({
  mode = 'icon',
  hideOnMobile = false,
  variant = 'default',
}: {
  mode?: 'icon' | 'offcanvas'
  hideOnMobile?: boolean
  variant?: 'default' | 'revisao'
}) {
  const { toggleSidebar, state, isMobile } = useSidebar()
  const collapsed = state === 'collapsed'
  const left = isMobile
    ? '0px'
    : collapsed
      ? (mode === 'offcanvas' ? '0px' : 'var(--sidebar-width-icon)')
      : 'var(--sidebar-width)'

  if (variant === 'revisao') {
    // Botão da marca Revisão: redondo, roxo, sem borda, na altura do logo (header = 56px → ~29px do topo).
    // Uma só seta que gira; o `left` desliza junto com a largura (264 ⇄ 84).
    return (
      <button
        type="button"
        onClick={toggleSidebar}
        title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        style={{ left, top: '29px' }}
        className={cn(
          'group/sbcol fixed z-50 flex h-[30px] w-[30px] -translate-x-1/2 items-center justify-center rounded-full border-0 text-white shadow-[0_6px_14px_-4px_rgba(20,8,60,.6)] transition-[left,transform,box-shadow] duration-[380ms] ease-[cubic-bezier(.22,1,.36,1)] bg-[#3A27A0] dark:bg-[#2A1D66] hover:scale-110 hover:shadow-[0_6px_14px_-4px_rgba(20,8,60,.6),0_0_0_4px_rgba(91,63,208,.22)] motion-reduce:transition-none',
          hideOnMobile && 'max-md:hidden',
        )}
      >
        {/* Uma única seta que gira — expandida aponta p/ esquerda; recolhida vira 180°. */}
        <ChevronLeft
          className={cn(
            'h-4 w-4 transition-transform duration-[380ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none',
            collapsed && 'rotate-180',
          )}
          strokeWidth={2.6}
        />
      </button>
    )
  }

  return (
    <button
      type="button"
      data-edge-toggle="default"
      onClick={toggleSidebar}
      title={collapsed ? 'Expandir menu' : 'Recolher menu'}
      aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
      style={{ left, top: '3.5rem' }}
      className={cn(
        'fixed z-50 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-md transition-[left,transform,background-color,border-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-110 hover:border-primary/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        hideOnMobile && 'max-md:hidden',
      )}
    >
      {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
    </button>
  )
}
