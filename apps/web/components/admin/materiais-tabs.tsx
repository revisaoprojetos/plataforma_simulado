'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

// Sub-abas de "Materiais" (texto, sem ícone — como no designer).
const TABS: { label: string; href: string }[] = [
  { label: 'Aulas', href: '/admin/conteudos/materiais/aulas' },
  { label: 'Biblioteca', href: '/admin/conteudos/materiais/biblioteca' },
  { label: 'Banco de questões', href: '/admin/conteudos/materiais/questoes' },
  { label: 'Arquivos', href: '/admin/conteudos/materiais/arquivos' },
]

/** Sub-abas (tab de linha / sublinhado) da seção Materiais. */
export function MateriaisTabs() {
  const pathname = usePathname()
  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-1 overflow-x-auto border-b">
      {TABS.map((t) => {
        const ativo = pathname === t.href || pathname.startsWith(t.href + '/')
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              '-mb-px shrink-0 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[14px] tracking-[-0.01em] transition-colors',
              ativo
                ? 'border-primary font-extrabold text-foreground'
                : 'border-transparent font-semibold text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
