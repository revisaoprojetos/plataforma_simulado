'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Lock, SlidersHorizontal, Library, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'

// Abas do admin do Cronograma Adaptativo (sublinhado, padrão do projeto): Liberação · Metas & inteligência.
const TABS = [
  { href: '/admin/cronogramas/adaptativo', label: 'Liberação', icon: Lock },
  { href: '/admin/cronogramas/adaptativo/metas', label: 'Metas & inteligência', icon: SlidersHorizontal },
  { href: '/admin/cronogramas/adaptativo/catalogo', label: 'Catálogo de metas', icon: Library },
  { href: '/admin/cronogramas/adaptativo/definicoes', label: 'Definição e análise', icon: ListChecks },
]

export function AdaptativoTabs() {
  const pathname = usePathname()
  return (
    <div className="flex flex-wrap items-center gap-1 overflow-x-auto border-b">
      {TABS.map((t) => {
        const ativo = t.href === '/admin/cronogramas/adaptativo' ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + '/')
        const Icone = t.icon
        return (
          <Link key={t.href} href={t.href}
            className={cn('relative flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition',
              ativo ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <Icone className="h-4 w-4 shrink-0" />
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
