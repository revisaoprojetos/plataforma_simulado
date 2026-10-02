'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Settings2, Users, Medal, Trophy, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'

export type JurisTab = 'dias' | 'config' | 'designer' | 'acessos' | 'medalhas' | 'ranking'

const TABS: { id: JurisTab; label: string; Icon: typeof CalendarDays }[] = [
  { id: 'dias', label: 'Dias & Teses', Icon: CalendarDays },
  { id: 'config', label: 'Configurações', Icon: Settings2 },
  { id: 'designer', label: 'Designer', Icon: Palette },
  { id: 'acessos', label: 'Acessos', Icon: Users },
  { id: 'medalhas', label: 'Medalhas', Icon: Medal },
  { id: 'ranking', label: 'Ranking', Icon: Trophy },
]

// Barra de abas do desafio (underline deslizante), navega por ?aba=.
export function JurisTabsBar({ desafioId, abaAtual }: { desafioId: string; abaAtual: JurisTab }) {
  const ref = useRef<HTMLDivElement>(null)
  const [ind, setInd] = useState<{ left: number; width: number }>({ left: 0, width: 0 })
  useEffect(() => {
    const medir = () => {
      const el = ref.current?.querySelector<HTMLElement>('[data-tab-ativo="1"]')
      if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth })
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [abaAtual])
  return (
    <div ref={ref} className="relative flex gap-8 overflow-x-auto border-b pl-1 text-sm">
      {TABS.map(({ id, label, Icon }) => (
        <Link key={id} data-tab-ativo={abaAtual === id ? '1' : '0'} href={`/admin/jurisprudencia?desafio=${desafioId}&aba=${id}`}
          className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-md py-2 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40',
            abaAtual === id ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>
          <Icon className="h-4 w-4" /> {label}
        </Link>
      ))}
      <span className="absolute bottom-[-1px] h-0.5 rounded-full bg-primary transition-all duration-300 ease-out" style={{ left: ind.left, width: ind.width }} />
    </div>
  )
}
