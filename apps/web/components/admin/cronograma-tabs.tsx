'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Package, Link2, Tag, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'

// Abas da seção Cronograma — usadas no catálogo E nas subpáginas (mesmo componente = sempre idênticas).
// Relatórios e Importar NÃO são abas (ficam na sidebar / botão do catálogo).
const TABS: { href: string; label: string; icon: typeof CalendarDays }[] = [
  { href: '/admin/cronogramas', label: 'Catálogo', icon: CalendarDays },
  { href: '/admin/cronogramas/pacotes', label: 'Grupos de acessos', icon: Package },
  { href: '/admin/cronogramas/links', label: 'Links de aula', icon: Link2 },
  { href: '/admin/cronogramas/tipos', label: 'Tipos de meta', icon: Tag },
  { href: '/admin/cronogramas/metas', label: 'Auditoria de metas', icon: ListChecks },
]

export function CronogramaTabs({ catalogoCount }: { catalogoCount?: number }) {
  const pathname = usePathname()
  const secoes = TABS.slice(1)
  const ativaSecao = secoes.find((t) => pathname === t.href || pathname.startsWith(t.href + '/'))

  return (
    <div className="-mb-px flex flex-wrap items-center gap-1 overflow-x-auto border-b">
      {TABS.map((t) => {
        const ativo = t.href === '/admin/cronogramas' ? !ativaSecao : t === ativaSecao
        const Icone = t.icon
        const n = t.href === '/admin/cronogramas' ? catalogoCount : undefined
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition',
              ativo ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icone className="h-4 w-4 shrink-0" />
            {t.label}
            {n != null && n > 0 && (
              <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums', ativo ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                {n.toLocaleString('pt-BR')}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
