'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { BookOpenText, Users, Settings2, Trophy, Route, ScrollText, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ModuloTab = 'aulas' | 'acessos' | 'config' | 'ranking' | 'relatorio' | 'trilha' | 'regulamento'
export const MODULO_TABS: { id: ModuloTab; label: string; Icon: typeof BookOpenText }[] = [
  { id: 'aulas', label: 'Aulas', Icon: BookOpenText },
  { id: 'trilha', label: 'Editar trilha', Icon: Route },
  { id: 'regulamento', label: 'Regulamento', Icon: ScrollText },
  { id: 'acessos', label: 'Acessos', Icon: Users },
  { id: 'ranking', label: 'Ranking', Icon: Trophy },
  { id: 'relatorio', label: 'Relatório', Icon: BarChart3 },
  { id: 'config', label: 'Configurações', Icon: Settings2 },
]

/**
 * Barra de abas do módulo (Aulas | Acessos | Configurações) com underline deslizante animado.
 * `claro` = versão sobre o banner (texto/underline brancos, sem borda). Navega por ?tab=.
 */
export function ModuloTabsBar({ pastaAtual, moduloTab, claro = false }: { pastaAtual: string; moduloTab: ModuloTab; claro?: boolean }) {
  const tabsRef = useRef<HTMLDivElement>(null)
  const [ind, setInd] = useState<{ left: number; width: number }>({ left: 0, width: 0 })
  useEffect(() => {
    const medir = () => {
      const el = tabsRef.current?.querySelector<HTMLElement>('[data-tab-ativo="1"]')
      if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth })
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [moduloTab])
  return (
    <div ref={tabsRef} className={cn('relative flex gap-8 pl-1 text-sm', claro ? 'border-b border-white/20' : 'border-b')}>
      {MODULO_TABS.map(({ id, label, Icon }) => (
        <Link key={id} data-tab-ativo={moduloTab === id ? '1' : '0'} href={`/admin/leitura?pasta=${pastaAtual}&tab=${id}`}
          className={cn('inline-flex items-center gap-1.5 rounded-md py-2 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40',
            moduloTab === id
              ? (claro ? 'text-white' : 'text-primary')
              : (claro ? 'text-white/70 hover:text-white' : 'text-muted-foreground hover:text-foreground'))}>
          <Icon className="h-4 w-4" /> {label}
        </Link>
      ))}
      <span className={cn('absolute bottom-[-1px] h-0.5 rounded-full transition-all duration-300 ease-out', claro ? 'bg-white' : 'bg-primary')} style={{ left: ind.left, width: ind.width }} />
    </div>
  )
}
