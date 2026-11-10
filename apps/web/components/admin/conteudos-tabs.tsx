'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

// Abas de topo do Estúdio de Conteúdo (texto, sem ícone — como no designer). `match` acende a aba
// para TODA a subárea (ex.: "Materiais" fica ativa em qualquer /admin/conteudos/materiais/*).
const TABS: { label: string; href: string; match: string }[] = [
  { label: 'Produtos', href: '/admin/conteudos/produtos', match: '/admin/conteudos/produtos' },
  { label: 'Materiais', href: '/admin/conteudos/materiais/aulas', match: '/admin/conteudos/materiais' },
  { label: 'Vídeos', href: '/admin/conteudos/videos', match: '/admin/conteudos/videos' },
  { label: 'Flashcards', href: '/admin/conteudos/flashcards', match: '/admin/conteudos/flashcards' },
  { label: 'Trilhas', href: '/admin/conteudos/trilhas', match: '/admin/conteudos/trilhas' },
  { label: 'Oferta', href: '/admin/conteudos/ofertas', match: '/admin/conteudos/ofertas' },
  { label: 'Classificação', href: '/admin/conteudos/classificacao', match: '/admin/conteudos/classificacao' },
]

/** Abas (tab de linha / sublinhado) do shell do Estúdio de Conteúdo. */
export function ConteudosTabs() {
  const pathname = usePathname()
  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-1 overflow-x-auto border-b">
      {TABS.map((t) => {
        const ativo = pathname === t.match || pathname.startsWith(t.match + '/')
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
