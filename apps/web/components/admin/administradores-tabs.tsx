'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

type IconType = React.ComponentType<{ className?: string }>
interface Tab { label: string; href: string; icon: IconType; exact?: boolean; soGerir?: boolean }

const TABS: Tab[] = [
  { label: 'Administradores', href: '/admin/administradores', icon: Users, exact: true, soGerir: true },
  { label: 'Permissões', href: '/admin/administradores/permissoes', icon: ShieldCheck },
]

/** Abas do módulo de acesso: equipe (Administradores) × cargos/liberações (Permissões). */
export function AdministradoresTabs({ podeGerir }: { podeGerir: boolean }) {
  const pathname = usePathname()
  const tabs = TABS.filter((t) => !t.soGerir || podeGerir)

  return (
    <div className="flex gap-1 border-b">
      {tabs.map((t) => {
        const ativo = t.exact ? pathname === t.href : pathname.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              '-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              ativo
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </Link>
        )
      })}
    </div>
  )
}
